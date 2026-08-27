import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function note(type, body) { return `---\ntitle: Fixture\ntype: ${type}\nstatus: current\n---\n\n${body}\n`; }

function fixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-duplicates-'));
  const vault = path.join(repo, 'Project Notes');
  fs.mkdirSync(path.join(vault, 'Evidence'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'Templates'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'notes-graph.config.json'), JSON.stringify({ vaultDir: 'Project Notes' }));
  const shared = Array.from({ length: 40 }, (_, index) => `shared sequence word ${index} durable recovery plan`).join(' ');
  fs.writeFileSync(path.join(vault, 'Evidence/A.md'), note('evidence', `# A\n\n${shared}`));
  fs.writeFileSync(path.join(vault, 'Evidence/B.md'), note('evidence', `# B\n\n${shared} extra`));
  fs.writeFileSync(path.join(vault, 'Evidence/C.md'), note('evidence', `# C\n\n${Array.from({ length: 50 }, (_, index) => `different material ${index}`).join(' ')}`));
  fs.writeFileSync(path.join(vault, '2026-01-01.md'), note('daily', `# Daily\n\n${shared}`));
  fs.writeFileSync(path.join(vault, 'Templates/T.md'), note('template', `# Template\n\n${shared}`));
  return repo;
}

function run(repo, args = []) {
  return spawnSync('node', [path.join(kitRoot, 'scripts/find-project-notes-duplicates.cjs'), ...args], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, PROJECT_NOTES_NOTES_REPO_ROOT: repo }
  });
}

test('duplicate detection is deterministic, informational, and excludes templates and daily notes', () => {
  const repo = fixture();
  try {
    const first = run(repo, ['--json', '--min-words', '20', '--threshold', '0.8']);
    const second = run(repo, ['--json', '--min-words', '20', '--threshold', '0.8']);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, second.stdout);
    const report = JSON.parse(first.stdout);
    assert.equal(report.pairCount, 1);
    assert.deepEqual([report.pairs[0].left, report.pairs[0].right], ['Evidence/A.md', 'Evidence/B.md']);
    assert.equal(report.includeDaily, false);
    const withDaily = JSON.parse(run(repo, ['--json', '--min-words', '20', '--threshold', '0.8', '--include-daily']).stdout);
    assert.ok(withDaily.pairCount > report.pairCount);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('duplicate detection rejects unsafe or noisy option ranges without writes', () => {
  const repo = fixture();
  try {
    const before = fs.readdirSync(path.join(repo, 'Project Notes'), { recursive: true }).sort();
    for (const args of [['--threshold', '0.49'], ['--min-words', '19'], ['--limit', '0'], ['--unknown']]) {
      assert.equal(run(repo, args).status, 2);
    }
    assert.deepEqual(fs.readdirSync(path.join(repo, 'Project Notes'), { recursive: true }).sort(), before);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('installed repos receive the informational duplicate command', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-duplicates-install-'));
  try {
    const installed = spawnSync('node', [path.join(kitRoot, 'install-notes-graph.cjs'), '--repo', repo, '--app', 'Duplicate App', '--allow-non-git'], { encoding: 'utf8' });
    assert.equal(installed.status, 0, installed.stderr);
    assert.ok(fs.existsSync(path.join(repo, 'scripts/find-project-notes-duplicates.cjs')));
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['notes:duplicates'], 'node scripts/find-project-notes-duplicates.cjs');
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});
