import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helper = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/project-notes-handoff.cjs');

function fixture(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-handoff-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  function git(...args) {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git('init', '-q');
  git('config', 'user.name', 'Handoff Test');
  git('config', 'user.email', 'handoff@example.invalid');
  fs.mkdirSync(path.join(repo, 'Project Notes/Evidence'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'notes-graph.config.json'), JSON.stringify({ vaultDir: 'Project Notes' }));
  fs.writeFileSync(path.join(repo, 'source.txt'), 'original source\n');
  const note = 'Project Notes/Evidence/Proof.md';
  fs.writeFileSync(path.join(repo, note), '---\ntitle: Handoff Proof\ntype: evidence\nstatus: verified\ndate: "2026-10-04"\n---\n\n# Handoff Proof\n\nRollback evidence for worker investigation.\n');
  git('add', '.');
  git('commit', '-qm', 'fixture');
  const assignment = {
    question: 'Investigate rollback behavior', sender: 'reviewer', recipient: 'worker',
    scope: ['Inspect source.txt only'], acceptance: ['Return source references and gaps'],
    inputs: ['source.txt'], query: 'rollback evidence', maxWords: 200, results: 1
  };
  const assignmentFile = path.join(repo, 'assignment.json');
  function saveAssignment(value = assignment) { fs.writeFileSync(assignmentFile, JSON.stringify(value)); }
  saveAssignment();
  function run(...args) {
    return spawnSync(process.execPath, [helper, ...args], {
      cwd: repo, encoding: 'utf8', env: { ...process.env, PROJECT_NOTES_NOTES_REPO_ROOT: repo }
    });
  }
  function create() {
    const result = run('create', '--assignment', assignmentFile);
    assert.equal(result.status, 0, result.stderr);
    const packet = JSON.parse(result.stdout);
    const packetFile = path.join(repo, 'packet.json');
    fs.writeFileSync(packetFile, JSON.stringify(packet));
    return { packet, packetFile };
  }
  return { repo, git, note, assignment, assignmentFile, saveAssignment, run, create };
}

test('handoff create/check preserves source, embeds bounded context, and requires review', (t) => {
  const f = fixture(t);
  const before = f.git('status', '--porcelain');
  const { packet, packetFile } = f.create();
  assert.equal(packet.handoffFormat, 1);
  assert.equal(packet.state, 'prepared');
  assert.deepEqual(packet.assignment, f.assignment);
  assert.equal(packet.repository.head, f.git('rev-parse', 'HEAD'));
  assert.ok(packet.context.budget.usedSourceWords <= 200);
  assert.ok(packet.sources.some((item) => item.path === 'Evidence/Proof.md'));
  assert.equal(packet.responseContract.acceptanceOwner, 'reviewer');
  assert.match(packet.responseContract.instruction, /does not certify/);
  const result = f.run('check', '--packet', packetFile);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).fresh, true);
  assert.equal(f.git('status', '--porcelain').replace(/^\?\? packet\.json\n?/m, '').trim(), before);
});

test('handoff detects dirty bytes and retrieved note edits without HEAD changes', (t) => {
  const f = fixture(t);
  const { packet, packetFile } = f.create();
  fs.writeFileSync(path.join(f.repo, 'source.txt'), 'modified without commit\n');
  fs.appendFileSync(path.join(f.repo, f.note), '\nChanged note claim.\n');
  assert.equal(f.git('rev-parse', 'HEAD'), packet.repository.head);
  const result = f.run('check', '--packet', packetFile);
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.fresh, false);
  assert.ok(report.changes.includes('input changed: source.txt'));
  assert.ok(report.changes.includes('note changed: Evidence/Proof.md'));
});

test('handoff captures explicit untracked inputs and detects deletion', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.repo, 'untracked.txt'), 'untracked evidence\n');
  f.saveAssignment({ ...f.assignment, inputs: ['untracked.txt'] });
  const { packet, packetFile } = f.create();
  assert.equal(packet.inputs[0].path, 'untracked.txt');
  fs.unlinkSync(path.join(f.repo, 'untracked.txt'));
  const result = f.run('check', '--packet', packetFile);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).changes.join('\n'), /input unavailable: untracked.txt/);
});

test('handoff detects HEAD changes even when captured file bytes match', (t) => {
  const f = fixture(t);
  const { packetFile } = f.create();
  f.git('commit', '--allow-empty', '-qm', 'new revision');
  const result = f.run('check', '--packet', packetFile);
  assert.equal(result.status, 1, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).changes, ['HEAD differs']);
});

test('handoff rejects another worktree identity even with matching HEAD and files', (t) => {
  const f = fixture(t);
  const { packetFile } = f.create();
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-worktree-'));
  const other = path.join(parent, 'other');
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  f.git('worktree', 'add', '--detach', other, 'HEAD');
  const result = spawnSync(process.execPath, [helper, 'check', '--packet', packetFile], {
    cwd: other, encoding: 'utf8', env: { ...process.env, PROJECT_NOTES_NOTES_REPO_ROOT: other }
  });
  assert.equal(result.status, 1, result.stderr);
  const changes = JSON.parse(result.stdout).changes;
  assert.deepEqual(changes, ['worktree root differs', 'vault root differs']);
});

test('handoff rejects traversal and symlinks escaping the repository', (t) => {
  const f = fixture(t);
  for (const input of ['../outside.txt', '/tmp/outside.txt']) {
    f.saveAssignment({ ...f.assignment, inputs: [input] });
    const result = f.run('create', '--assignment', f.assignmentFile);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /relative.*parent traversal/);
  }
  fs.symlinkSync(os.tmpdir(), path.join(f.repo, 'escape'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside');
  f.saveAssignment({ ...f.assignment, inputs: [`escape/${path.basename(outside)}/secret.txt`] });
  const result = f.run('create', '--assignment', f.assignmentFile);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /outside its source root/);
});

test('handoff rejects malformed assignments, options, bounds, and packet digests', (t) => {
  const f = fixture(t);
  for (const value of [null, [], { ...f.assignment, inputs: [] }, { ...f.assignment, acceptance: [''] },
    { ...f.assignment, unexpected: true }, { ...f.assignment, maxWords: 99 }, { ...f.assignment, results: 21 }]) {
    f.saveAssignment(value);
    assert.equal(f.run('create', '--assignment', f.assignmentFile).status, 2);
  }
  for (const args of [['submit'], ['create'], ['check'], ['create', '--assignment'],
    ['create', '--unknown', 'x'], ['create', '--assignment', 'a', '--assignment', 'b']]) {
    assert.equal(f.run(...args).status, 2);
  }
  f.saveAssignment();
  const { packet, packetFile } = f.create();
  packet.inputs[0].sha256 = 'bad';
  fs.writeFileSync(packetFile, JSON.stringify(packet));
  assert.equal(f.run('check', '--packet', packetFile).status, 2);
  fs.writeFileSync(packetFile, JSON.stringify({ handoffFormat: 999 }));
  assert.equal(f.run('check', '--packet', packetFile).status, 2);
});

test('handoff output is exclusive and never overwrites existing files', (t) => {
  const f = fixture(t);
  const output = path.join(f.repo, 'output.json');
  const first = f.run('create', '--assignment', f.assignmentFile, '--out', output);
  assert.equal(first.status, 0, first.stderr);
  const before = fs.readFileSync(output);
  assert.equal(f.run('check', '--packet', output).status, 0);
  const second = f.run('create', '--assignment', f.assignmentFile, '--out', output);
  assert.equal(second.status, 2);
  assert.match(second.stderr, /EEXIST/);
  assert.deepEqual(fs.readFileSync(output), before);
});

test('handoff refuses output inside the canonical vault including symlink aliases', (t) => {
  const f = fixture(t);
  fs.symlinkSync(path.join(f.repo, 'Project Notes/Evidence'), path.join(f.repo, 'vault-alias'));
  for (const output of ['Project Notes/Evidence/packet.json', 'vault-alias/packet.json']) {
    const result = f.run('create', '--assignment', f.assignmentFile, '--out', output);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /outside the canonical notes vault/);
    assert.equal(fs.existsSync(path.join(f.repo, output)), false);
  }
});

test('installer supports Scripts spelling and preserves customized handoff commands', (t) => {
  const f = fixture(t);
  const installer = path.resolve(path.dirname(helper), '../install-notes-graph.cjs');
  fs.mkdirSync(path.join(f.repo, 'Scripts'));
  fs.unlinkSync(path.join(f.repo, 'notes-graph.config.json'));
  const customized = 'node custom-handoff.cjs';
  fs.writeFileSync(path.join(f.repo, 'package.json'), JSON.stringify({ name: 'handoff-fixture', private: true, scripts: { 'notes:handoff': customized } }));
  const result = spawnSync(process.execPath, [installer, '--repo', f.repo, '--app', 'Handoff Fixture'], { cwd: f.repo, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.ok(fs.existsSync(path.join(f.repo, 'Scripts/project-notes-handoff.cjs')));
  const pkg = JSON.parse(fs.readFileSync(path.join(f.repo, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['notes:handoff'], customized);
  assert.match(`${result.stdout}${result.stderr}`, /notes:handoff/);
  fs.symlinkSync(path.resolve(path.dirname(helper), '../node_modules'), path.join(f.repo, 'node_modules'));
  const installedHelp = spawnSync(process.execPath, ['Scripts/project-notes-handoff.cjs', '--help'], { cwd: f.repo, encoding: 'utf8' });
  assert.equal(installedHelp.status, 0, installedHelp.stderr);
  assert.match(installedHelp.stdout, /notes:handoff create/);
});

test('upgrade adds handoff to older baseline but refuses an unknown colliding helper', (t) => {
  const f = fixture(t);
  const installer = path.resolve(path.dirname(helper), '../install-notes-graph.cjs');
  fs.unlinkSync(path.join(f.repo, 'notes-graph.config.json'));
  function install(...args) {
    return spawnSync(process.execPath, [installer, '--repo', f.repo, ...args], { cwd: f.repo, encoding: 'utf8' });
  }
  const initial = install('--app', 'Handoff Fixture');
  assert.equal(initial.status, 0, `${initial.stdout}${initial.stderr}`);
  const configPath = path.join(f.repo, 'notes-graph.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  delete config.managedScriptHashes['scripts/project-notes-handoff.cjs'];
  fs.writeFileSync(configPath, JSON.stringify(config));
  const helperPath = path.join(f.repo, 'scripts/project-notes-handoff.cjs');
  fs.writeFileSync(helperPath, 'custom existing helper\n');
  const refused = install('--upgrade');
  assert.notEqual(refused.status, 0);
  assert.match(`${refused.stdout}${refused.stderr}`, /baseline|review required/i);
  assert.equal(fs.readFileSync(helperPath, 'utf8'), 'custom existing helper\n');
  fs.unlinkSync(helperPath);
  const upgrade = install('--upgrade');
  assert.equal(upgrade.status, 0, `${upgrade.stdout}${upgrade.stderr}`);
  assert.ok(fs.existsSync(helperPath));
  assert.ok(JSON.parse(fs.readFileSync(configPath, 'utf8')).managedScriptHashes['scripts/project-notes-handoff.cjs']);
});
