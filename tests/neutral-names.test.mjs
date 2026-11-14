import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const kitRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const run = (args, cwd = kitRoot) => execFileSync(process.execPath, args, {
  cwd,
  encoding: 'utf8',
  env: { ...process.env, NODE_PATH: path.join(kitRoot, 'node_modules') }
});

function freshRepo() {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-neutral-')));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  return repo;
}

function filesUnder(root) {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name))
    .filter((file) => !file.includes(`${path.sep}.git${path.sep}`) && !file.includes(`${path.sep}node_modules${path.sep}`));
}

const BRAND = /claude|codex/i;

test('a default install and upgrade write no agent brand names', () => {
  const repo = freshRepo();
  try {
    run(['install-notes-graph.cjs', '--repo', repo, '--app', 'Neutral App']);
    run(['install-notes-graph.cjs', '--repo', repo, '--upgrade']);
    const config = JSON.parse(fs.readFileSync(path.join(repo, 'notes-graph.config.json'), 'utf8'));
    assert.equal(config.agent, 'agents');
    assert.equal(config.instructionFile, 'AGENTS.md');
    assert.equal(config.legacyStructuredFolders, undefined);
    assert.ok(fs.existsSync(path.join(repo, 'Project Notes/_Agent/Start Here.md')));
    const offenders = filesUnder(repo).filter((file) => {
      if (BRAND.test(path.relative(repo, file))) return true;
      const text = fs.readFileSync(file, 'utf8');
      // The 0.15.0 migration keeps its recorded id so applied state stays valid.
      return BRAND.test(text.replaceAll('vault-0.15.0-claude-instructions', ''));
    });
    assert.deepEqual(offenders.map((file) => path.relative(repo, file)), []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('upgrading a vault that uses the current entry folder keeps it and accepts the saved agents value', () => {
  const repo = freshRepo();
  try {
    run(['install-notes-graph.cjs', '--repo', repo, '--app', 'Neutral App']);
    const before = fs.readFileSync(path.join(repo, 'AGENTS.md'), 'utf8');
    run(['install-notes-graph.cjs', '--repo', repo, '--upgrade']);
    assert.equal(fs.readFileSync(path.join(repo, 'AGENTS.md'), 'utf8'), before);
    assert.equal(fs.existsSync(path.join(repo, 'Project Notes/_Codex')), false);
    run(['scripts/validate-project-notes-graph.cjs'], repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('upgrading a vault that still uses the legacy entry folder keeps it working', () => {
  const repo = freshRepo();
  try {
    run(['install-notes-graph.cjs', '--repo', repo, '--app', 'Legacy App']);
    fs.renameSync(path.join(repo, 'Project Notes/_Agent'), path.join(repo, 'Project Notes/_Codex'));
    fs.rmSync(path.join(repo, 'AGENTS.md'));
    const configPath = path.join(repo, 'notes-graph.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.agent = 'codex';
    delete config.instructionFile;
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    run(['install-notes-graph.cjs', '--repo', repo, '--upgrade']);
    const upgraded = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(upgraded.agent, 'agents');
    assert.equal(upgraded.instructionFile, 'AGENTS.md');
    assert.deepEqual(upgraded.legacyStructuredFolders, ['_Codex']);
    assert.match(fs.readFileSync(path.join(repo, 'AGENTS.md'), 'utf8'), /Project Notes\/_Codex\/Start Here\.md/);
    assert.equal(fs.existsSync(path.join(repo, 'Project Notes/_Agent')), false);
    const graph = path.join(repo, 'scripts/lib/project-notes-graph.cjs');
    const out = run(['-e', `const g=require(${JSON.stringify(graph)});g.getConfig({PROJECT_NOTES_NOTES_REPO_ROOT:${JSON.stringify(repo)}});console.log(g.isStructured('_Codex/Start Here.md'),g.isStructured('_Agent/Start Here.md'))`], repo);
    assert.equal(out.trim(), 'true true');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
