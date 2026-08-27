import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromTest = createRequire(import.meta.url);

function run(cwd, args, env = {}) {
  return execFileSync('node', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

function writeNote(vaultRoot, rel, frontmatter, body) {
  const target = path.join(vaultRoot, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `---\n${frontmatter}\n---\n\n${body}\n`);
}

function searchFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-search-'));
  const vaultRoot = path.join(repoRoot, 'Project Notes');
  fs.mkdirSync(vaultRoot, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'notes-graph.config.json'), JSON.stringify({
    appName: 'Search App',
    vaultDir: 'Project Notes'
  }));
  writeNote(vaultRoot, 'Evidence/Verified Rollback.md', [
    'schema_version: 1',
    'title: Verified Rollback',
    'type: evidence',
    'status: verified',
    'date: "2026-08-27"',
    'tags: [notes/evidence]'
  ].join('\n'), [
    '# Verified Rollback',
    '',
    '## Verification',
    '',
    'The migration rollback restored every original byte and POSIX mode.',
    '',
    '```md',
    'rollback text inside a fenced example should not be searched',
    '```'
  ].join('\n'));
  writeNote(vaultRoot, 'Decisions/Backup Policy.md', [
    'schema_version: 1',
    'title: Backup Policy',
    'type: decision',
    'status: current',
    'date: "2026-07-01"',
    'tags: [notes/decision]'
  ].join('\n'), [
    '# Backup Policy',
    '',
    '## Decision',
    '',
    'Every migration must produce a rollback backup before writes begin.'
  ].join('\n'));
  writeNote(vaultRoot, 'Templates/Rollback Template.md', [
    'title: Rollback Template',
    'type: template',
    'status: active',
    'date: "2026-08-27"',
    'tags: [template]'
  ].join('\n'), '# Rollback Template\n\nrollback rollback rollback');
  writeNote(vaultRoot, 'Evidence/Authority Tie.md', [
    'schema_version: 1',
    'title: Authority Comparison',
    'type: evidence',
    'status: verified',
    'date: "2026-08-27"',
    'tags: [notes/evidence]'
  ].join('\n'), '# Authority Comparison\n\n## Finding\n\nExact authority comparison phrase.');
  writeNote(vaultRoot, '2026-08-26.md', [
    'schema_version: 1',
    'title: Authority Comparison',
    'type: daily',
    'status: active',
    'date: "2026-08-26"',
    'tags: [notes/daily]'
  ].join('\n'), '# Authority Comparison\n\n## Finding\n\nExact authority comparison phrase.');
  return { repoRoot, vaultRoot };
}

test('notes search returns deterministic section results with metadata', () => {
  const { repoRoot } = searchFixture();
  try {
    const output = run(kitRoot, [
      'scripts/search-project-notes.cjs',
      'migration rollback',
      '--json'
    ], { PROJECT_NOTES_NOTES_REPO_ROOT: repoRoot });
    const result = JSON.parse(output);
    assert.equal(result.query, 'migration rollback');
    assert.deepEqual(
      result.results.map((item) => [item.path, item.heading]),
      [
        ['Evidence/Verified Rollback.md', 'Verification'],
        ['Decisions/Backup Policy.md', 'Decision']
      ]
    );
    assert.equal(result.results[0].type, 'evidence');
    assert.equal(result.results[0].authority.multiplier, 1.2);
    assert.ok(result.results[0].score > result.results[0].lexicalScore);
    assert.ok(result.results.every((item) => item.path !== 'Templates/Rollback Template.md'));
    assert.deepEqual(
      JSON.parse(run(kitRoot, [
        'scripts/search-project-notes.cjs',
        'migration rollback',
        '--json'
      ], { PROJECT_NOTES_NOTES_REPO_ROOT: repoRoot })),
      result
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('authority adjustments improve equal lexical matches without creating relevance', () => {
  const { repoRoot } = searchFixture();
  try {
    const env = { PROJECT_NOTES_NOTES_REPO_ROOT: repoRoot };
    const tied = JSON.parse(run(kitRoot, [
      'scripts/search-project-notes.cjs', 'exact authority comparison phrase', '--json'
    ], env));
    assert.deepEqual(
      tied.results.slice(0, 2).map((item) => item.path),
      ['Evidence/Authority Tie.md', '2026-08-26.md']
    );
    assert.equal(tied.results[0].lexicalScore, tied.results[1].lexicalScore);
    assert.equal(tied.results[0].authority.multiplier, 1.2);
    assert.equal(tied.results[1].authority.multiplier, 0.92);

    const unrelated = JSON.parse(run(kitRoot, [
      'scripts/search-project-notes.cjs', 'POSIX byte restoration', '--json'
    ], env));
    assert.ok(unrelated.results.every((item) => item.path !== 'Evidence/Authority Tie.md'));
    assert.ok(unrelated.results.every((item) => item.path !== '2026-08-26.md'));
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('authority policy is bounded and explicit for operational note classes', () => {
  const { authorityFor } = requireFromTest(
    path.join(kitRoot, 'scripts/search-project-notes.cjs')
  );
  assert.deepEqual(authorityFor({ type: 'evidence', status: 'verified' }), {
    multiplier: 1.2,
    reasons: ['evidence note', 'verified status']
  });
  assert.equal(authorityFor({ type: 'decision', status: 'current' }).multiplier, 1.15);
  assert.equal(authorityFor({ type: 'runbook', status: 'current' }).multiplier, 1.12);
  assert.equal(authorityFor({ type: 'process', status: 'draft' }).multiplier, 1.05);
  assert.equal(authorityFor({ type: 'release', status: 'packaged' }).multiplier, 1.1);
  assert.equal(authorityFor({ type: 'incident', status: 'done' }).multiplier, 1.07);
  assert.equal(authorityFor({ type: 'task', status: 'active' }).multiplier, 1);
  assert.equal(authorityFor({ type: 'daily', status: 'active' }).multiplier, 0.92);
  assert.equal(
    authorityFor({ type: 'evidence', status: 'verified', source_of_truth: true }).multiplier,
    1.25,
    'combined authority must remain capped'
  );
});

test('notes search supports type, status, since, limit, and template filters', () => {
  const { repoRoot } = searchFixture();
  try {
    const env = { PROJECT_NOTES_NOTES_REPO_ROOT: repoRoot };
    const filtered = JSON.parse(run(kitRoot, [
      'scripts/search-project-notes.cjs', 'rollback',
      '--type', 'evidence', '--status', 'verified', '--since', '2026-08-01',
      '--limit', '1', '--json'
    ], env));
    assert.equal(filtered.count, 1);
    assert.equal(filtered.results[0].path, 'Evidence/Verified Rollback.md');
    assert.equal(filtered.results[0].heading, 'Verification');
    assert.doesNotMatch(filtered.results[0].excerpt, /fenced example/);

    const withTemplates = JSON.parse(run(kitRoot, [
      'scripts/search-project-notes.cjs', 'rollback',
      '--type', 'template', '--include-templates', '--json'
    ], env));
    assert.equal(withTemplates.count, 1);
    assert.equal(withTemplates.results[0].path, 'Templates/Rollback Template.md');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('notes search rejects invalid options and empty queries', () => {
  for (const args of [
    ['scripts/search-project-notes.cjs'],
    ['scripts/search-project-notes.cjs', 'query', '--since', 'yesterday'],
    ['scripts/search-project-notes.cjs', 'query', '--limit', '0'],
    ['scripts/search-project-notes.cjs', 'query', '--unknown']
  ]) {
    const result = spawnSync('node', args, { cwd: kitRoot, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
  }
});

test('installed repos receive the search command and script', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-search-install-'));
  try {
    run(kitRoot, [
      'install-notes-graph.cjs', '--repo', repoRoot, '--app', 'Search App', '--allow-non-git'
    ]);
    fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
    assert.ok(fs.existsSync(path.join(repoRoot, 'scripts/search-project-notes.cjs')));
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['notes:search'], 'node scripts/search-project-notes.cjs');
    const output = run(repoRoot, [
      'scripts/search-project-notes.cjs', 'notes workflow', '--json'
    ]);
    assert.equal(typeof JSON.parse(output).count, 'number');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
