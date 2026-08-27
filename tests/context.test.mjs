import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function note(frontmatter, body) {
  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

function fixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-context-'));
  const vault = path.join(repo, 'Project Notes');
  for (const folder of ['Evidence', 'Decisions', 'Runbooks', 'Templates']) fs.mkdirSync(path.join(vault, folder), { recursive: true });
  fs.writeFileSync(path.join(repo, 'notes-graph.config.json'), JSON.stringify({ vaultDir: 'Project Notes' }));
  fs.writeFileSync(path.join(vault, 'Evidence/Rollback.md'), note(
    'title: Rollback Proof\ntype: evidence\nstatus: verified\ndate: "2026-08-27"',
    '# Rollback Proof\n\n## Verification\n\nMigration rollback restored the backup byte for byte. See [[Decisions/Recovery Policy]] and [[Runbooks/Restore]].'
  ));
  fs.writeFileSync(path.join(vault, 'Decisions/Recovery Policy.md'), note(
    'title: Recovery Policy\ntype: decision\nstatus: current\ndate: "2026-08-20"',
    '# Recovery Policy\n\n## Decision\n\nAlways preserve an immutable baseline before applying a migration.'
  ));
  fs.writeFileSync(path.join(vault, 'Runbooks/Restore.md'), note(
    'title: Restore\ntype: runbook\nstatus: current\ndate: "2026-08-20"',
    `# Restore\n\n## Current Status\n\n${Array.from({ length: 160 }, (_, index) => `restore${index}`).join(' ')}`
  ));
  fs.writeFileSync(path.join(vault, 'Templates/Task.md'), note('title: Template\ntype: template\nstatus: current', '# Migration rollback template'));
  return repo;
}

function run(repo, args = []) {
  return spawnSync('node', [path.join(kitRoot, 'scripts/build-project-notes-context.cjs'), ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, PROJECT_NOTES_NOTES_REPO_ROOT: repo }
  });
}

test('context packs ranked sections and one-hop operational links deterministically', () => {
  const repo = fixture();
  try {
    const args = ['migration rollback backup', '--results', '1', '--max-words', '120', '--json'];
    const first = run(repo, args);
    const second = run(repo, args);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, second.stdout);
    const report = JSON.parse(first.stdout);
    assert.equal(report.items[0].kind, 'match');
    assert.equal(report.items[0].path, 'Evidence/Rollback.md');
    assert.deepEqual(report.items.slice(1).map((item) => item.path), [
      'Decisions/Recovery Policy.md',
      'Runbooks/Restore.md'
    ]);
    assert.ok(report.budget.usedSourceWords <= 120);
    assert.equal(report.budget.usedSourceWords + report.budget.remainingSourceWords, 120);
    assert.equal(report.items.at(-1).truncated, true);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('context filters seed results but allows their reviewed one-hop relationships', () => {
  const repo = fixture();
  try {
    const result = run(repo, ['migration rollback', '--type', 'evidence', '--status', 'verified', '--json']);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.filters.type, ['evidence']);
    assert.equal(report.items[0].type, 'evidence');
    assert.ok(report.items.some((item) => item.kind === 'related' && item.type === 'decision'));
    assert.equal(report.items.some((item) => item.type === 'template'), false);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('context rejects missing queries and invalid bounds without writing', () => {
  const repo = fixture();
  try {
    const before = fs.readdirSync(path.join(repo, 'Project Notes'), { recursive: true }).sort();
    for (const args of [[], ['query', '--max-words', '99'], ['query', '--results', '21'], ['query', '--unknown']]) {
      assert.equal(run(repo, args).status, 2);
    }
    assert.deepEqual(fs.readdirSync(path.join(repo, 'Project Notes'), { recursive: true }).sort(), before);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('installed repos receive the context command and managed script', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-context-install-'));
  try {
    const install = spawnSync('node', [
      path.join(kitRoot, 'install-notes-graph.cjs'), '--repo', repo, '--app', 'Context App', '--allow-non-git'
    ], { encoding: 'utf8' });
    assert.equal(install.status, 0, install.stderr);
    assert.ok(fs.existsSync(path.join(repo, 'scripts/build-project-notes-context.cjs')));
    assert.ok(fs.existsSync(path.join(repo, 'scripts/evaluate-project-notes-context.cjs')));
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['notes:context'], 'node scripts/build-project-notes-context.cjs');
    assert.equal(pkg.scripts['notes:context:eval'], 'node scripts/evaluate-project-notes-context.cjs');
    assert.equal(fs.existsSync(path.join(repo, 'notes-context-eval.yml')), false);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
