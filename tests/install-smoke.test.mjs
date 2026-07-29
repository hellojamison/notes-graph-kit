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
  const adjustedArgs = args[0] === 'install-notes-graph.cjs'
    && !args.includes('--allow-non-git')
    ? [...args, '--allow-non-git']
    : args;
  return execFileSync('node', adjustedArgs, { cwd, encoding: 'utf8' });
}

function runRaw(cwd, args) {
  return execFileSync('node', args, { cwd, encoding: 'utf8' });
}

function runCaptured(cwd, args) {
  const result = spawnSync('node', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

function commandOutput(error) {
  return `${error.stdout || ''}${error.stderr || ''}${error.message}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertValidateFails(repoRoot, pattern) {
  let failure = null;
  try {
    run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
  } catch (error) {
    failure = error;
  }
  assert.ok(failure, 'validation should fail');
  assert.match(commandOutput(failure), pattern);
}

function listFiles(root, dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(root, entryPath);
    }
    return path.relative(root, entryPath).split(path.sep).join('/');
  });
}

function readFrontmatter(rel) {
  const text = fs.readFileSync(path.join(kitRoot, rel), 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${rel} should have frontmatter`);
  return yaml.load(match[1]);
}

function readRepoFrontmatter(repoRoot, rel) {
  const text = fs.readFileSync(path.join(repoRoot, 'Project Notes', rel), 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${rel} should have frontmatter`);
  return yaml.load(match[1]);
}

function dateOnly(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function snapshotTree(root) {
  const entries = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
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
  }
  visit(root);
  return entries.sort();
}

test('template frontmatter identifies every source file as a template', () => {
  const expectedTypes = {
    'Project Notes/Templates/App Template.md': 'template',
    'Project Notes/Templates/Process Template.md': 'template',
    'Project Notes/Templates/Runbook Template.md': 'template',
    'Project Notes/Templates/Evidence Template.md': 'template',
    'Project Notes/Templates/Task Note Template.md': 'template',
    'Project Notes/Templates/Decision Record Template.md': 'template',
    'Project Notes/Templates/Incident Note Template.md': 'template',
    'Project Notes/Templates/Release Note Template.md': 'template'
  };

  for (const [rel, expectedType] of Object.entries(expectedTypes)) {
    const frontmatter = readFrontmatter(rel);
    assert.equal(frontmatter.type, expectedType, rel);
    assert.equal(frontmatter.status, 'active', rel);
    assert.ok(frontmatter.tags.includes('template'), rel);
    assert.ok(frontmatter.tags.includes('notes/template'), rel);
    assert.ok(!Object.prototype.hasOwnProperty.call(frontmatter, 'last_verified'), rel);
  }
  assert.match(
    fs.readFileSync(path.join(kitRoot, 'Project Notes/Templates/Task Note Template.md'), 'utf8'),
    /^## Graph Links$/m
  );
});

test('note index resolves explicit paths and rejects wrong or ambiguous basenames deterministically', () => {
  const graphLib = requireFromTest(path.join(kitRoot, 'scripts/lib/project-notes-graph.cjs'));
  const vaultRoot = path.join(os.tmpdir(), 'notes-graph-kit-resolver-vault');
  const filePaths = [
    path.join(vaultRoot, 'Templates/_README.md'),
    path.join(vaultRoot, 'Processes/Unique Process.md'),
    path.join(vaultRoot, 'Dashboards/_README.md'),
    path.join(vaultRoot, 'Shared.md'),
    path.join(vaultRoot, 'Evidence/Shared.md')
  ];
  const index = graphLib.buildNoteIndex(filePaths, vaultRoot);

  assert.deepEqual(index.byBasename.get('_readme'), [
    'Dashboards/_README.md',
    'Templates/_README.md'
  ]);
  assert.deepEqual(graphLib.resolveTargetDetailed('Dashboards/_README', index), {
    status: 'resolved',
    rel: 'Dashboards/_README.md',
    via: 'path',
    candidates: ['Dashboards/_README.md']
  });
  assert.deepEqual(graphLib.resolveTargetDetailed('Wrong/_README', index), {
    status: 'missing',
    candidates: []
  });
  assert.deepEqual(graphLib.resolveTargetDetailed('Unique Process', index), {
    status: 'resolved',
    rel: 'Processes/Unique Process.md',
    via: 'basename',
    candidates: ['Processes/Unique Process.md']
  });
  assert.deepEqual(graphLib.resolveTargetDetailed('_README', index), {
    status: 'ambiguous',
    candidates: ['Dashboards/_README.md', 'Templates/_README.md']
  });
  assert.equal(graphLib.resolveTarget('_README', index), null);
  assert.deepEqual(graphLib.resolveTargetDetailed('Shared', index), {
    status: 'ambiguous',
    candidates: ['Evidence/Shared.md', 'Shared.md']
  });

  const graph = {
    index,
    notes: [
      {
        rel: 'Processes/One/Shared.md',
        frontmatter: { title: 'Shared', type: 'process' }
      },
      {
        rel: 'Processes/Two/Shared.md',
        frontmatter: { title: 'Shared', type: 'process' }
      }
    ]
  };
  graph.index = graphLib.buildNoteIndex(
    graph.notes.map((note) => path.join(vaultRoot, note.rel)),
    vaultRoot
  );
  graph.noteByRel = new Map(graph.notes.map((note) => [note.rel, note]));
  assert.equal(graphLib.resolveNoteInput('Shared', graph, 'process'), null);
  assert.equal(
    graphLib.resolveNoteInput('Processes/One/Shared', graph, 'process'),
    'Processes/One/Shared.md'
  );

  const templateGraph = {
    notes: [
      {
        rel: 'Templates/Legacy Product.md',
        frontmatter: { title: 'Runbook Template', type: 'runbook' }
      },
      {
        rel: 'Runbooks/Real Runbook.md',
        frontmatter: { title: 'Real Runbook', type: 'runbook' }
      }
    ]
  };
  templateGraph.index = graphLib.buildNoteIndex(
    templateGraph.notes.map((note) => path.join(vaultRoot, note.rel)),
    vaultRoot
  );
  templateGraph.noteByRel = new Map(
    templateGraph.notes.map((note) => [note.rel, note])
  );
  assert.equal(
    graphLib.resolveNoteInput('Templates/Legacy Product', templateGraph, null),
    null,
    'explicit template paths must not resolve without an expected type'
  );
  assert.equal(
    graphLib.resolveNoteInput('Legacy Product', templateGraph, null),
    null,
    'template basenames must not resolve without an expected type'
  );
  assert.equal(
    graphLib.resolveNoteInput('Runbook Template', templateGraph, null),
    null,
    'template titles must not resolve without an expected type'
  );
  assert.equal(
    graphLib.resolveNoteInput('Real Runbook', templateGraph, null),
    'Runbooks/Real Runbook.md',
    'non-template notes should still resolve without an expected type'
  );
});

test('fallback routes are skeleton-valid and alias matching is deterministic', () => {
  const graphLib = requireFromTest(path.join(kitRoot, 'scripts/lib/project-notes-graph.cjs'));
  assert.deepEqual(
    graphLib.defaultRouteDefinitions.map((definition) => definition.id),
    ['notes-graph-maintenance']
  );
  assert.equal(graphLib.findRouteDefinition('release', graphLib.defaultRouteDefinitions), null);

  const definitions = [
    {
      id: 'z-route',
      processRel: 'Processes/Zeta.md',
      aliases: ['shared', 'review app']
    },
    {
      id: 'a-route',
      processRel: 'Processes/Alpha.md',
      aliases: ['shared', 'app']
    }
  ];
  const ambiguous = graphLib.findRouteDefinitionDetailed('review the app', definitions);
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.via, 'alias');
  assert.deepEqual(ambiguous.candidates.map((candidate) => candidate.id), ['a-route', 'z-route']);
  assert.equal(graphLib.findRouteDefinition('review the app', definitions), null);
  const exact = graphLib.findRouteDefinitionDetailed('z-route', definitions);
  assert.equal(exact.status, 'resolved');
  assert.equal(exact.via, 'id');
  assert.equal(exact.definition.id, 'z-route');

  const pathCollisionDefinitions = [
    {
      id: 'path-route',
      processRel: 'Processes/Foo.md',
      aliases: []
    },
    {
      id: 'name-route',
      processRel: 'Processes/Processes Foo.md',
      aliases: []
    }
  ];
  const exactPath = graphLib.findRouteDefinitionDetailed(
    'Processes/Foo',
    pathCollisionDefinitions
  );
  assert.equal(exactPath.status, 'resolved');
  assert.equal(exactPath.via, 'process-path');
  assert.equal(exactPath.definition.id, 'path-route');

  assert.deepEqual(
    graphLib.validateRouteDefinitions(definitions),
    ['route aliases normalize to duplicate "shared": route "a-route", route "z-route"']
  );
});

test('starter Active Work Base uses explicit open statuses, operational types, and ordered columns', () => {
  const base = yaml.load(
    fs.readFileSync(path.join(kitRoot, 'Project Notes/Bases/Active Work.base'), 'utf8')
  );
  const activeWork = base.views.find((view) => view.name === 'Active Work');
  assert.ok(activeWork);
  assert.deepEqual(activeWork.filters.and[0].or, [
    'status == "draft"',
    'status == "active"',
    'status == "in-progress"',
    'status == "blocked"',
    'status == "partial"',
    'status == "investigating"',
    'status == "fixed-uncommitted"'
  ]);
  assert.deepEqual(activeWork.filters.and[1].or, [
    'type == "task"',
    'type == "evidence"',
    'type == "incident"',
    'type == "decision"',
    'type == "release"',
    'type == "audit"'
  ]);
  assert.deepEqual(activeWork.order, [
    'file.name',
    'type',
    'status',
    'area',
    'last_verified'
  ]);
});

test('all shipped note dashboards exclude Templates globally', () => {
  const simpleBaseRels = [
    'Project Notes/Bases/Active Work.base',
    'Project Notes/Bases/Decisions.base',
    'Project Notes/Bases/Incidents.base',
    'Project Notes/Bases/Runbooks.base'
  ];
  for (const rel of simpleBaseRels) {
    const base = yaml.load(fs.readFileSync(path.join(kitRoot, rel), 'utf8'));
    assert.deepEqual(base.filters, {
      not: ['file.inFolder("Templates")']
    }, rel);
  }
  const notesReview = yaml.load(
    fs.readFileSync(path.join(kitRoot, 'Project Notes/Dashboards/Notes Review.base'), 'utf8')
  );
  assert.ok(notesReview.filters.and.includes('file.ext == "md"'));
  assert.ok(notesReview.filters.and.includes('schema_version == 1'));
  assert.deepEqual(
    notesReview.filters.and.find((entry) => entry && typeof entry === 'object' && entry.not),
    { not: ['file.inFolder("Templates")'] }
  );
});

test('install, route, new, closeout, validate in a scaffolded repo', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-'));
  try {
    const installOutput = run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App',
      '--vault', 'Project Notes'
    ]);
    assert.match(installOutput, /Installed notes graph kit/);
    assert.match(installOutput, /AGENTS\.md/);
    assert.ok(fs.existsSync(path.join(repoRoot, 'scripts/project-notes.cjs')));
    assert.ok(fs.existsSync(path.join(repoRoot, 'Project Notes/Apps/Smoke App.md')));
    assert.ok(fs.existsSync(path.join(repoRoot, 'Project Notes/Notes System.md')));
    for (const folder of ['Decisions', 'Incidents', 'Releases', 'Runbooks', 'Known-Good']) {
      assert.ok(
        fs.existsSync(path.join(repoRoot, 'Project Notes', folder, '_README.md')),
        `${folder}/_README.md should be installed`
      );
    }
    assert.equal(
      listFiles(path.join(repoRoot, 'Project Notes')).some((rel) =>
        /^\d{4}-\d{2}-\d{2}\.md$/.test(rel)
        || /^Evidence\/\d{4}-\d{2}-\d{2} .+\.md$/.test(rel)
      ),
      false
    );
    const installedMarkdown = listFiles(path.join(repoRoot, 'Project Notes'))
      .filter((rel) => rel.endsWith('.md'));
    for (const rel of installedMarkdown) {
      assert.equal(
        readRepoFrontmatter(repoRoot, rel).schema_version,
        1,
        `${rel} should use schema_version 1`
      );
    }

    const agentsMd = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentsMd, /## Project Notes Graph/);
    assert.match(agentsMd, /Apps\/Smoke App\.md/);
    assert.match(agentsMd, /npm run notes:route/);
    assert.match(agentsMd, /Optional agent skills/);
    assert.match(agentsMd, /obsidian-bases/);
    assert.match(agentsMd, /repo-local npm helpers and validator are the source of truth/);

    const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'notes-graph.config.json'), 'utf8'));
    assert.equal(config.appName, 'Smoke App');
    assert.ok(config.kitVersion);

    const appNote = fs.readFileSync(path.join(repoRoot, 'Project Notes/Apps/Smoke App.md'), 'utf8');
    assert.ok(!appNote.includes('My Project'), 'placeholder app name should be replaced');
    const templatesIndex = fs.readFileSync(
      path.join(repoRoot, 'Project Notes/Templates/_README.md'),
      'utf8'
    );
    for (const templateName of [
      'Task Note Template',
      'App Template',
      'Process Template',
      'Runbook Template',
      'Evidence Template',
      'Decision Record Template',
      'Incident Note Template',
      'Release Note Template'
    ]) {
      assert.match(templatesIndex, new RegExp(`\\[\\[${templateName}\\]\\]`));
    }

    const activeWorkBase = fs.readFileSync(path.join(repoRoot, 'Project Notes/Bases/Active Work.base'), 'utf8');
    assert.match(activeWorkBase, /order:\n\s+- file\.name\n\s+- type\n\s+- status/);

    // Reuse the kit's node_modules so the smoke test stays offline.
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));

    const routeOutput = run(repoRoot, ['scripts/project-notes.cjs', 'route', 'notes graph']);
    assert.match(routeOutput, /Notes Graph Maintenance/);

    const newOutput = run(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--title', 'Install smoke test',
      '--process', 'notes-graph-maintenance',
      '--summary', 'Verify scaffolded workflow.'
    ]);
    const createdRel = newOutput.match(/^Created (.+)$/m)?.[1];
    assert.ok(createdRel, `expected created note path in output: ${newOutput}`);

    const closeoutOutput = run(repoRoot, [
      'scripts/project-notes.cjs', 'closeout',
      '--note', path.join('Project Notes', createdRel),
      '--working', 'Scaffold works.',
      '--verified', 'route/new/closeout ran.',
      '--not-verified', 'Long-term usage.'
    ]);
    assert.match(closeoutOutput, /^Closed /m);

    const validateOutput = run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    assert.match(validateOutput, /validation passed/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('validator reports Base schema problems without requiring order', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-base-schema-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
    const basePath = path.join(repoRoot, 'Project Notes/Bases/Active Work.base');

    fs.writeFileSync(basePath, 'views:\n  - type: [\n');
    assertValidateFails(repoRoot, /invalid Base YAML/);

    fs.writeFileSync(basePath, '{}\n');
    assertValidateFails(repoRoot, /views must be a non-empty array/);

    fs.writeFileSync(basePath, 'views: {}\n');
    assertValidateFails(repoRoot, /views must be a non-empty array/);

    fs.writeFileSync(basePath, [
      'views:',
      '  - type: timeline',
      '    name: Bad View',
      ''
    ].join('\n'));
    assertValidateFails(repoRoot, /views\[0\]\.type must be one of table, cards, list, or map/);

    fs.writeFileSync(basePath, [
      'views:',
      '  - type: table',
      '    name: Bad Formula',
      '    order:',
      '      - file.name',
      '      - formula.missing',
      ''
    ].join('\n'));
    assertValidateFails(repoRoot, /views\[0\]\.order\[1\] references undefined formula\.missing/);

    fs.writeFileSync(basePath, [
      'properties:',
      '  formula.missing:',
      '    displayName: Missing',
      'views:',
      '  - type: table',
      '    name: Bad Property Formula',
      ''
    ].join('\n'));
    assertValidateFails(repoRoot, /properties references undefined formula\.missing/);

    fs.writeFileSync(basePath, [
      'views:',
      '  - type: table',
      '    name: Simple Legacy View',
      '    filters:',
      '      and:',
      '        - type == "task"',
      ''
    ].join('\n'));
    const validateOutput = run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    assert.match(validateOutput, /validation passed/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('install rejects vault paths that would escape the target repo', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-traversal-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const outsideRoot = path.join(tempRoot, 'outside');
  fs.mkdirSync(repoRoot);
  try {
    assert.throws(
      () => run(kitRoot, [
        'install-notes-graph.cjs',
        '--repo', repoRoot,
        '--app', 'Smoke App',
        '--vault', '../outside'
      ]),
      /simple directory name/
    );
    assert.ok(!fs.existsSync(outsideRoot), 'installer should not write outside repoRoot');
    assert.deepEqual(fs.readdirSync(repoRoot), []);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('installer rejects dangerous boolean values and unknown options before writing', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-options-'));
  try {
    assert.throws(
      () => run(kitRoot, ['install-notes-graph.cjs', '--repo', repoRoot, '--app', 'Smoke App', '--force=false']),
      /--force does not take a value/
    );
    assert.throws(
      () => run(kitRoot, ['install-notes-graph.cjs', '--repo', repoRoot, '--app', 'Smoke App', '--dryrun']),
      /Unknown option: --dryrun/
    );
    assert.deepEqual(fs.readdirSync(repoRoot), []);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('installer dry-run is read-only and rejects symlinked write parents', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-dry-run-'));
  try {
    const dryRunRoot = path.join(tempRoot, 'dry');
    fs.mkdirSync(dryRunRoot);
    const output = runRaw(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', dryRunRoot,
      '--app', 'Dry Run',
      '--allow-non-git',
      '--dry-run'
    ]);
    assert.match(output, /\[dry-run\] Installed notes graph kit/);
    assert.deepEqual(fs.readdirSync(dryRunRoot), []);

    const symlinkRoot = path.join(tempRoot, 'symlink');
    const outsideRoot = path.join(tempRoot, 'outside');
    fs.mkdirSync(symlinkRoot);
    fs.mkdirSync(outsideRoot);
    fs.symlinkSync(outsideRoot, path.join(symlinkRoot, 'scripts'));
    const beforeRepo = snapshotTree(symlinkRoot);
    const beforeOutside = snapshotTree(outsideRoot);
    assert.throws(
      () => runRaw(kitRoot, [
        'install-notes-graph.cjs',
        '--repo', symlinkRoot,
        '--app', 'Symlink Guard',
        '--allow-non-git'
      ]),
      /parent must not be a symlink/
    );
    assert.deepEqual(snapshotTree(symlinkRoot), beforeRepo);
    assert.deepEqual(snapshotTree(outsideRoot), beforeOutside);

    const targetSymlinkRoot = path.join(tempRoot, 'target-symlink');
    fs.mkdirSync(targetSymlinkRoot);
    const outsidePackage = path.join(tempRoot, 'outside-package.json');
    fs.writeFileSync(outsidePackage, '{"name":"outside"}\n');
    fs.symlinkSync(outsidePackage, path.join(targetSymlinkRoot, 'package.json'));
    const beforeTargetRoot = snapshotTree(targetSymlinkRoot);
    assert.throws(
      () => runRaw(kitRoot, [
        'install-notes-graph.cjs',
        '--repo', targetSymlinkRoot,
        '--app', 'Target Symlink Guard',
        '--allow-non-git'
      ]),
      /package\.json must be a regular file/
    );
    assert.deepEqual(snapshotTree(targetSymlinkRoot), beforeTargetRoot);
    assert.equal(fs.readFileSync(outsidePackage, 'utf8'), '{"name":"outside"}\n');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('project notes commands reject unknown, duplicate, missing, and misplaced arguments', () => {
  const notesCli = requireFromTest(path.join(kitRoot, 'scripts/project-notes.cjs'));
  assert.throws(
    () => notesCli.parseArgs(['--unknown'], 'new'),
    /Unknown option for new: --unknown/
  );
  assert.throws(
    () => notesCli.parseArgs(['--title', 'One', '--title', 'Two'], 'new'),
    /Duplicate option: --title/
  );
  assert.throws(
    () => notesCli.parseArgs(['--json=false'], 'route'),
    /--json does not take a value/
  );
  assert.throws(
    () => notesCli.parseArgs(['--not-verified', '--force path untested'], 'closeout'),
    /use --not-verified=<value> when the value begins with --/
  );
  assert.throws(
    () => notesCli.parseArgs(['stray'], 'closeout'),
    /Unexpected positional argument/
  );
  assert.equal(
    notesCli.parseArgs(['--not-verified=--force path untested'], 'closeout')['not-verified'],
    '--force path untested'
  );

  const fencedGraphLinks = [
    '# Task',
    '',
    '```md',
    '## Graph Links',
    'example only',
    '```',
    '',
    '## Later Content',
    '',
    'Keep this.',
    ''
  ].join('\n');
  const withGraphLinks = notesCli.replaceOrAppendH2Section(
    fencedGraphLinks,
    'Graph Links',
    '- App: [[Apps/Test]]'
  );
  assert.match(withGraphLinks, /```md\n## Graph Links\nexample only\n```/);
  assert.match(withGraphLinks, /## Later Content\n\nKeep this\./);
  assert.match(withGraphLinks, /## Graph Links\n\n- App: \[\[Apps\/Test\]\]$/);

  const invalidFenceCloser = [
    '````md',
    '```not-a-closing-fence',
    '## Closeout fake',
    '````',
    '',
    'Body',
    ''
  ].join('\n');
  assert.equal(
    notesCli.hasH2OutsideFences(
      invalidFenceCloser,
      /^ {0,3}##[ \t]+Closeout(?:[ \t]+.*)?[ \t]*$/
    ),
    false
  );
  assert.equal(
    notesCli.hasH2OutsideFences(
      '   ## Closeout 2026-07-28 12:00 PDT\n',
      /^ {0,3}##[ \t]+Closeout(?:[ \t]+.*)?[ \t]*$/
    ),
    true
  );
});

test('install keeps punctuation-heavy app names valid in YAML and wikilinks', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-appname-'));
  const appName = 'Bad "App": Take/One #1 & Co';
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', appName
    ]);
    const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'notes-graph.config.json'), 'utf8'));
    assert.equal(config.appName, appName);
    assert.equal(config.appRel, 'Apps/Bad App Take One 1 & Co.md');

    const appNotePath = path.join(repoRoot, 'Project Notes/Apps/Bad App Take One 1 & Co.md');
    const appNote = fs.readFileSync(appNotePath, 'utf8');
    const appFrontmatter = yaml.load(appNote.match(/^---\n([\s\S]*?)\n---\n/)[1]);
    assert.equal(appFrontmatter.title, appName);
    assert.deepEqual(appFrontmatter.related_apps, [
      '[[Apps/Bad App Take One 1 & Co|Bad "App": Take/One #1 & Co]]'
    ]);

    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
    const newOutput = run(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--title', 'Punctuation app smoke',
      '--process', 'notes-graph-maintenance',
      '--summary', 'Verify generated links remain parseable.'
    ]);
    assert.match(newOutput, /^Created /m);
    const validateOutput = run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    assert.match(validateOutput, /validation passed/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('new sanitizes task filenames so generated wikilink targets are parseable', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-title-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));

    const newOutput = run(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--title', 'Fix parser #1 [case]',
      '--process', 'notes-graph-maintenance',
      '--summary', 'Verify generated links remain parseable.'
    ]);
    const createdRel = newOutput.match(/^Created (.+)$/m)?.[1];
    const dailyRel = newOutput.match(/^Updated (.+)$/m)?.[1];
    assert.ok(createdRel, `expected created note path in output: ${newOutput}`);
    assert.ok(dailyRel, `expected daily note path in output: ${newOutput}`);
    assert.match(createdRel, /^Evidence\/\d{4}-\d{2}-\d{2} Fix parser 1 case\.md$/);

    const createdTarget = createdRel.replace(/\.md$/i, '');
    assert.doesNotMatch(createdTarget, /[\[\]#^]/);
    const dailyText = fs.readFileSync(path.join(repoRoot, 'Project Notes', dailyRel), 'utf8');
    assert.ok(dailyText.includes(`[[${createdTarget}|Fix parser #1 case]]`));

    const validateOutput = run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    assert.match(validateOutput, /validation passed/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('new honors task and evidence note types', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-note-type-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));

    const taskOutput = run(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--title', 'Task type smoke',
      '--process', 'notes-graph-maintenance',
      '--summary', 'Verify task type.'
    ]);
    const taskRel = taskOutput.match(/^Created (.+)$/m)?.[1];
    assert.ok(taskRel, `expected created task note path in output: ${taskOutput}`);
    const taskFrontmatter = readRepoFrontmatter(repoRoot, taskRel);
    assert.equal(taskFrontmatter.schema_version, 1);
    assert.equal(taskFrontmatter.type, 'task');
    assert.match(dateOnly(taskFrontmatter.date), /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(taskFrontmatter.tags, ['notes/task']);
    const taskText = fs.readFileSync(path.join(repoRoot, 'Project Notes', taskRel), 'utf8');
    assert.match(taskText, /## Goal/);
    assert.equal((taskText.match(/^## Graph Links$/gm) || []).length, 1);
    assert.doesNotMatch(taskText, /```yaml[\s\S]*schema_version: 1[\s\S]*```/);

    const evidenceOutput = run(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--title', 'Evidence type smoke',
      '--process', 'notes-graph-maintenance',
      '--summary', 'Verify evidence type.',
      '--type', 'evidence'
    ]);
    const evidenceRel = evidenceOutput.match(/^Created (.+)$/m)?.[1];
    assert.ok(evidenceRel, `expected created evidence note path in output: ${evidenceOutput}`);
    const evidenceFrontmatter = readRepoFrontmatter(repoRoot, evidenceRel);
    assert.equal(evidenceFrontmatter.schema_version, 1);
    assert.equal(evidenceFrontmatter.type, 'evidence');
    assert.match(dateOnly(evidenceFrontmatter.date), /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(evidenceFrontmatter.tags, ['notes/evidence']);
    const evidenceText = fs.readFileSync(path.join(repoRoot, 'Project Notes', evidenceRel), 'utf8');
    assert.match(evidenceText, /## Scope/);
    assert.equal((evidenceText.match(/^## Graph Links$/gm) || []).length, 1);

    const validateOutput = run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    assert.match(validateOutput, /validation passed/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('new appends Graph Links when a customized task template omits the section', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-custom-task-template-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
    const templatePath = path.join(repoRoot, 'Project Notes/Templates/Task Note Template.md');
    const template = fs.readFileSync(templatePath, 'utf8')
      .replace(/\n## Graph Links[\s\S]*$/, '\n');
    fs.writeFileSync(templatePath, template);

    const output = run(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--title', 'Customized task template',
      '--process', 'notes-graph-maintenance',
      '--summary', 'Prove Graph Links are appended.'
    ]);
    const rel = output.match(/^Created (.+)$/m)?.[1];
    const note = fs.readFileSync(path.join(repoRoot, 'Project Notes', rel), 'utf8');
    assert.equal((note.match(/^## Graph Links$/gm) || []).length, 1);
    assert.match(note, /- Process: \[\[Processes\/Notes Graph Maintenance/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('frontmatter dates remain canonical and repeated closeout is non-mutating', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-closeout-date-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
    const notePath = path.join(repoRoot, 'Project Notes/Evidence/Unquoted Date.md');
    fs.writeFileSync(notePath, [
      '---',
      'title: Unquoted Date',
      'schema_version: 1',
      'type: task',
      'status: active',
      'date: 2026-06-03',
      'tags:',
      '  - notes/task',
      'related_apps:',
      '  - "[[Apps/Smoke App|Smoke App]]"',
      '---',
      '',
      '# Unquoted Date',
      ''
    ].join('\n'));
    const closeArgs = [
      'scripts/project-notes.cjs', 'closeout',
      '--note', 'Project Notes/Evidence/Unquoted Date.md',
      '--working', 'Date serialization is stable.',
      '--verified', 'Closeout completed once.',
      '--not-verified', 'Obsidian rendering.'
    ];
    const closeOutput = run(repoRoot, closeArgs);
    const afterFirst = fs.readFileSync(notePath, 'utf8');
    const dailyRel = closeOutput.match(/^Updated (.+)$/m)?.[1];
    assert.ok(dailyRel, closeOutput);
    const dailyPath = path.join(repoRoot, 'Project Notes', dailyRel);
    const dailyAfterFirst = fs.readFileSync(dailyPath, 'utf8');
    assert.match(afterFirst, /date: "2026-06-03"/);
    assert.doesNotMatch(afterFirst, /2026-06-03T00:00:00\.000Z/);
    assert.match(afterFirst, /last_verified: "\d{4}-\d{2}-\d{2}"/);
    assert.throws(() => run(repoRoot, closeArgs), /already contains a closeout/);
    assert.equal(fs.readFileSync(notePath, 'utf8'), afterFirst);
    assert.equal(fs.readFileSync(dailyPath, 'utf8'), dailyAfterFirst);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('frontmatter loader preserves unquoted dates and dump normalizes Date objects', () => {
  const graphLib = requireFromTest(path.join(kitRoot, 'scripts/lib/project-notes-graph.cjs'));
  const parsed = graphLib.loadFrontmatter([
    'date: 2026-06-03',
    'last_verified: 2026-07-28',
    'defaults: &defaults',
    '  confidence: high',
    'merged:',
    '  <<: *defaults',
    '  status: active',
    ''
  ].join('\n'));
  assert.equal(parsed.date, '2026-06-03');
  assert.equal(parsed.last_verified, '2026-07-28');
  assert.deepEqual(parsed.merged, { confidence: 'high', status: 'active' });
  const dumped = graphLib.dumpFrontmatter({
    date: new Date('2026-06-03T00:00:00.000Z'),
    last_verified: new Date('2026-07-28T00:00:00.000Z')
  });
  assert.match(dumped, /date: "2026-06-03"/);
  assert.match(dumped, /last_verified: "2026-07-28"/);
  assert.deepEqual(graphLib.loadFrontmatter(dumped), {
    date: '2026-06-03',
    last_verified: '2026-07-28'
  });
});

test('closeout refuses symlinked notes outside the vault', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-closeout-symlink-'));
  const outsidePath = path.join(os.tmpdir(), `${path.basename(repoRoot)}-outside.md`);
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
    const outsideText = 'outside note must not change\n';
    fs.writeFileSync(outsidePath, outsideText);
    fs.symlinkSync(outsidePath, path.join(repoRoot, 'Project Notes/Evidence/Linked.md'));

    assert.throws(
      () => run(repoRoot, [
        'scripts/project-notes.cjs', 'closeout',
        '--note', 'Project Notes/Evidence/Linked.md',
        '--working', 'Should not write outside the vault.',
        '--verified', 'Guard rejected the symlink.',
        '--not-verified', 'None.'
      ]),
      /Note is outside vault/
    );
    assert.equal(fs.readFileSync(outsidePath, 'utf8'), outsideText);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outsidePath, { force: true });
  }
});

test('validator enforces required fields for schema-managed notes', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-schema-required-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));

    const newOutput = run(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--title', 'Schema required smoke',
      '--process', 'notes-graph-maintenance',
      '--summary', 'Create schema-managed note.'
    ]);
    const createdRel = newOutput.match(/^Created (.+)$/m)?.[1];
    assert.ok(createdRel, `expected created note path in output: ${newOutput}`);
    const notePath = path.join(repoRoot, 'Project Notes', createdRel);
    const brokenText = fs.readFileSync(notePath, 'utf8')
      .replace(/\ndate: "?\d{4}-\d{2}-\d{2}"?\n/, '\n')
      .replace(/\ntags:\n(?:  - .+\n)+/, '\n');
    fs.writeFileSync(notePath, brokenText);

    let failure = null;
    try {
      run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, 'validation should fail when a schema-managed note omits required fields');
    const output = `${failure.stdout || ''}${failure.stderr || ''}${failure.message}`;
    assert.match(output, /schema-managed note date must be YYYY-MM-DD/);
    assert.match(output, /schema-managed note tags must be a non-empty array of strings/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('validator preserves legacy frontmatter notes without schema_version', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-legacy-frontmatter-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
    fs.writeFileSync(
      path.join(repoRoot, 'Project Notes/Evidence/Legacy Contract Gap.md'),
      [
        '---',
        'title: Legacy Contract Gap',
        'type: task',
        'status: active',
        '---',
        '',
        '# Legacy Contract Gap',
        '',
        'Legacy note intentionally has no schema_version, date, or tags.',
        ''
      ].join('\n')
    );

    const validateOutput = run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    assert.match(validateOutput, /validation passed/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('validator rejects timestamp dates only for schema-managed notes', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-timestamp-schema-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
    const managedPath = path.join(repoRoot, 'Project Notes/Evidence/Timestamp Managed.md');
    fs.writeFileSync(managedPath, [
      '---',
      'title: Timestamp Managed',
      'schema_version: 1',
      'type: task',
      'status: active',
      'date: 2026-06-03T00:00:00.000Z',
      'last_verified: 2026-07-28T00:00:00.000Z',
      'tags:',
      '  - notes/task',
      'related_apps:',
      '  - "[[Apps/Smoke App|Smoke App]]"',
      '---',
      '',
      '# Timestamp Managed',
      ''
    ].join('\n'));
    fs.writeFileSync(path.join(repoRoot, 'Project Notes/Legacy Timestamp.md'), [
      '---',
      'title: Legacy Timestamp',
      'type: task',
      'status: active',
      'date: 2026-06-03T00:00:00.000Z',
      'last_verified: 2026-07-28T00:00:00.000Z',
      'related_apps:',
      '  - "[[Apps/Smoke App|Smoke App]]"',
      '---',
      '',
      '# Legacy Timestamp',
      ''
    ].join('\n'));

    let failure = null;
    try {
      run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    } catch (error) {
      failure = error;
    }
    assert.ok(failure);
    const output = commandOutput(failure);
    assert.match(output, /Timestamp Managed\.md: schema-managed note date must be YYYY-MM-DD/);
    assert.match(output, /Timestamp Managed\.md: schema-managed note last_verified must be YYYY-MM-DD/);
    assert.doesNotMatch(output, /Legacy Timestamp\.md: schema-managed/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('validator enforces strict paths and checks managed, template, structured, and daily bodies', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-link-scope-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
    const vaultRoot = path.join(repoRoot, 'Project Notes');

    fs.writeFileSync(
      path.join(vaultRoot, 'Evidence/Duplicate.md'),
      '# Evidence duplicate\n'
    );
    fs.writeFileSync(
      path.join(vaultRoot, 'Runbooks/Duplicate.md'),
      '# Runbook duplicate\n'
    );
    fs.writeFileSync(
      path.join(vaultRoot, 'Managed Root.md'),
      [
        '---',
        'title: Managed Root',
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
        '# Managed Root',
        '',
        'Wrong folder: [[Totally/Made Up/_README]]',
        'Ambiguous basename: [[Duplicate]]',
        ''
      ].join('\n')
    );
    fs.appendFileSync(
      path.join(vaultRoot, 'Templates/App Template.md'),
      '\nBroken template body link: [[Missing Template Target]]\n'
    );
    fs.writeFileSync(
      path.join(vaultRoot, 'Evidence/Legacy Structured.md'),
      '# Legacy Structured\n\n[[Missing Structured Target]]\n'
    );
    fs.writeFileSync(
      path.join(vaultRoot, '2020-01-01.md'),
      '# 2020-01-01\n\n[[Missing Daily Target]]\n'
    );
    fs.writeFileSync(
      path.join(vaultRoot, 'Legacy Named Daily.md'),
      [
        '---',
        'title: Legacy Named Daily',
        'type: daily',
        'status: active',
        '---',
        '',
        '# Legacy Named Daily',
        '',
        '[[Missing Typed Daily Target]]',
        ''
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(vaultRoot, 'Legacy Flat.md'),
      '# Legacy Flat\n\n[[Missing Flat Target]]\n'
    );

    let failure = null;
    try {
      run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, 'validation should fail for strict and expanded body-link checks');
    const output = commandOutput(failure);
    assert.match(
      output,
      /Managed Root\.md: has broken wikilink \[\[Totally\/Made Up\/_README\]\]/
    );
    assert.match(
      output,
      /Managed Root\.md: has ambiguous wikilink \[\[Duplicate\]\] matching Evidence\/Duplicate\.md, Runbooks\/Duplicate\.md; use a vault-relative path/
    );
    assert.match(
      output,
      /Templates\/App Template\.md: has broken wikilink \[\[Missing Template Target\]\]/
    );
    assert.match(
      output,
      /Evidence\/Legacy Structured\.md: has broken wikilink \[\[Missing Structured Target\]\]/
    );
    assert.match(
      output,
      /2020-01-01\.md: has broken wikilink \[\[Missing Daily Target\]\]/
    );
    assert.match(
      output,
      /Legacy Named Daily\.md: has broken wikilink \[\[Missing Typed Daily Target\]\]/
    );
    assert.doesNotMatch(output, /Missing Flat Target/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('validator reports ambiguous typed relationship links with deterministic candidates', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-relationship-link-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
    const vaultRoot = path.join(repoRoot, 'Project Notes');

    for (const rel of ['Evidence/Shared.md', 'Incidents/Shared.md']) {
      fs.writeFileSync(path.join(vaultRoot, rel), [
        '---',
        `title: ${path.basename(rel, '.md')}`,
        'schema_version: 1',
        'type: evidence',
        'status: done',
        'date: 2026-07-28',
        'tags:',
        '  - notes/evidence',
        'related_apps:',
        '  - "[[Apps/Smoke App|Smoke App]]"',
        '---',
        '',
        '# Shared',
        ''
      ].join('\n'));
    }
    fs.writeFileSync(
      path.join(vaultRoot, 'Evidence/Relationship Source.md'),
      [
        '---',
        'title: Relationship Source',
        'schema_version: 1',
        'type: task',
        'status: active',
        'date: 2026-07-28',
        'tags:',
        '  - notes/task',
        'related_apps:',
        '  - "[[Apps/Smoke App|Smoke App]]"',
        'related_evidence:',
        '  - "[[Shared]]"',
        '---',
        '',
        '# Relationship Source',
        ''
      ].join('\n')
    );

    assertValidateFails(
      repoRoot,
      /Evidence\/Relationship Source\.md: related_evidence has ambiguous wikilink \[\[Shared\]\] matching Evidence\/Shared\.md, Incidents\/Shared\.md; use a vault-relative path/
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('validator summarizes recurring warnings by default and expands them with --verbose', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-warning-summary-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));

    fs.writeFileSync(
      path.join(repoRoot, 'Project Notes/Legacy Note.md'),
      '# Legacy Note\n'
    );
    fs.writeFileSync(
      path.join(repoRoot, 'Project Notes/2020-01-01.md'),
      '# 2020-01-01\n'
    );
    fs.writeFileSync(
      path.join(repoRoot, 'Project Notes/Evidence/Legacy Structured.md'),
      '# Legacy Structured\n'
    );
    fs.writeFileSync(
      path.join(repoRoot, 'Project Notes/Evidence/Missing Type.md'),
      [
        '---',
        'title: Missing Type',
        'status: active',
        '---',
        '',
        '# Missing Type',
        ''
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(repoRoot, 'Project Notes/Typed Without App.md'),
      [
        '---',
        'title: Typed Without App',
        'type: task',
        'status: active',
        '---',
        '',
        '# Typed Without App',
        ''
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(repoRoot, 'Project Notes/Runbooks/Orphan Runbook.md'),
      [
        '---',
        'title: Orphan Runbook',
        'type: runbook',
        'status: current',
        'related_apps:',
        '  - "[[Apps/Smoke App|Smoke App]]"',
        '---',
        '',
        '# Orphan Runbook',
        ''
      ].join('\n')
    );

    const defaultOutput = runCaptured(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    assert.match(defaultOutput, /WARN Runbooks\/Orphan Runbook\.md: runbook note has no inbound links/);
    assert.match(defaultOutput, /WARN Summarized 5 recurring warning\(s\):/);
    assert.match(defaultOutput, /WARN   1 typed notes without related_apps/);
    assert.match(defaultOutput, /WARN   1 legacy daily notes without frontmatter/);
    assert.match(defaultOutput, /WARN   1 other legacy notes without frontmatter/);
    assert.match(defaultOutput, /WARN   1 structured notes without type/);
    assert.match(defaultOutput, /WARN   1 legacy structured notes without frontmatter/);
    assert.doesNotMatch(defaultOutput, /WARN Legacy Note\.md:/);
    assert.match(defaultOutput, /validation passed with 6 warning\(s\)/);

    const verboseOutput = runCaptured(
      repoRoot,
      ['scripts/validate-project-notes-graph.cjs', '--verbose']
    );
    assert.match(verboseOutput, /WARN Legacy Note\.md: legacy note has no frontmatter/);
    assert.match(verboseOutput, /WARN 2020-01-01\.md: legacy daily note has no frontmatter/);
    assert.match(verboseOutput, /WARN Evidence\/Legacy Structured\.md: legacy structured note is missing frontmatter/);
    assert.match(verboseOutput, /WARN Evidence\/Missing Type\.md: structured note is missing type/);
    assert.match(verboseOutput, /WARN Typed Without App\.md: typed note has no related_apps/);
    assert.doesNotMatch(verboseOutput, /WARN Summarized/);
    assert.match(verboseOutput, /validation passed with 6 warning\(s\)/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('validator reports malformed wikilinks in daily notes', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-malformed-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));

    const newOutput = run(repoRoot, [
      'scripts/project-notes.cjs', 'new',
      '--title', 'Normal task',
      '--process', 'notes-graph-maintenance',
      '--summary', 'Create a daily note for validation.'
    ]);
    const dailyRel = newOutput.match(/^Updated (.+)$/m)?.[1];
    assert.ok(dailyRel, `expected daily note path in output: ${newOutput}`);
    fs.appendFileSync(
      path.join(repoRoot, 'Project Notes', dailyRel),
      '- Bad generated link [[Evidence/Broken [target]|Alias]]\n'
    );

    let failure = null;
    try {
      run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, 'validation should fail for malformed wikilinks');
    assert.match(`${failure.stdout || ''}${failure.stderr || ''}${failure.message}`, /malformed wikilink/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('validator reports malformed route config without a stack trace', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-route-schema-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
    const configPath = path.join(repoRoot, 'notes-graph.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.routes = [{ id: 'bad-route' }];
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    let failure = null;
    try {
      run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, 'validation should fail for malformed route config');
    const output = `${failure.stdout || ''}${failure.stderr || ''}${failure.message}`;
    assert.match(output, /route "bad-route": processRel must be a non-empty string/);
    assert.doesNotMatch(output, /TypeError|at resolveTarget/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('route command reports phrase-level alias ambiguity and exact ids override it', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-route-ambiguity-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
    const configPath = path.join(repoRoot, 'notes-graph.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.routes = [
      {
        id: 'z-route',
        processRel: 'Processes/Notes Graph Maintenance.md',
        aliases: ['review']
      },
      {
        id: 'a-route',
        processRel: 'Processes/Notes Graph Maintenance.md',
        aliases: ['app']
      }
    ];
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    assert.throws(
      () => run(repoRoot, ['scripts/project-notes.cjs', 'route', 'review the app']),
      /Ambiguous notes route.*route "a-route".*route "z-route".*use an exact route id/
    );
    const exactOutput = run(repoRoot, ['scripts/project-notes.cjs', 'route', 'z-route']);
    assert.match(exactOutput, /Process: \[\[Processes\/Notes Graph Maintenance/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('route config processRel must target a process note', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-route-type-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
    const configPath = path.join(repoRoot, 'notes-graph.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.routes = [{
      id: 'bad-route',
      processRel: 'Apps/Smoke App.md',
      aliases: ['bad']
    }];
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    let validateFailure = null;
    try {
      run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    } catch (error) {
      validateFailure = error;
    }
    assert.ok(validateFailure, 'validation should fail when route processRel targets an app');
    assert.match(
      `${validateFailure.stdout || ''}${validateFailure.stderr || ''}${validateFailure.message}`,
      /route "bad-route": processRel Apps\/Smoke App\.md must target type process; found app/
    );

    let routeFailure = null;
    try {
      run(repoRoot, ['scripts/project-notes.cjs', 'route', 'bad']);
    } catch (error) {
      routeFailure = error;
    }
    assert.ok(routeFailure, 'routing should fail when route processRel targets an app');
    assert.match(
      `${routeFailure.stdout || ''}${routeFailure.stderr || ''}${routeFailure.message}`,
      /Route "bad-route" points to missing or non-process note Apps\/Smoke App\.md/
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('validator fails when configured route target is missing', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-route-missing-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
    const configPath = path.join(repoRoot, 'notes-graph.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.routes = [{
      id: 'missing-route',
      processRel: 'Wrong/Notes Graph Maintenance.md',
      aliases: ['missing']
    }];
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    let validateFailure = null;
    try {
      run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    } catch (error) {
      validateFailure = error;
    }
    assert.ok(validateFailure, 'validation should fail when configured route processRel is missing');
    const output = `${validateFailure.stdout || ''}${validateFailure.stderr || ''}${validateFailure.message}`;
    assert.match(
      output,
      /route "missing-route": processRel Wrong\/Notes Graph Maintenance\.md must target an existing process note/
    );
    assert.doesNotMatch(output, /WARN route alias "missing-route"/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('buildRoute uses per-call env route config in a reused process', () => {
  const repoA = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-env-a-'));
  const repoB = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-env-b-'));
  const libPath = path.join(kitRoot, 'scripts/lib/project-notes-graph.cjs');
  const previousRepoRoot = process.env.PROJECT_NOTES_NOTES_REPO_ROOT;
  const previousConfig = process.env.PROJECT_NOTES_CONFIG;
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoA,
      '--app', 'Repo A'
    ]);
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoB,
      '--app', 'Repo B'
    ]);

    const repoBConfigPath = path.join(repoB, 'notes-graph.config.json');
    const repoBConfig = JSON.parse(fs.readFileSync(repoBConfigPath, 'utf8'));
    repoBConfig.routes = [{
      id: 'custom-b',
      processRel: 'Processes/Notes Graph Maintenance.md',
      aliases: ['custom b']
    }];
    fs.writeFileSync(repoBConfigPath, `${JSON.stringify(repoBConfig, null, 2)}\n`);

    process.env.PROJECT_NOTES_NOTES_REPO_ROOT = repoA;
    delete process.env.PROJECT_NOTES_CONFIG;
    delete requireFromTest.cache[requireFromTest.resolve(libPath)];
    const graphLib = requireFromTest(libPath);

    const route = graphLib.buildRoute('custom b', {
      env: {
        PROJECT_NOTES_NOTES_REPO_ROOT: repoB
      }
    });
    assert.equal(route.error, null);
    assert.equal(route.definition.id, 'custom-b');
    assert.equal(route.processRel, 'Processes/Notes Graph Maintenance.md');
  } finally {
    if (previousRepoRoot == null) {
      delete process.env.PROJECT_NOTES_NOTES_REPO_ROOT;
    } else {
      process.env.PROJECT_NOTES_NOTES_REPO_ROOT = previousRepoRoot;
    }
    if (previousConfig == null) {
      delete process.env.PROJECT_NOTES_CONFIG;
    } else {
      process.env.PROJECT_NOTES_CONFIG = previousConfig;
    }
    delete requireFromTest.cache[requireFromTest.resolve(libPath)];
    fs.rmSync(repoA, { recursive: true, force: true });
    fs.rmSync(repoB, { recursive: true, force: true });
  }
});

test('install rejects app names with Obsidian wikilink delimiters', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-appname-delimiter-'));
  try {
    assert.throws(
      () => run(kitRoot, [
        'install-notes-graph.cjs',
        '--repo', repoRoot,
        '--app', 'Bad | [[Name]]'
      ]),
      /break Obsidian wikilinks/
    );
    assert.deepEqual(fs.readdirSync(repoRoot), []);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('install refuses to overwrite existing managed helper scripts without force', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-script-guard-'));
  try {
    const scriptPath = path.join(repoRoot, 'scripts/lib/project-notes-graph.cjs');
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, '// custom helper\n');
    assert.throws(
      () => run(kitRoot, [
        'install-notes-graph.cjs',
        '--repo', repoRoot,
        '--app', 'Smoke App'
      ]),
      /already exists/
    );
    assert.equal(fs.readFileSync(scriptPath, 'utf8'), '// custom helper\n');
    assert.ok(!fs.existsSync(path.join(repoRoot, 'scripts/project-notes.cjs')));
    assert.ok(!fs.existsSync(path.join(repoRoot, 'notes-graph.config.json')));
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('install still merges an existing package.json', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-package-'));
  try {
    const packagePath = path.join(repoRoot, 'package.json');
    fs.writeFileSync(packagePath, `${JSON.stringify({
      name: 'existing-package',
      scripts: {
        build: 'echo build'
      }
    }, null, 2)}\n`);
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    assert.equal(pkg.scripts.build, 'echo build');
    assert.equal(pkg.scripts.notes, 'node scripts/project-notes.cjs');
    assert.equal(pkg.dependencies['js-yaml'], '^4.1.0');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('install and upgrade warn when preserving custom notes scripts', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-custom-scripts-'));
  try {
    const packagePath = path.join(repoRoot, 'package.json');
    fs.writeFileSync(packagePath, `${JSON.stringify({
      name: 'custom-notes-package',
      scripts: {
        'notes:validate': 'node old-validator.cjs'
      }
    }, null, 2)}\n`);

    const installOutput = run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    assert.match(installOutput, /warn\s+package\.json preserved custom notes:validate: node old-validator\.cjs/);
    assert.match(installOutput, /custom notes:\* scripts/);
    const installedPkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    assert.equal(installedPkg.scripts['notes:validate'], 'node old-validator.cjs');
    assert.equal(installedPkg.scripts.notes, 'node scripts/project-notes.cjs');

    const configPath = path.join(repoRoot, 'notes-graph.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.kitVersion = '0.0.0';
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const upgradeOutput = run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--upgrade'
    ]);
    assert.match(upgradeOutput, /warn\s+package\.json preserved custom notes:validate: node old-validator\.cjs/);
    assert.match(upgradeOutput, /custom notes:\* scripts/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('upgrade refreshes scripts and stamps kitVersion', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-up-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    const configPath = path.join(repoRoot, 'notes-graph.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.kitVersion = '0.0.0';
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    fs.writeFileSync(path.join(repoRoot, 'scripts/project-notes.cjs'), '// stale\n');

    const upgradeOutput = run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--upgrade'
    ]);
    assert.match(upgradeOutput, /Upgraded notes graph kit 0\.0\.0 -> /);

    const refreshed = fs.readFileSync(path.join(repoRoot, 'scripts/project-notes.cjs'), 'utf8');
    assert.ok(refreshed.length > 100, 'stale script should be replaced');
    const upgraded = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.notEqual(upgraded.kitVersion, '0.0.0');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('upgrade refuses downgrade unless explicitly allowed', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-downgrade-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    const configPath = path.join(repoRoot, 'notes-graph.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.kitVersion = '999.0.0';
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const scriptPath = path.join(repoRoot, 'scripts/project-notes.cjs');
    fs.writeFileSync(scriptPath, '// newer script\n');

    assert.throws(
      () => run(kitRoot, ['install-notes-graph.cjs', '--repo', repoRoot, '--upgrade']),
      /Refusing to downgrade notes graph kit 999\.0\.0 -> /
    );
    assert.equal(fs.readFileSync(scriptPath, 'utf8'), '// newer script\n');
    assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf8')).kitVersion, '999.0.0');

    const output = run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--upgrade',
      '--allow-downgrade'
    ]);
    assert.match(output, /Upgraded notes graph kit 999\.0\.0 -> /);
    assert.ok(fs.readFileSync(scriptPath, 'utf8').length > 100);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('semantic version comparison handles identifiers larger than Number safely', () => {
  const installer = requireFromTest(path.join(kitRoot, 'install-notes-graph.cjs'));
  assert.equal(
    installer.compareSemver('9007199254740993.0.0', '9007199254740992.0.0'),
    1
  );
  assert.equal(
    installer.compareSemver('1.0.0-9007199254740993', '1.0.0-9007199254740992'),
    1
  );
});

test('vault migration catalog is cumulative and upgrade guidance points to the auditor', () => {
  const installer = requireFromTest(path.join(kitRoot, 'install-notes-graph.cjs'));
  assert.deepEqual(
    installer.applicableVaultMigrations('0.2.15'),
    []
  );
  assert.deepEqual(
    installer.applicableVaultMigrations('0.2.16').map(({ version }) => version),
    ['0.2.16']
  );
  assert.deepEqual(
    installer.applicableVaultMigrations('0.4.0').map(({ version }) => version),
    ['0.2.16', '0.3.0', '0.4.0']
  );
  assert.deepEqual(
    installer.applicableVaultMigrations('0.3.1').map(({ version }) => version),
    ['0.2.16', '0.3.0']
  );
  assert.throws(
    () => installer.applicableVaultMigrations('not-semver'),
    /Target migration version must be valid semantic versioning/
  );

  const guidance = installer.vaultMigrationGuidance('0.4.0').join('\n');
  assert.match(guidance, /migrate-notes-graph\.cjs audit --repo "<target-repo>" --to 0\.4\.0/);
  assert.match(guidance, /kitVersion tracks managed scripts, not whether vault migrations were completed/);
});

test('upgrade output surfaces all applicable migrations for direct and previously stamped upgrades', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-upgrade-guidance-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    const configPath = path.join(repoRoot, 'notes-graph.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    for (const installedVersion of ['0.2.15', '0.3.0']) {
      config.kitVersion = installedVersion;
      fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
      const output = run(kitRoot, [
        'install-notes-graph.cjs',
        '--repo', repoRoot,
        '--upgrade',
        '--dry-run'
      ]);
      assert.match(output, new RegExp(`\\[dry-run\\] Upgraded notes graph kit ${escapeRegExp(installedVersion)} -> 0\\.4\\.0`));
      assert.match(
        output,
        new RegExp(`migrate-notes-graph\\.cjs audit --repo ${escapeRegExp(JSON.stringify(fs.realpathSync(repoRoot)))} --to 0\\.4\\.0`)
      );
      assert.equal(
        JSON.parse(fs.readFileSync(configPath, 'utf8')).kitVersion,
        installedVersion,
        'dry-run should not update the installed version'
      );
    }
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('upgrade rejects install-only flags without changing installed files', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-upgrade-flags-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    const before = snapshotTree(repoRoot);
    const cases = [
      ['--app', 'Other App'],
      ['--vault', 'Other Notes'],
      ['--force'],
      ['--force', '--force-vault']
    ];
    for (const extra of cases) {
      assert.throws(
        () => runRaw(kitRoot, [
          'install-notes-graph.cjs',
          '--repo', repoRoot,
          '--upgrade',
          '--allow-non-git',
          ...extra
        ]),
        /--upgrade cannot be combined/
      );
      assert.deepEqual(snapshotTree(repoRoot), before);
    }
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('upgrade permits missing legacy kitVersion but rejects malformed values', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-version-guard-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    const configPath = path.join(repoRoot, 'notes-graph.config.json');
    const scriptPath = path.join(repoRoot, 'scripts/project-notes.cjs');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.kitVersion = 'not-semver';
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    fs.writeFileSync(scriptPath, '// unchanged on malformed version\n');
    const before = snapshotTree(repoRoot);
    assert.throws(
      () => run(kitRoot, ['install-notes-graph.cjs', '--repo', repoRoot, '--upgrade']),
      /Installed kitVersion must be valid semantic versioning/
    );
    assert.deepEqual(snapshotTree(repoRoot), before);

    delete config.kitVersion;
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const output = run(kitRoot, ['install-notes-graph.cjs', '--repo', repoRoot, '--upgrade']);
    assert.match(output, /Upgraded notes graph kit unversioned -> 0\.4\.0/);
    assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf8')).kitVersion, '0.4.0');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('vault overwrites require both --force and --force-vault', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-force-vault-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    const scriptPath = path.join(repoRoot, 'scripts/project-notes.cjs');
    const vaultPath = path.join(repoRoot, 'Project Notes/Notes System.md');
    fs.writeFileSync(scriptPath, '// custom script\n');
    fs.writeFileSync(vaultPath, 'custom vault content\n');

    assert.throws(
      () => run(kitRoot, [
        'install-notes-graph.cjs',
        '--repo', repoRoot,
        '--app', 'Smoke App',
        '--force-vault'
      ]),
      /--force-vault requires --force/
    );
    assert.equal(fs.readFileSync(scriptPath, 'utf8'), '// custom script\n');
    assert.equal(fs.readFileSync(vaultPath, 'utf8'), 'custom vault content\n');

    const forceOutput = run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App',
      '--force'
    ]);
    assert.ok(fs.readFileSync(scriptPath, 'utf8').length > 100);
    assert.equal(fs.readFileSync(vaultPath, 'utf8'), 'custom vault content\n');
    assert.match(forceOutput, /skip\s+Project Notes\/Notes System\.md/);

    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App',
      '--force',
      '--force-vault'
    ]);
    assert.match(fs.readFileSync(vaultPath, 'utf8'), /^---\n/);
    assert.doesNotMatch(fs.readFileSync(vaultPath, 'utf8'), /custom vault content/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('install skips AGENTS.md when Project Notes Graph section exists', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-agents-'));
  try {
    const agentsPath = path.join(repoRoot, 'AGENTS.md');
    fs.writeFileSync(agentsPath, '# Existing\n\n## Project Notes Graph\n\nCustom block.\n');
    const installOutput = run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    assert.match(installOutput, /skip\s+AGENTS\.md/);
    assert.equal(fs.readFileSync(agentsPath, 'utf8'), '# Existing\n\n## Project Notes Graph\n\nCustom block.\n');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('install appends Project Notes Graph to existing AGENTS.md', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-agents-append-'));
  try {
    const agentsPath = path.join(repoRoot, 'AGENTS.md');
    fs.writeFileSync(agentsPath, '# Existing App\n\n## Commands\n\n- build\n');
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Smoke App'
    ]);
    const agentsMd = fs.readFileSync(agentsPath, 'utf8');
    assert.match(agentsMd, /^# Existing App/m);
    assert.match(agentsMd, /## Commands/);
    assert.match(agentsMd, /## Project Notes Graph/);
    assert.match(agentsMd, /Apps\/Smoke App\.md/);
    assert.match(agentsMd, /<!-- notes-graph-kit:start -->/);
    assert.match(agentsMd, /<!-- notes-graph-kit:end -->/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('AGENTS detection ignores prose and fenced examples but honors managed markers', () => {
  const cases = [
    {
      name: 'prose',
      content: '# Existing\n\nDocumentation mentions `## Project Notes Graph` here.\n'
    },
    {
      name: 'fenced',
      content: [
        '# Existing',
        '',
        '```md',
        '<!-- notes-graph-kit:start -->',
        '## Project Notes Graph',
        '<!-- notes-graph-kit:end -->',
        '```',
        ''
      ].join('\n')
    },
    {
      name: 'invalid-closer',
      content: [
        '# Existing',
        '',
        '````md',
        '```not-a-closing-fence',
        '## Project Notes Graph',
        '````',
        ''
      ].join('\n')
    },
    {
      name: 'indented-markers',
      content: [
        '# Existing',
        '',
        '    <!-- notes-graph-kit:start -->',
        '    ## Project Notes Graph',
        '    <!-- notes-graph-kit:end -->',
        ''
      ].join('\n')
    }
  ];
  for (const fixture of cases) {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `notes-graph-kit-agents-${fixture.name}-`));
    try {
      const agentsPath = path.join(repoRoot, 'AGENTS.md');
      fs.writeFileSync(agentsPath, fixture.content);
      run(kitRoot, [
        'install-notes-graph.cjs',
        '--repo', repoRoot,
        '--app', 'Smoke App'
      ]);
      const installed = fs.readFileSync(agentsPath, 'utf8');
      assert.match(installed, /## Project Notes Graph/);
      assert.ok(installed.length > fixture.content.length);
      assert.equal(
        (installed.match(/^<!-- notes-graph-kit:start -->$/gm) || []).length,
        fixture.name === 'fenced' ? 2 : 1
      );
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  }

  const markedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-agents-marked-'));
  try {
    const agentsPath = path.join(markedRoot, 'AGENTS.md');
    const marked = [
      '# Existing',
      '',
      '<!-- notes-graph-kit:start -->',
      'Custom managed content.',
      '<!-- notes-graph-kit:end -->',
      ''
    ].join('\n');
    fs.writeFileSync(agentsPath, marked);
    const output = run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', markedRoot,
      '--app', 'Smoke App'
    ]);
    assert.match(output, /skip\s+AGENTS\.md/);
    assert.equal(fs.readFileSync(agentsPath, 'utf8'), marked);
  } finally {
    fs.rmSync(markedRoot, { recursive: true, force: true });
  }
});

test('install rejects incomplete AGENTS markers before writing anything else', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-agents-incomplete-'));
  try {
    const agentsPath = path.join(repoRoot, 'AGENTS.md');
    fs.writeFileSync(agentsPath, '# Existing\n\n<!-- notes-graph-kit:start -->\n');
    const before = snapshotTree(repoRoot);
    assert.throws(
      () => run(kitRoot, [
        'install-notes-graph.cjs',
        '--repo', repoRoot,
        '--app', 'Smoke App'
      ]),
      /incomplete or duplicate/
    );
    assert.deepEqual(snapshotTree(repoRoot), before);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }

  const unclosedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-agents-unclosed-'));
  try {
    const agentsPath = path.join(unclosedRoot, 'AGENTS.md');
    fs.writeFileSync(agentsPath, '# Existing\n\n```md\nExample remains open.\n');
    const before = snapshotTree(unclosedRoot);
    assert.throws(
      () => run(kitRoot, [
        'install-notes-graph.cjs',
        '--repo', unclosedRoot,
        '--app', 'Smoke App'
      ]),
      /unclosed fenced code block/
    );
    assert.deepEqual(snapshotTree(unclosedRoot), before);
  } finally {
    fs.rmSync(unclosedRoot, { recursive: true, force: true });
  }
});

test('repo guard requires an exact Git root and supports explicit non-Git installs and worktrees', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-repo-guard-'));
  try {
    const nonGit = path.join(tempRoot, 'non-git');
    fs.mkdirSync(nonGit);
    assert.throws(
      () => runRaw(kitRoot, [
        'install-notes-graph.cjs',
        '--repo', nonGit,
        '--app', 'Non Git'
      ]),
      /is not a Git worktree/
    );
    runRaw(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', nonGit,
      '--app', 'Non Git',
      '--allow-non-git'
    ]);
    assert.ok(fs.existsSync(path.join(nonGit, 'notes-graph.config.json')));

    const gitRoot = path.join(tempRoot, 'repo');
    fs.mkdirSync(gitRoot);
    execFileSync('git', ['init', '--quiet', gitRoot]);
    runRaw(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', gitRoot,
      '--app', 'Git Root'
    ]);
    const nested = path.join(gitRoot, 'nested');
    fs.mkdirSync(nested);
    assert.throws(
      () => runRaw(kitRoot, [
        'install-notes-graph.cjs',
        '--repo', nested,
        '--app', 'Nested',
        '--dry-run'
      ]),
      /must be the exact Git worktree root/
    );
    assert.throws(
      () => runRaw(kitRoot, [
        'install-notes-graph.cjs',
        '--repo', nested,
        '--app', 'Nested',
        '--allow-non-git',
        '--dry-run'
      ]),
      /must be the exact Git worktree root/
    );

    execFileSync('git', ['-C', gitRoot, 'config', 'user.name', 'Notes Graph Test']);
    execFileSync('git', ['-C', gitRoot, 'config', 'user.email', 'notes-graph@example.invalid']);
    execFileSync('git', ['-C', gitRoot, 'add', '.']);
    execFileSync('git', ['-C', gitRoot, 'commit', '--quiet', '-m', 'fixture']);
    const worktreeRoot = path.join(tempRoot, 'linked-worktree');
    execFileSync('git', ['-C', gitRoot, 'worktree', 'add', '--quiet', '--detach', worktreeRoot]);
    const worktreeOutput = runRaw(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', worktreeRoot,
      '--upgrade',
      '--dry-run'
    ]);
    assert.match(worktreeOutput, /\[dry-run\] Upgraded notes graph kit/);

    for (const unsafeRoot of [path.parse(tempRoot).root, os.homedir()]) {
      assert.throws(
        () => runRaw(kitRoot, [
          'install-notes-graph.cjs',
          '--repo', unsafeRoot,
          '--app', 'Unsafe',
          '--allow-non-git',
          '--dry-run'
        ]),
        /Refusing to install/
      );
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('write transaction rolls back early, middle, late, and post-commit failures', () => {
  const installer = requireFromTest(path.join(kitRoot, 'install-notes-graph.cjs'));
  const failures = [
    { phase: 'before-commit', rel: null },
    { phase: 'after-backup', rel: 'existing.txt' },
    { phase: 'after-write', rel: 'nested/new.txt' },
    { phase: 'after-write', rel: 'AGENTS.md' },
    { phase: 'after-commit', rel: null }
  ];
  for (const injected of failures) {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-transaction-'));
    try {
      fs.writeFileSync(path.join(repoRoot, 'existing.txt'), 'original\n');
      fs.writeFileSync(path.join(repoRoot, 'AGENTS.md'), '# Original\n');
      const before = snapshotTree(repoRoot);
      const writes = [
        { rel: 'existing.txt', content: 'replacement\n', kind: 'config' },
        { rel: 'nested/new.txt', content: 'new\n', kind: 'vault' },
        { rel: 'AGENTS.md', content: '# Replaced\n', kind: 'agents' }
      ];
      assert.throws(
        () => installer.executeWriteTransaction(repoRoot, writes, {
          beforeOperation(event) {
            if (event.phase === injected.phase && event.rel === injected.rel) {
              throw new Error(`injected ${event.phase}`);
            }
          }
        }),
        /injected/
      );
      assert.deepEqual(snapshotTree(repoRoot), before);
      assert.equal(
        fs.readdirSync(repoRoot).some((name) => name.startsWith('.notes-graph-kit-transaction-')),
        false
      );
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  }
});

test('write transaction preflights parent collisions without partial writes', () => {
  const installer = requireFromTest(path.join(kitRoot, 'install-notes-graph.cjs'));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-preflight-'));
  try {
    fs.writeFileSync(path.join(repoRoot, 'blocker'), 'not a directory\n');
    const before = snapshotTree(repoRoot);
    assert.throws(
      () => installer.executeWriteTransaction(repoRoot, [
        { rel: 'first.txt', content: 'first\n', kind: 'script' },
        { rel: 'blocker/second.txt', content: 'second\n', kind: 'vault' }
      ]),
      /parent is not a directory/
    );
    assert.deepEqual(snapshotTree(repoRoot), before);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('write transaction preserves permissions on successful replacements', () => {
  const installer = requireFromTest(path.join(kitRoot, 'install-notes-graph.cjs'));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-mode-'));
  try {
    const targetPath = path.join(repoRoot, 'managed-script.cjs');
    fs.writeFileSync(targetPath, 'old\n');
    fs.chmodSync(targetPath, 0o751);
    installer.executeWriteTransaction(repoRoot, [
      { rel: 'managed-script.cjs', content: 'new\n', kind: 'script' }
    ]);
    assert.equal(fs.readFileSync(targetPath, 'utf8'), 'new\n');
    assert.equal(fs.statSync(targetPath).mode & 0o777, 0o751);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('install refuses to clobber an existing config without --force', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-guard-'));
  try {
    run(kitRoot, ['install-notes-graph.cjs', '--repo', repoRoot, '--app', 'Smoke App']);
    assert.throws(
      () => run(kitRoot, ['install-notes-graph.cjs', '--repo', repoRoot, '--app', 'Other App']),
      /already exists/
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('install preserves an existing Scripts directory spelling and promotes js-yaml to runtime', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-uppercase-scripts-'));
  try {
    fs.mkdirSync(path.join(repoRoot, 'Scripts'));
    fs.writeFileSync(path.join(repoRoot, 'package.json'), `${JSON.stringify({
      name: 'uppercase-scripts',
      private: true,
      devDependencies: {
        'js-yaml': '^4.0.0',
        eslint: '^9.0.0'
      }
    }, null, 2)}\n`);
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Uppercase App'
    ]);

    assert.ok(fs.existsSync(path.join(repoRoot, 'Scripts/project-notes.cjs')));
    assert.ok(fs.readdirSync(repoRoot).includes('Scripts'));
    assert.ok(!fs.readdirSync(repoRoot).includes('scripts'));
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.notes, 'node Scripts/project-notes.cjs');
    assert.equal(pkg.scripts['notes:validate'], 'node Scripts/validate-project-notes-graph.cjs');
    assert.equal(pkg.dependencies['js-yaml'], '^4.0.0');
    assert.equal(pkg.devDependencies.eslint, '^9.0.0');
    assert.equal(pkg.devDependencies['js-yaml'], undefined);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('fresh installs stamp all applicable vault migration IDs', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-migration-state-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Migration State App'
    ]);
    const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'notes-graph.config.json'), 'utf8'));
    assert.deepEqual(config.vaultMigrationState, {
      schemaVersion: 1,
      applied: [
        'vault-0.2.16-schema-indexes',
        'vault-0.3.0-typed-templates',
        'vault-0.4.0-managed-sections'
      ]
    });
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('install does not attest migrations when preserving a colliding vault component', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-collision-state-'));
  try {
    fs.mkdirSync(path.join(repoRoot, 'Project Notes', 'Templates'), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, 'Project Notes', 'Templates', 'Runbook Template.md'),
      'custom collision\n'
    );
    run(kitRoot, [
      'install-notes-graph.cjs',
      '--repo', repoRoot,
      '--app', 'Collision App'
    ]);
    const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'notes-graph.config.json'), 'utf8'));
    assert.deepEqual(config.vaultMigrationState, {
      schemaVersion: 1,
      applied: []
    });
    assert.equal(
      fs.readFileSync(
        path.join(repoRoot, 'Project Notes', 'Templates', 'Runbook Template.md'),
        'utf8'
      ),
      'custom collision\n'
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('callable validator reports stable prospective virtual-tree errors', () => {
  const validator = requireFromTest(
    path.join(kitRoot, 'scripts/lib/validate-project-notes-graph.cjs')
  );
  const result = validator.validateProjectNotesGraph({
    vaultRoot: '/virtual/Project Notes',
    config: {
      appName: 'Virtual App',
      vaultDir: 'Project Notes',
      appRel: 'Apps/Virtual App.md',
      routes: []
    },
    files: new Map([
      ['Apps/Virtual App.md', [
        '---',
        'title: Virtual App',
        'schema_version: 1',
        'type: app',
        'status: current',
        'date: "2026-07-28"',
        'tags: [notes/app]',
        'related_apps: ["[[Apps/Virtual App|Virtual App]]"]',
        '---',
        ''
      ].join('\n')],
      ['Managed Root.md', [
        '---',
        'title: Managed Root',
        'schema_version: 1',
        'type: evidence',
        'status: active',
        'date: "2026-07-28"',
        'tags: [notes/evidence]',
        'related_apps: ["[[Apps/Virtual App|Virtual App]]"]',
        '---',
        '',
        '[[Missing Target]]'
      ].join('\n')]
    ])
  });

  assert.deepEqual(result.errors, [
    'Managed Root.md: has broken wikilink [[Missing Target]]'
  ]);
  assert.deepEqual(result.warnings, [
    'route alias "notes-graph-maintenance" points to missing Processes/Notes Graph Maintenance.md'
  ]);
});
