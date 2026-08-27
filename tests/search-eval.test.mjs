import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function writeFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-search-eval-'));
  const vaultRoot = path.join(repoRoot, 'Project Notes');
  fs.mkdirSync(path.join(vaultRoot, 'Evidence'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'notes-graph.config.json'), JSON.stringify({
    appName: 'Eval App',
    vaultDir: 'Project Notes'
  }));
  fs.writeFileSync(path.join(vaultRoot, 'Evidence/Expected.md'), [
    '---',
    'schema_version: 1',
    'title: Expected Result',
    'type: evidence',
    'status: verified',
    'date: "2026-08-27"',
    'tags: [notes/evidence]',
    '---',
    '',
    '# Expected Result',
    '',
    '## Verification',
    '',
    'The rollback restored the migration backup exactly.',
    ''
  ].join('\n'));
  fs.writeFileSync(path.join(vaultRoot, 'Evidence/Distractor.md'), [
    '---',
    'schema_version: 1',
    'title: Distractor',
    'type: evidence',
    'status: done',
    'date: "2026-08-27"',
    'tags: [notes/evidence]',
    '---',
    '',
    '# Distractor',
    '',
    '## Notes',
    '',
    'A migration can have unrelated planning details.',
    ''
  ].join('\n'));
  return repoRoot;
}

function writeContract(repoRoot, content, name = 'notes-search-eval.yml') {
  fs.writeFileSync(path.join(repoRoot, name), content);
  return name;
}

function runEval(repoRoot, args = []) {
  return spawnSync('node', [
    path.join(kitRoot, 'scripts/evaluate-project-notes-search.cjs'),
    ...args
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, PROJECT_NOTES_NOTES_REPO_ROOT: repoRoot }
  });
}

const passingContract = `schema_version: 1
top_k: 3
queries:
  - id: rollback-verification
    query: rollback migration backup
    filters:
      type: [evidence]
      status: [verified]
      since: "2026-01-01"
    expected:
      - path: Evidence/Expected.md
        heading: Verification
`;

test('search evaluation reports deterministic top-k metrics and JSON', () => {
  const repoRoot = writeFixture();
  try {
    writeContract(repoRoot, passingContract);
    const text = runEval(repoRoot);
    assert.equal(text.status, 0, `${text.stdout}${text.stderr}`);
    assert.match(text.stdout, /1\/1 queries passed at top 3/);
    assert.match(text.stdout, /Top-1: 1\/1/);
    assert.match(text.stdout, /MRR: 1\.000/);

    const json = runEval(repoRoot, ['--json']);
    assert.equal(json.status, 0, `${json.stdout}${json.stderr}`);
    const report = JSON.parse(json.stdout);
    assert.equal(report.passed, true);
    assert.deepEqual(report.summary, {
      queryCount: 1,
      passed: 1,
      failed: 0,
      top1Hits: 1,
      top3Hits: 1,
      meanReciprocalRank: 1
    });
    assert.equal(report.queries[0].expected[0].rank, 1);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('search evaluation exits one and shows actual results on a ranking miss', () => {
  const repoRoot = writeFixture();
  try {
    writeContract(repoRoot, passingContract.replace('Evidence/Expected.md', 'Evidence/Missing.md'));
    const result = runEval(repoRoot);
    assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /0\/1 queries passed/);
    assert.match(result.stdout, /expected Evidence\/Missing\.md#Verification: not found/);
    assert.match(result.stdout, /actual 1: Evidence\/Expected\.md#Verification/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('search evaluation rejects malformed, unknown, and escaping inputs with exit two', () => {
  const repoRoot = writeFixture();
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-search-eval-outside-'));
  try {
    const cases = [
      ['bad-version.yml', 'schema_version: 2\nqueries: []\n', /schema_version must be 1/],
      ['unknown.yml', `${passingContract}typo: true\n`, /unknown field/],
      ['bad-path.yml', passingContract.replace('Evidence/Expected.md', '../Expected.md'), /stay inside the vault/],
      ['bad-filter.yml', passingContract.replace('status: \[verified\]', 'statuses: [verified]'), /unknown field/]
    ];
    for (const [name, content, pattern] of cases) {
      writeContract(repoRoot, content, name);
      const result = runEval(repoRoot, ['--file', name]);
      assert.equal(result.status, 2, `${name}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, pattern, name);
    }

    fs.writeFileSync(path.join(outsideRoot, 'outside.yml'), passingContract);
    fs.symlinkSync(outsideRoot, path.join(repoRoot, 'linked'));
    const symlinkEscape = runEval(repoRoot, ['--file', 'linked/outside.yml']);
    assert.equal(symlinkEscape.status, 2);
    assert.match(symlinkEscape.stderr, /stay inside the repo/);

    const lexicalEscape = runEval(repoRoot, ['--file', '../outside.yml']);
    assert.equal(lexicalEscape.status, 2);
    assert.match(lexicalEscape.stderr, /inside the repo/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('installed repos receive the evaluation command without overwriting a contract', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-search-eval-install-'));
  try {
    execFileSync('node', [
      path.join(kitRoot, 'install-notes-graph.cjs'),
      '--repo', repoRoot,
      '--app', 'Eval App',
      '--allow-non-git'
    ]);
    assert.ok(fs.existsSync(path.join(repoRoot, 'scripts/evaluate-project-notes-search.cjs')));
    assert.ok(fs.existsSync(path.join(repoRoot, 'scripts/project-notes-stats.cjs')));
    assert.equal(fs.existsSync(path.join(repoRoot, 'notes-search-eval.yml')), false);
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.equal(
      pkg.scripts['notes:search:eval'],
      'node scripts/evaluate-project-notes-search.cjs'
    );
    assert.equal(pkg.scripts['notes:stats'], 'node scripts/project-notes-stats.cjs');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
