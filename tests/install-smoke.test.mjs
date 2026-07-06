import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cwd, args) {
  return execFileSync('node', args, { cwd, encoding: 'utf8' });
}

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
    assert.ok(fs.existsSync(path.join(repoRoot, 'scripts/project-notes.cjs')));
    assert.ok(fs.existsSync(path.join(repoRoot, 'Project Notes/Apps/Smoke App.md')));
    assert.ok(fs.existsSync(path.join(repoRoot, 'Project Notes/Notes System.md')));

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
