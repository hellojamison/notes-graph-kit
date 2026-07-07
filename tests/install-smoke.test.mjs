import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cwd, args) {
  return execFileSync('node', args, { cwd, encoding: 'utf8' });
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

    const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'notes-graph.config.json'), 'utf8'));
    assert.equal(config.appName, 'Smoke App');
    assert.ok(config.kitVersion);

    const appNote = fs.readFileSync(path.join(repoRoot, 'Project Notes/Apps/Smoke App.md'), 'utf8');
    assert.ok(!appNote.includes('My Project'), 'placeholder app name should be replaced');

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
