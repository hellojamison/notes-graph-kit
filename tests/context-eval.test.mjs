import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-context-eval-'));
  const vault = path.join(repo, 'Project Notes');
  fs.mkdirSync(path.join(vault, 'Evidence'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'Runbooks'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'Templates'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'notes-graph.config.json'), JSON.stringify({ vaultDir: 'Project Notes' }));
  fs.writeFileSync(path.join(vault, 'Evidence/Rollback.md'), '---\ntype: evidence\nstatus: verified\n---\n# Rollback\n\n## Verification\n\nRollback restored bytes. See [[Runbooks/Recovery]].\n');
  fs.writeFileSync(path.join(vault, 'Runbooks/Recovery.md'), '---\ntype: runbook\nstatus: current\n---\n# Recovery\n\n## Current Status\n\nRestore the immutable backup.\n');
  fs.writeFileSync(path.join(vault, 'Templates/Task.md'), '---\ntype: template\n---\n# Rollback template\n');
  return repo;
}

function run(repo, args = []) {
  return spawnSync('node', [path.join(kitRoot, 'scripts/evaluate-project-notes-context.cjs'), ...args], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, PROJECT_NOTES_NOTES_REPO_ROOT: repo }
  });
}

function contract(repo, content) { fs.writeFileSync(path.join(repo, 'notes-context-eval.yml'), content); }

test('context evaluation checks sources, order, exclusions, attribution, and budget', () => {
  const repo = fixture();
  try {
    contract(repo, `schema_version: 1
cases:
  - id: rollback
    query: rollback bytes
    results: 1
    max_words: 100
    required:
      - path: Evidence/Rollback.md
        heading: Verification
        kind: match
      - path: Runbooks/Recovery.md
        kind: related
    ordered:
      - path: Evidence/Rollback.md
      - path: Runbooks/Recovery.md
    forbidden:
      - path: Templates/Task.md
`);
    const result = run(repo, ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.passed, true);
    assert.deepEqual(report.cases[0].invariants, {
      budget_respected: true,
      word_counts_consistent: true,
      sources_attributed: true
    });
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('context evaluation exits one for reviewed expectation misses', () => {
  const repo = fixture();
  try {
    contract(repo, 'schema_version: 1\ncases:\n  - id: miss\n    query: rollback bytes\n    required:\n      - path: Evidence/Missing.md\n');
    const result = run(repo);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /FAIL miss/);
    assert.match(result.stdout, /Evidence\/Missing\.md: missing/);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('context evaluation exits two for malformed and escaping contracts without writes', () => {
  const repo = fixture();
  try {
    const before = fs.readdirSync(repo, { recursive: true }).sort();
    assert.equal(run(repo).status, 2);
    contract(repo, 'schema_version: 1\ncases:\n  - id: bad\n    query: x\n    required: nope\n');
    assert.equal(run(repo).status, 2);
    contract(repo, 'schema_version: 1\ncases:\n  - id: bad\n    query: x\n    unknown: true\n    required:\n      - path: Evidence/Rollback.md\n');
    assert.equal(run(repo).status, 2);
    assert.equal(run(repo, ['--file', '../outside.yml']).status, 2);
    assert.deepEqual(fs.readdirSync(repo, { recursive: true }).sort(), before.concat('notes-context-eval.yml').sort());
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});
