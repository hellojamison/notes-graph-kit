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

function fixture(withContract = true) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-stats-'));
  const vault = path.join(repo, 'Project Notes');
  for (const folder of ['Evidence', 'Runbooks', 'Tasks', 'Templates']) fs.mkdirSync(path.join(vault, folder), { recursive: true });
  fs.writeFileSync(path.join(repo, 'notes-graph.config.json'), JSON.stringify({ vaultDir: 'Project Notes' }));
  fs.writeFileSync(path.join(vault, 'Evidence/Verified.md'), note(
    'schema_version: 1\ntitle: Verified\ntype: evidence\nstatus: verified\ndate: "2026-08-01"',
    '# Verified\n\n## Result\n\nRollback proof links to [[Tasks/Linked]].'
  ));
  fs.writeFileSync(path.join(vault, 'Evidence/Draft.md'), note(
    'schema_version: 1\ntitle: Draft\ntype: evidence\nstatus: draft\ndate: "2026-08-01"',
    '# Draft\n\nReferences [[Missing]] and ambiguous [[Same]].'
  ));
  fs.writeFileSync(path.join(vault, 'Runbooks/Same.md'), note('title: Same A\ntype: runbook\nstatus: current\ndate: "2025-01-01"', '# Same A\n\nOld guide.'));
  fs.writeFileSync(path.join(vault, 'Tasks/Same.md'), note('title: Same B\ntype: task\nstatus: active\ndate: "2026-08-01"', '# Same B\n\nWork.'));
  fs.writeFileSync(path.join(vault, 'Tasks/Linked.md'), note('title: Linked\ntype: task\nstatus: active\ndate: "2026-08-01"', '# Linked\n\nMigration rollback backup.'));
  fs.writeFileSync(path.join(vault, 'Templates/Task.md'), note('title: Task Template\ntype: template\nstatus: current', '# Template'));
  if (withContract) fs.writeFileSync(path.join(repo, 'notes-search-eval.yml'), `schema_version: 1\nqueries:\n  - id: rollback\n    query: migration rollback backup\n    expected:\n      - path: Tasks/Linked.md\n`);
  return repo;
}

function run(repo, args = []) {
  return spawnSync('node', [path.join(kitRoot, 'scripts/project-notes-stats.cjs'), ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, PROJECT_NOTES_NOTES_REPO_ROOT: repo }
  });
}

test('stats reports scale, graph health, evidence, freshness, and evaluation metrics', () => {
  const repo = fixture();
  try {
    const result = run(repo, ['--json', '--top', '2', '--stale-days', '90']);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.scale.notes, 5);
    assert.equal(report.scale.templates, 1);
    assert.deepEqual(report.evidence, { total: 2, verified: 1, unverified: 1 });
    assert.equal(report.graph.brokenLinks, 1);
    assert.equal(report.graph.ambiguousLinks, 1);
    assert.equal(report.freshness.staleCurrentGuides, 1);
    assert.deepEqual(report.freshness.paths, ['Runbooks/Same.md']);
    assert.equal(report.evaluation.status, 'passing');
    assert.equal(report.evaluation.queries, 1);
    assert.equal(typeof report.evaluation.elapsedMs, 'number');
    assert.equal(report.largest.notes.length, 2);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('stats treats an absent default evaluation contract as not configured', () => {
  const repo = fixture(false);
  try {
    const result = run(repo, ['--json']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).evaluation, {
      status: 'not-configured',
      file: 'notes-search-eval.yml'
    });
    const explicit = run(repo, ['--eval-file', 'missing.yml']);
    assert.equal(explicit.status, 2);
    assert.match(explicit.stderr, /does not exist/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('stats rejects invalid options without reading outside the repo', () => {
  const repo = fixture(false);
  try {
    assert.equal(run(repo, ['--top', '0']).status, 2);
    const escaped = run(repo, ['--eval-file', '../outside.yml']);
    assert.equal(escaped.status, 2);
    assert.match(escaped.stderr, /inside the repo/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('stats creates an explicit versioned baseline and passes unchanged comparison', () => {
  const repo = fixture();
  try {
    const created = run(repo, ['--write-baseline', 'notes-stats-baseline.json', '--json']);
    assert.equal(created.status, 0, created.stderr);
    const baselinePath = path.join(repo, 'notes-stats-baseline.json');
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    assert.equal(baseline.schema_version, 1);
    assert.deepEqual(baseline.limits, {});
    assert.equal(Object.hasOwn(baseline, 'generatedAt'), false);
    assert.equal(Object.hasOwn(baseline.metrics.evaluation, 'elapsedMs'), false);

    const compared = run(repo, ['--baseline', 'notes-stats-baseline.json', '--json']);
    assert.equal(compared.status, 0, compared.stderr);
    assert.equal(JSON.parse(compared.stdout).baselineComparison.passed, true);

    const refused = run(repo, ['--write-baseline', 'notes-stats-baseline.json']);
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /already exists/);
    assert.equal(run(repo, ['--write-baseline', 'notes-stats-baseline.json', '--replace-baseline']).status, 0);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('stats baseline exits one on health and retrieval regressions while size is informational', () => {
  const repo = fixture();
  try {
    assert.equal(run(repo, ['--write-baseline', 'baseline.json']).status, 0);
    fs.appendFileSync(path.join(repo, 'Project Notes/Tasks/Linked.md'), '\nA harmless size increase.\n');
    const growthOnly = run(repo, ['--baseline', 'baseline.json', '--json']);
    assert.equal(growthOnly.status, 0, growthOnly.stderr);
    assert.equal(JSON.parse(growthOnly.stdout).baselineComparison.passed, true);

    const baselinePath = path.join(repo, 'baseline.json');
    const stricter = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    stricter.metrics.evaluation.top1_hits += 1;
    fs.writeFileSync(baselinePath, `${JSON.stringify(stricter, null, 2)}\n`);
    const retrievalRegression = run(repo, ['--baseline', 'baseline.json']);
    assert.equal(retrievalRegression.status, 1);
    assert.match(retrievalRegression.stdout, /evaluation top-1 hits decreased/);
    stricter.metrics.evaluation.top1_hits -= 1;
    fs.writeFileSync(baselinePath, `${JSON.stringify(stricter, null, 2)}\n`);

    fs.appendFileSync(path.join(repo, 'Project Notes/Tasks/Linked.md'), '\n[[New Missing Target]]\n');
    const regressed = run(repo, ['--baseline', 'baseline.json', '--json']);
    assert.equal(regressed.status, 1, regressed.stderr);
    const comparison = JSON.parse(regressed.stdout).baselineComparison;
    assert.equal(comparison.passed, false);
    assert.ok(comparison.regressions.some((message) => /broken links increased/.test(message)));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('stats baseline growth limits are opt-in and unsafe paths fail closed', () => {
  const repo = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-stats-outside-'));
  try {
    assert.equal(run(repo, ['--write-baseline', 'baseline.json']).status, 0);
    const baselinePath = path.join(repo, 'baseline.json');
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    baseline.limits.max_note_growth = 0;
    fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    fs.writeFileSync(path.join(repo, 'Project Notes/Tasks/New.md'), note('title: New\ntype: task\nstatus: active\ndate: "2026-08-27"', '# New\n\nLinked from nowhere.'));
    const limited = run(repo, ['--baseline', 'baseline.json']);
    assert.equal(limited.status, 1);
    assert.match(limited.stdout, /note growth exceeded 0/);

    assert.equal(run(repo, ['--baseline', '../outside.json']).status, 2);
    assert.equal(run(repo, ['--write-baseline', '../outside.json']).status, 2);
    fs.symlinkSync(outside, path.join(repo, 'linked'));
    assert.equal(run(repo, ['--write-baseline', 'linked/baseline.json']).status, 2);
    assert.equal(run(repo, ['--replace-baseline']).status, 2);
    assert.equal(run(repo, ['--baseline', 'baseline.json', '--write-baseline', 'other.json']).status, 2);
    const malformed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    malformed.surprise = true;
    fs.writeFileSync(baselinePath, `${JSON.stringify(malformed, null, 2)}\n`);
    const rejected = run(repo, ['--baseline', 'baseline.json']);
    assert.equal(rejected.status, 2);
    assert.match(rejected.stderr, /unknown field/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('stats changed-since reports tracked existing and deleted notes without narrowing global health', () => {
  const repo = fixture(false);
  try {
    for (const args of [['init'], ['config', 'user.email', 'test@example.com'], ['config', 'user.name', 'Test'], ['add', '.'], ['commit', '-m', 'baseline']]) {
      const git = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
      assert.equal(git.status, 0, git.stderr);
    }
    fs.appendFileSync(path.join(repo, 'Project Notes/Tasks/Linked.md'), '\nTracked change.\n');
    fs.rmSync(path.join(repo, 'Project Notes/Evidence/Draft.md'));
    fs.writeFileSync(path.join(repo, 'Project Notes/Tasks/Untracked.md'), '# Untracked\n');
    const result = run(repo, ['--changed-since', 'HEAD', '--json']);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.changedSince.changed, 2);
    assert.deepEqual(report.changedSince.paths, ['Tasks/Linked.md']);
    assert.deepEqual(report.changedSince.deletedPaths, ['Evidence/Draft.md']);
    assert.equal(report.changedSince.trackedOnly, true);
    assert.equal(report.graph.brokenLinks, 0, 'global graph health should still be calculated');
    const invalid = run(repo, ['--changed-since', 'missing-ref']);
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /must resolve to a Git commit/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
