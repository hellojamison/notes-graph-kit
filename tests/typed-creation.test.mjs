import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromTest = createRequire(import.meta.url);

function run(cwd, args) {
  return execFileSync('node', args, { cwd, encoding: 'utf8' });
}

function runFailure(cwd, args) {
  const result = spawnSync('node', args, { cwd, encoding: 'utf8' });
  assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

function installRepo(name) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `notes-graph-kit-${name}-`));
  run(kitRoot, [
    'install-notes-graph.cjs',
    '--repo', repoRoot,
    '--app', 'Smoke App',
    '--allow-non-git'
  ]);
  fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
  return repoRoot;
}

function parseFrontmatter(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${filePath} should have frontmatter`);
  return { text, frontmatter: yaml.load(match[1]) };
}

function createdRel(output) {
  const rel = output.match(/^Created (.+)$/m)?.[1];
  assert.ok(rel, output);
  return rel;
}

function snapshotTree(root) {
  const entries = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') {
        continue;
      }
      const entryPath = path.join(dir, entry.name);
      const rel = path.relative(root, entryPath).split(path.sep).join('/');
      const stat = fs.lstatSync(entryPath);
      if (stat.isDirectory()) {
        entries.push(`d:${rel}`);
        visit(entryPath);
      } else if (stat.isSymbolicLink()) {
        entries.push(`l:${rel}:${fs.readlinkSync(entryPath)}`);
      } else {
        entries.push(`f:${rel}:${stat.mode}:${fs.readFileSync(entryPath).toString('base64')}`);
      }
    }
  };
  visit(root);
  return entries.sort();
}

test('wikilink and malformed-link extraction ignore backtick and tilde fences', () => {
  const graph = requireFromTest(path.join(kitRoot, 'scripts/lib/project-notes-graph.cjs'));
  const source = [
    'Outside [[Apps/Smoke App|Smoke App]]',
    '```yaml',
    'related_apps:',
    '  - "[[Missing/In Scaffold|Ignored]]"',
    '  - "[[Malformed [Scaffold]]"',
    '```',
    '~~~md',
    '[[Missing Tilde Target]]',
    '[[Malformed [Tilde]]',
    '~~~',
    'Outside malformed [[Broken [Target]]',
    ''
  ].join('\n');

  assert.deepEqual(graph.extractWikilinkTargets(source), ['Apps/Smoke App']);
  assert.deepEqual(graph.findMalformedWikilinks(source), ['[[Broken [Target]]']);
  assert.deepEqual(
    graph.markdownLinesOutsideFences(source).map(({ line }) => line),
    [
      'Outside [[Apps/Smoke App|Smoke App]]',
      'Outside malformed [[Broken [Target]]',
      ''
    ]
  );
});

test('all templates are template notes with one parseable product scaffold', () => {
  const graph = requireFromTest(path.join(kitRoot, 'scripts/lib/project-notes-graph.cjs'));
  const expected = new Map([
    ['Task Note Template.md', ['task', 'active']],
    ['Evidence Template.md', ['evidence', 'open']],
    ['App Template.md', ['app', 'current']],
    ['Process Template.md', ['process', 'draft']],
    ['Runbook Template.md', ['runbook', 'draft']],
    ['Decision Record Template.md', ['decision', 'draft']],
    ['Incident Note Template.md', ['incident', 'active']],
    ['Release Note Template.md', ['release', 'draft']],
    ['Status Note Template.md', ['status', 'current']]
  ]);

  for (const [fileName, [productType, status]] of expected) {
    const filePath = path.join(kitRoot, 'Project Notes/Templates', fileName);
    const { text, frontmatter } = parseFrontmatter(filePath);
    assert.equal(frontmatter.type, 'template', fileName);
    assert.equal(frontmatter.status, 'active', fileName);
    assert.ok(frontmatter.tags.includes('template'), fileName);
    assert.ok(frontmatter.tags.includes('notes/template'), fileName);
    assert.equal(
      (text.match(/<!-- notes-graph-kit:scaffold:start -->/g) || []).length,
      1,
      fileName
    );
    assert.equal(
      (text.match(/<!-- notes-graph-kit:scaffold:end -->/g) || []).length,
      1,
      fileName
    );
    const scaffold = text.match(
      /<!-- notes-graph-kit:scaffold:start -->\n```yaml\n([\s\S]*?)\n```\n<!-- notes-graph-kit:scaffold:end -->/
    );
    assert.ok(scaffold, `${fileName} should contain one marked YAML scaffold`);
    const product = graph.loadFrontmatter(scaffold[1]);
    assert.equal(product.schema_version, 1, fileName);
    assert.equal(product.type, productType, fileName);
    assert.equal(product.status, status, fileName);
    assert.ok(Array.isArray(product.tags) && product.tags.length > 0, fileName);
    assert.deepEqual(product.related_apps, ['[[Apps/My Project|My Project]]'], fileName);
  }
});

test('notes:new instantiates all supported product types and routes new processes', () => {
  const repoRoot = installRepo('typed-new');
  try {
    const cases = [
      {
        type: 'process',
        title: 'Generated Process',
        expectedRel: 'Processes/Generated Process.md',
        status: 'draft'
      },
      {
        type: 'task',
        title: 'Generated Task',
        process: 'notes-graph-maintenance',
        prefix: 'Evidence/',
        status: 'active'
      },
      {
        type: 'evidence',
        title: 'Generated Evidence',
        process: 'notes-graph-maintenance',
        prefix: 'Evidence/',
        status: 'open'
      },
      {
        type: 'app',
        title: 'Generated App',
        expectedRel: 'Apps/Generated App.md',
        status: 'current'
      },
      {
        type: 'runbook',
        title: 'Generated Runbook',
        process: 'generated-process',
        expectedRel: 'Runbooks/Generated Runbook.md',
        status: 'draft'
      },
      {
        type: 'decision',
        title: 'Generated Decision',
        process: 'generated-process',
        expectedRel: 'Decisions/Generated Decision.md',
        status: 'draft'
      },
      {
        type: 'incident',
        title: 'Generated Incident',
        process: 'generated-process',
        expectedRel: 'Incidents/Generated Incident.md',
        status: 'active'
      },
      {
        type: 'release',
        title: 'Generated Release',
        process: 'generated-process',
        expectedRel: 'Releases/Generated Release.md',
        status: 'draft'
      },
      {
        type: 'status',
        title: 'Generated Status',
        process: 'generated-process',
        expectedRel: 'Status/Generated Status.md',
        status: 'current'
      }
    ];

    for (const item of cases) {
      const args = [
        'scripts/project-notes.cjs', 'new',
        '--type', item.type,
        '--title', item.title,
        '--summary', `Create ${item.type}.`
      ];
      if (item.process) {
        args.push('--process', item.process);
      }
      const output = run(repoRoot, args);
      const rel = createdRel(output);
      if (item.expectedRel) {
        assert.equal(rel, item.expectedRel);
      } else {
        assert.ok(rel.startsWith(item.prefix), rel);
        assert.match(path.basename(rel), /^\d{4}-\d{2}-\d{2} /);
      }
      const generated = parseFrontmatter(path.join(repoRoot, 'Project Notes', rel));
      assert.equal(generated.frontmatter.title, item.title);
      assert.equal(generated.frontmatter.type, item.type);
      assert.equal(generated.frontmatter.status, item.status);
      assert.match(generated.frontmatter.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(Array.isArray(generated.frontmatter.tags));
      assert.equal(generated.frontmatter.confidence, 'medium');
      assert.equal(
        Object.prototype.hasOwnProperty.call(generated.frontmatter, 'last_verified'),
        item.type === 'status'
      );
      assert.equal(generated.frontmatter.source_of_truth, item.type === 'status');
      assert.equal(generated.frontmatter.related_apps.length, 1);
      assert.equal(generated.frontmatter.related_processes.length, item.process ? 1 : 0);
      assert.match(generated.text, new RegExp(`# ${item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      assert.match(generated.text, new RegExp(`Create ${item.type}\\.`));
      assert.doesNotMatch(generated.text, /notes-graph-kit:scaffold/);
    }

    const config = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'notes-graph.config.json'), 'utf8')
    );
    assert.deepEqual(
      config.routes.find((route) => route.id === 'generated-process'),
      {
        id: 'generated-process',
        processRel: 'Processes/Generated Process.md',
        aliases: ['Generated Process']
      }
    );
    for (const query of [
      ['generated-process', /Generated Process/],
      ['Processes/Generated Process', /Generated Process/],
      ['work on the generated process', /Generated Process/]
    ]) {
      assert.match(
        run(repoRoot, ['scripts/project-notes.cjs', 'route', query[0]]),
        query[1]
      );
    }
    assert.match(
      run(repoRoot, ['scripts/validate-project-notes-graph.cjs']),
      /validation passed with 0 warning\(s\)/
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('notes:new rejects bad scaffolds and route collisions without changing files', () => {
  const repoRoot = installRepo('typed-new-failures');
  try {
    const taskTemplate = path.join(repoRoot, 'Project Notes/Templates/Task Note Template.md');
    const originalTemplate = fs.readFileSync(taskTemplate, 'utf8');
    const cases = [
      {
        name: 'missing scaffold',
        mutate: (text) => text.replace(
          /<!-- notes-graph-kit:scaffold:start -->[\s\S]*?<!-- notes-graph-kit:scaffold:end -->/,
          ''
        ),
        pattern: /scaffold/i
      },
      {
        name: 'duplicate scaffold',
        mutate: (text) => {
          const block = text.match(
            /<!-- notes-graph-kit:scaffold:start -->[\s\S]*?<!-- notes-graph-kit:scaffold:end -->/
          )?.[0];
          return `${text}\n${block}\n`;
        },
        pattern: /scaffold/i
      },
      {
        name: 'malformed scaffold',
        mutate: (text) => {
          const first = text.indexOf('schema_version: 1');
          const second = text.indexOf('schema_version: 1', first + 1);
          return `${text.slice(0, second)}schema_version: [${text.slice(second + 'schema_version: 1'.length)}`;
        },
        pattern: /scaffold|YAML/i
      },
      {
        name: 'wrong scaffold type',
        mutate: (text) => text.replace(/\ntype: task\n/, '\ntype: evidence\n'),
        pattern: /type/i
      }
    ];

    for (const item of cases) {
      fs.writeFileSync(taskTemplate, item.mutate(originalTemplate));
      const before = snapshotTree(repoRoot);
      const output = runFailure(repoRoot, [
        'scripts/project-notes.cjs', 'new',
        '--type', 'task',
        '--title', `Failure ${item.name}`,
        '--process', 'notes-graph-maintenance'
      ]);
      assert.match(output, item.pattern);
      assert.deepEqual(snapshotTree(repoRoot), before, item.name);
      fs.writeFileSync(taskTemplate, originalTemplate);
    }

    for (const title of ['Notes Graph Maintenance', 'Notes']) {
      const before = snapshotTree(repoRoot);
      const output = runFailure(repoRoot, [
        'scripts/project-notes.cjs', 'new',
        '--type', 'process',
        '--title', title
      ]);
      assert.match(output, /duplicate|collision|route|process/i);
      assert.deepEqual(snapshotTree(repoRoot), before, title);
    }

    const configPath = path.join(repoRoot, 'notes-graph.config.json');
    const originalConfig = fs.readFileSync(configPath, 'utf8');
    const idCollisionConfig = JSON.parse(originalConfig);
    idCollisionConfig.routes.push({
      id: 'id-collision',
      processRel: 'Processes/Notes Graph Maintenance.md',
      aliases: ['different alias']
    });
    fs.writeFileSync(configPath, `${JSON.stringify(idCollisionConfig, null, 2)}\n`);
    let before = snapshotTree(repoRoot);
    let output = runFailure(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--type', 'process',
      '--title', 'ID Collision'
    ]);
    assert.match(output, /route id collides/i);
    assert.deepEqual(snapshotTree(repoRoot), before, 'route id collision');
    fs.writeFileSync(configPath, originalConfig);

    const pathCollision = path.join(repoRoot, 'Project Notes/Processes/Path Collision.md');
    fs.writeFileSync(pathCollision, [
      '---',
      'title: Different Process Path Holder',
      'schema_version: 1',
      'type: process',
      'status: draft',
      'date: 2026-07-28',
      'tags:',
      '  - notes/process',
      'related_apps:',
      '  - "[[Apps/Smoke App|Smoke App]]"',
      '---',
      '',
      '# Different Process Path Holder',
      ''
    ].join('\n'));
    before = snapshotTree(repoRoot);
    output = runFailure(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--type', 'process',
      '--title', 'Path: Collision'
    ]);
    assert.match(output, /note already exists/i);
    assert.deepEqual(snapshotTree(repoRoot), before, 'process path collision');

    fs.rmSync(pathCollision);
    const invalidTargetConfig = JSON.parse(originalConfig);
    invalidTargetConfig.routes.push({
      id: 'missing-target',
      processRel: 'Processes/Missing Target.md',
      aliases: ['missing target']
    });
    fs.writeFileSync(configPath, `${JSON.stringify(invalidTargetConfig, null, 2)}\n`);
    before = snapshotTree(repoRoot);
    output = runFailure(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--type', 'process',
      '--title', 'Prospective Config Check'
    ]);
    assert.match(output, /must target an existing process note/i);
    assert.deepEqual(snapshotTree(repoRoot), before, 'invalid prospective route target');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('draft graph notes are warning-exempt until promoted', () => {
  const repoRoot = installRepo('draft-warnings');
  try {
    const output = run(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--type', 'process',
      '--title', 'Draft Process'
    ]);
    const rel = createdRel(output);
    assert.doesNotMatch(output, /^Updated \d{4}-\d{2}-\d{2}\.md$/m);
    assert.match(
      run(repoRoot, ['scripts/validate-project-notes-graph.cjs']),
      /validation passed with 0 warning\(s\)/
    );

    const notePath = path.join(repoRoot, 'Project Notes', rel);
    fs.writeFileSync(
      notePath,
      fs.readFileSync(notePath, 'utf8').replace('status: draft', 'status: current')
    );
    const result = spawnSync(
      'node',
      ['scripts/validate-project-notes-graph.cjs'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    const combined = `${result.stdout}${result.stderr}`;
    assert.match(combined, /process note has no inbound links/);
    assert.match(combined, /process note has no related_runbooks/);
    assert.match(combined, /process note has no related_decisions/);
    assert.match(combined, /process note has no related_evidence/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('template links do not satisfy typed resolution or inbound requirements', () => {
  const repoRoot = installRepo('template-isolation');
  try {
    const graphLib = requireFromTest(
      path.join(repoRoot, 'scripts/lib/project-notes-graph.cjs')
    );
    const vaultRoot = path.join(repoRoot, 'Project Notes');
    const templatePath = path.join(vaultRoot, 'Templates/Runbook Template.md');
    fs.writeFileSync(
      templatePath,
      fs.readFileSync(templatePath, 'utf8').replace('type: template', 'type: runbook')
    );

    let graph = graphLib.loadVaultGraph({ vaultRoot });
    assert.equal(
      graphLib.resolveTarget('Templates/Runbook Template', graph.index),
      'Templates/Runbook Template.md'
    );
    assert.equal(
      graphLib.resolveNoteInput('Templates/Runbook Template', graph, 'runbook'),
      null
    );
    assert.equal(graphLib.resolveNoteInput('Runbook Template', graph, 'runbook'), null);

    const processTemplatePath = path.join(vaultRoot, 'Templates/Process Template.md');
    fs.writeFileSync(
      processTemplatePath,
      fs.readFileSync(processTemplatePath, 'utf8').replace('type: template', 'type: process')
    );
    graph = graphLib.loadVaultGraph({ vaultRoot });
    const templateRouteDefinitions = [{
      id: 'template-route',
      processRel: 'Templates/Process Template.md',
      aliases: ['template route']
    }];
    assert.match(
      graphLib.validateRouteDefinitions(
        templateRouteDefinitions,
        graph,
        { requireExistingProcessTargets: true }
      ).join('\n'),
      /template.*notes:new/i
    );
    assert.match(
      graphLib.buildRoute('template-route', {
        graph,
        routeDefinitions: templateRouteDefinitions
      }).error,
      /missing or non-process/i
    );

    const runbookPath = path.join(vaultRoot, 'Runbooks/Real Runbook.md');
    fs.writeFileSync(runbookPath, [
      '---',
      'title: Real Runbook',
      'schema_version: 1',
      'type: runbook',
      'status: current',
      'date: 2026-07-28',
      'tags:',
      '  - notes/runbook',
      'related_apps:',
      '  - "[[Apps/Smoke App|Smoke App]]"',
      '---',
      '',
      '# Real Runbook',
      ''
    ].join('\n'));
    fs.writeFileSync(path.join(vaultRoot, 'Evidence/Fenced Source.md'), [
      '---',
      'title: Fenced Source',
      'schema_version: 1',
      'type: task',
      'status: active',
      'date: 2026-07-28',
      'tags:',
      '  - notes/task',
      'related_apps:',
      '  - "[[Apps/Smoke App|Smoke App]]"',
      '---',
      '',
      '# Fenced Source',
      '',
      '```yaml',
      'related_runbooks:',
      '  - "[[Runbooks/Real Runbook|Real Runbook]]"',
      'broken: "[[Malformed [Inside Fence]]"',
      '```',
      ''
    ].join('\n'));

    let result = spawnSync(
      'node',
      ['scripts/validate-project-notes-graph.cjs'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(`${result.stdout}${result.stderr}`, /Real Runbook\.md: runbook note has no inbound links/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /Malformed/);

    fs.appendFileSync(
      path.join(vaultRoot, 'Evidence/Fenced Source.md'),
      '\nOutside link: [[Runbooks/Real Runbook|Real Runbook]]\n'
    );
    result = spawnSync(
      'node',
      ['scripts/validate-project-notes-graph.cjs'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /Real Runbook\.md: runbook note has no inbound links/);

    const processPath = path.join(vaultRoot, 'Processes/Notes Graph Maintenance.md');
    fs.writeFileSync(
      processPath,
      fs.readFileSync(processPath, 'utf8').replace(
        /related_runbooks:\n(?:  - .+\n)+/,
        'related_runbooks:\n  - "[[Templates/Runbook Template|Runbook Template]]"\n'
      )
    );
    result = spawnSync(
      'node',
      ['scripts/validate-project-notes-graph.cjs'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /template.*notes:new|notes:new.*template/i);

    graph = graphLib.loadVaultGraph({ vaultRoot });
    const route = graphLib.buildRoute('notes-graph-maintenance', {
      graph,
      routeDefinitions: JSON.parse(
        fs.readFileSync(path.join(repoRoot, 'notes-graph.config.json'), 'utf8')
      ).routes
    });
    assert.deepEqual(route.runbookRels, []);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('closeout certification is explicit and invalid syntax is non-mutating', () => {
  const repoRoot = installRepo('certify');
  try {
    const makeTask = (title) => createdRel(run(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--type', 'task',
      '--title', title,
      '--process', 'notes-graph-maintenance'
    ]));
    const close = (rel, certify = false) => run(repoRoot, [
      'scripts/project-notes.cjs', 'closeout',
      '--note', path.join('Project Notes', rel),
      '--working', 'Closeout works.',
      '--verified', 'Tests passed.',
      '--not-verified', 'Obsidian rendering.',
      ...(certify ? ['--certify'] : [])
    ]);

    const doneRel = makeTask('Done Closeout');
    close(doneRel);
    assert.equal(
      parseFrontmatter(path.join(repoRoot, 'Project Notes', doneRel)).frontmatter.status,
      'done'
    );

    const verifiedRel = makeTask('Certified Closeout');
    const closeOutput = close(verifiedRel, true);
    assert.equal(
      parseFrontmatter(path.join(repoRoot, 'Project Notes', verifiedRel)).frontmatter.status,
      'verified'
    );
    const dailyRel = closeOutput.match(/^Updated (.+)$/m)?.[1];
    assert.ok(dailyRel, closeOutput);
    assert.match(
      fs.readFileSync(path.join(repoRoot, 'Project Notes', dailyRel), 'utf8'),
      /Closeout works\. — \[\[Evidence\//
    );

    const invalidRel = makeTask('Invalid Certification');
    const before = snapshotTree(repoRoot);
    assert.match(
      runFailure(repoRoot, [
        'scripts/project-notes.cjs', 'closeout',
        '--note', path.join('Project Notes', invalidRel),
        '--working', 'Should not write.',
        '--verified', 'Nothing.',
        '--not-verified', 'Everything.',
        '--certify=false'
      ]),
      /--certify does not take a value/
    );
    assert.deepEqual(snapshotTree(repoRoot), before);

    const base = yaml.load(
      fs.readFileSync(
        path.join(repoRoot, 'Project Notes/Dashboards/Notes Review.base'),
        'utf8'
      )
    );
    const verifiedFacts = base.views.find((view) => view.name === 'Verified Facts');
    assert.deepEqual(verifiedFacts.filters.or, [
      'status == "verified"',
      'type == "known-good"'
    ]);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('a phase closeout atomically updates its process Status note', () => {
  const repoRoot = installRepo('status-closeout');
  try {
    const statusRel = createdRel(run(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--type', 'status',
      '--title', 'Notes Graph Maintenance Status',
      '--process', 'notes-graph-maintenance',
      '--summary', 'Phase 0.13 implementation.'
    ]));
    assert.equal(statusRel, 'Status/Notes Graph Maintenance Status.md');
    const routeOutput = run(repoRoot, [
      'scripts/project-notes.cjs', 'route', 'notes-graph-maintenance'
    ]);
    assert.match(routeOutput, /Status:\n- \[\[Status\/Notes Graph Maintenance Status\|Notes Graph Maintenance Status\]\]/);

    const taskRel = createdRel(run(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--type', 'task',
      '--title', 'Status Phase Closeout',
      '--process', 'notes-graph-maintenance'
    ]));
    const decisionRel = createdRel(run(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--type', 'decision',
      '--title', 'Status Ownership Decision',
      '--process', 'notes-graph-maintenance'
    ]));
    const output = run(repoRoot, [
      'scripts/project-notes.cjs', 'closeout',
      '--note', path.join('Project Notes', taskRel),
      '--working', 'Status updates with the closeout.',
      '--verified', 'Focused lifecycle assertions passed.',
      '--not-verified', 'Obsidian rendering.',
      '--status', path.join('Project Notes', statusRel),
      '--phase', 'Phase 0.14 ready',
      '--certified', 'The current-state note is updated atomically.',
      '--open-item', 'consumer-rollout: Consumer rollout remains open.',
      '--settled', 'One Status note belongs to one process.',
      '--decision', path.join('Project Notes', decisionRel)
    ]);
    assert.match(output, new RegExp(`Updated ${statusRel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    const statusText = fs.readFileSync(path.join(repoRoot, 'Project Notes', statusRel), 'utf8');
    const statusFrontmatter = parseFrontmatter(path.join(repoRoot, 'Project Notes', statusRel)).frontmatter;
    assert.equal(statusFrontmatter.type, 'status');
    assert.equal(statusFrontmatter.status, 'current');
    assert.equal(statusFrontmatter.source_of_truth, true);
    assert.match(statusText, /## Current Phase\n\nPhase 0\.14 ready/);
    assert.match(statusText, /## Certified\n\n- The current-state note is updated atomically\./);
    assert.match(statusText, /## Open Items[\s\S]*id: consumer-rollout[\s\S]*summary: Consumer rollout remains open\./);
    assert.match(statusText, /## Settled Verdicts\n\n- \[\[Decisions\/Status Ownership Decision\|Status Ownership Decision\]\]: One Status note belongs to one process\./);
    assert.match(statusText, new RegExp(`\\[\\[${taskRel.replace(/\.md$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\|Status Phase Closeout\\]\\]`));

    const beforeDuplicate = snapshotTree(repoRoot);
    assert.match(
      runFailure(repoRoot, [
        'scripts/project-notes.cjs', 'new',
        '--type', 'status',
        '--title', 'Duplicate Status',
        '--process', 'notes-graph-maintenance'
      ]),
      /already has a Status note/
    );
    assert.deepEqual(snapshotTree(repoRoot), beforeDuplicate);

    const secondTask = createdRel(run(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--type', 'task',
      '--title', 'Partial Status Arguments',
      '--process', 'notes-graph-maintenance'
    ]));
    const beforePartial = snapshotTree(repoRoot);
    assert.match(
      runFailure(repoRoot, [
        'scripts/project-notes.cjs', 'closeout',
        '--note', path.join('Project Notes', secondTask),
        '--working', 'Should not write.',
        '--verified', 'Nothing.',
        '--not-verified', 'Everything.',
        '--status', path.join('Project Notes', statusRel)
      ]),
      /Status update requires/
    );
    assert.deepEqual(snapshotTree(repoRoot), beforePartial);
    assert.match(
      run(repoRoot, ['scripts/validate-project-notes-graph.cjs']),
      /validation passed with 0 warning\(s\)/
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
