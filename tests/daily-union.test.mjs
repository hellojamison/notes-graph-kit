import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { sortDailyText } = require('../scripts/project-notes.cjs');
const { mergeGitattributes, dailyUnionAttributeLine } = require('../install-notes-graph.cjs');
const helper = path.join(kitRoot, 'scripts/project-notes.cjs');

const header = '---\ntitle: 2026-10-20\ntype: daily\ndaily_format: 2\n---\n\n# 2026-10-20\n';

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, encoding: 'utf8' });
}

test('sortDailyText re-sorts timestamped entries and drops exact duplicates', () => {
  const input = `${header}- 09:00 PDT: a\n- 11:00 PDT: c\n- 10:00 PDT: b\n- 11:00 PDT: c\n`;
  assert.equal(sortDailyText(input), `${header}- 09:00 PDT: a\n- 10:00 PDT: b\n- 11:00 PDT: c\n`);
  const sorted = `${header}- 09:00 PDT: a\n- 09:00 PDT: a2\n- 10:00 PDT: b\n`;
  assert.equal(sortDailyText(sorted), sorted);
});

test('mergeGitattributes appends the daily union rule once and keeps existing lines', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ngk-attrs-'));
  fs.writeFileSync(path.join(repo, '.gitattributes'), '*.pdf binary');
  const write = mergeGitattributes(repo, 'My Notes');
  assert.equal(write.rel, '.gitattributes');
  assert.match(write.content, /^\*\.pdf binary\n\n# Daily notes/);
  assert.ok(write.content.endsWith(`${dailyUnionAttributeLine('My Notes')}\n`));
  fs.writeFileSync(path.join(repo, '.gitattributes'), write.content);
  assert.equal(mergeGitattributes(repo, 'My Notes'), null);
  fs.rmSync(repo, { recursive: true, force: true });
});

test('a rebase of two branches appending to one daily log keeps both lines; daily-sort restores order', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ngk-union-'));
  const vault = path.join(repo, 'Project Notes');
  const daily = path.join(vault, '2026-10-20.md');
  const status = path.join(vault, 'Status');
  fs.mkdirSync(status, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, '.gitattributes'), `${dailyUnionAttributeLine('Project Notes')}\n`);
  fs.writeFileSync(daily, `${header}- 08:00 PDT: base\n`);
  fs.writeFileSync(path.join(status, 'S.md'), 'phase: base\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'base');

  git(repo, 'checkout', '-qb', 'feature');
  fs.appendFileSync(daily, '- 09:00 PDT: feature\n');
  git(repo, 'commit', '-qam', 'feature');
  git(repo, 'checkout', '-q', 'main');
  fs.appendFileSync(daily, '- 10:00 PDT: main\n');
  git(repo, 'commit', '-qam', 'main');

  git(repo, 'checkout', '-q', 'feature');
  git(repo, 'rebase', '-q', 'main');
  const merged = fs.readFileSync(daily, 'utf8');
  assert.match(merged, /- 09:00 PDT: feature/);
  assert.match(merged, /- 10:00 PDT: main/);

  const env = { ...process.env, PROJECT_NOTES_NOTES_VAULT_ROOT: vault };
  const check = spawnSync('node', [helper, 'daily-sort', '--check'], { cwd: repo, env, encoding: 'utf8' });
  assert.notEqual(check.status, 0);
  assert.match(check.stderr, /2026-10-20\.md/);
  execFileSync('node', [helper, 'daily-sort'], { cwd: repo, env, encoding: 'utf8' });
  assert.equal(fs.readFileSync(daily, 'utf8'), `${header}- 08:00 PDT: base\n- 09:00 PDT: feature\n- 10:00 PDT: main\n`);
  execFileSync('node', [helper, 'daily-sort', '--check'], { cwd: repo, env, encoding: 'utf8' });
  git(repo, 'commit', '-qam', 'sort daily');

  // Current-truth notes are not union-merged: their conflicts stay real.
  git(repo, 'checkout', '-q', 'main');
  fs.writeFileSync(path.join(status, 'S.md'), 'phase: main\n');
  git(repo, 'commit', '-qam', 'status main');
  git(repo, 'checkout', '-qb', 'other', 'HEAD~1');
  fs.writeFileSync(path.join(status, 'S.md'), 'phase: other\n');
  git(repo, 'commit', '-qam', 'status other');
  const conflict = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'merge', 'main'], { cwd: repo, encoding: 'utf8' });
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stdout, /CONFLICT/);
  fs.rmSync(repo, { recursive: true, force: true });
});
