import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(repo, args = []) {
  return spawnSync('node', [path.join(kitRoot, 'scripts/recommend-project-notes-opt-ins.cjs'), ...args], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, PROJECT_NOTES_NOTES_REPO_ROOT: repo }
  });
}

function fixture(noteCount = 20) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-recommend-'));
  const vault = path.join(repo, 'Project Notes');
  fs.mkdirSync(vault, { recursive: true });
  fs.writeFileSync(path.join(repo, 'notes-graph.config.json'), JSON.stringify({ vaultDir: 'Project Notes' }));
  for (let index = 0; index < noteCount; index += 1) fs.writeFileSync(path.join(vault, `${index}.md`), `# Note ${index}\n`);
  return repo;
}

test('recommendations tell agents which opt-ins require approval without writing', () => {
  const repo = fixture();
  try {
    const before = fs.readdirSync(repo, { recursive: true }).sort();
    const result = run(repo, ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.schema_version, 1);
    assert.equal(report.agent_policy.never_enable_opt_ins_silently, true);
    const evaluation = report.recommendations.find(({ id }) => id === 'search-evaluation-contract');
    const baseline = report.recommendations.find(({ id }) => id === 'stats-baseline');
    const duplicates = report.recommendations.find(({ id }) => id === 'duplicate-review');
    assert.equal(evaluation.recommendation, 'recommended');
    assert.equal(evaluation.requires_user_approval, true);
    assert.equal(baseline.requires_user_approval, true);
    assert.equal(duplicates.requires_user_approval, false);
    assert.deepEqual(fs.readdirSync(repo, { recursive: true }).sort(), before);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('configured contracts produce read-only commands and evidence-based CI prompts', () => {
  const repo = fixture(5);
  try {
    fs.writeFileSync(path.join(repo, 'notes-search-eval.yml'), 'schema_version: 1\nqueries: []\n');
    fs.writeFileSync(path.join(repo, 'notes-stats-baseline.json'), '{}\n');
    fs.mkdirSync(path.join(repo, '.github/workflows'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.github/workflows/ci.yml'), 'steps:\n  - run: npm run notes:search:eval\n');
    const report = JSON.parse(run(repo, ['--json']).stdout);
    const evaluation = report.recommendations.find(({ id }) => id === 'search-evaluation-contract');
    const evaluationCi = report.recommendations.find(({ id }) => id === 'search-evaluation-ci');
    const baselineCi = report.recommendations.find(({ id }) => id === 'stats-baseline-ci');
    assert.equal(evaluation.command, 'npm run notes:search:eval');
    assert.equal(evaluation.requires_user_approval, false);
    assert.equal(evaluationCi.recommendation, 'enabled');
    assert.equal(baselineCi.recommendation, 'recommended');
    assert.equal(baselineCi.requires_user_approval, true);
    assert.equal(baselineCi.action_kind, 'edits-ci');
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('unsafe opt-in paths require attention and malformed command input exits two', () => {
  const repo = fixture();
  try {
    fs.symlinkSync(path.join(repo, 'Project Notes/0.md'), path.join(repo, 'notes-search-eval.yml'));
    const report = JSON.parse(run(repo, ['--json']).stdout);
    const evaluation = report.recommendations.find(({ id }) => id === 'search-evaluation-contract');
    assert.equal(evaluation.state, 'unsafe');
    assert.equal(evaluation.recommendation, 'attention-required');
    assert.equal(run(repo, ['--unknown']).status, 2);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('install and upgrade deliver and surface the agent recommendation command', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-recommend-install-'));
  try {
    const install = spawnSync('node', [path.join(kitRoot, 'install-notes-graph.cjs'), '--repo', repo, '--app', 'Agent App', '--allow-non-git'], { encoding: 'utf8' });
    assert.equal(install.status, 0, install.stderr);
    assert.match(install.stdout, /npm run notes:recommend/);
    assert.ok(fs.existsSync(path.join(repo, 'scripts/recommend-project-notes-opt-ins.cjs')));
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['notes:recommend'], 'node scripts/recommend-project-notes-opt-ins.cjs');
    const upgrade = spawnSync('node', [path.join(kitRoot, 'install-notes-graph.cjs'), '--repo', repo, '--upgrade', '--allow-non-git'], { encoding: 'utf8' });
    assert.equal(upgrade.status, 0, upgrade.stderr);
    assert.match(upgrade.stdout, /Agent opt-in review:/);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});
