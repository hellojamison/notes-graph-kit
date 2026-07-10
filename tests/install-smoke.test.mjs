import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

function commandOutput(error) {
  return `${error.stdout || ''}${error.stderr || ''}${error.message}`;
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

test('template frontmatter uses the intended note types', () => {
  const expectedTypes = {
    'Project Notes/Templates/App Template.md': 'app',
    'Project Notes/Templates/Process Template.md': 'process',
    'Project Notes/Templates/Runbook Template.md': 'runbook',
    'Project Notes/Templates/Evidence Template.md': 'evidence',
    'Project Notes/Templates/Task Note Template.md': 'template',
    'Project Notes/Templates/Decision Record Template.md': 'template',
    'Project Notes/Templates/Incident Note Template.md': 'template',
    'Project Notes/Templates/Release Note Template.md': 'template'
  };

  for (const [rel, expectedType] of Object.entries(expectedTypes)) {
    assert.equal(readFrontmatter(rel).type, expectedType, rel);
  }
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
    assert.equal(
      listFiles(path.join(repoRoot, 'Project Notes')).some((rel) =>
        /^\d{4}-\d{2}-\d{2}\.md$/.test(rel)
        || /^Evidence\/\d{4}-\d{2}-\d{2} .+\.md$/.test(rel)
      ),
      false
    );

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

    const validateOutput = run(repoRoot, ['scripts/validate-project-notes-graph.cjs']);
    assert.match(validateOutput, /validation passed/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
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
      processRel: 'Processes/Missing Process.md',
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
      /route "missing-route": processRel Processes\/Missing Process\.md must target an existing process note/
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
