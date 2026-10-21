import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshFixture } from './lib/fresh-fixture.mjs';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromTest = createRequire(import.meta.url);

function run(cwd, args) {
  return execFileSync('node', args, { cwd, encoding: 'utf8' });
}

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, encoding: 'utf8' });
}

function installRepo(name, { gitRepo = false } = {}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `notes-graph-kit-${name}-`));
  if (gitRepo) {
    git(repoRoot, 'init', '-q', '-b', 'main');
  }
  run(kitRoot, [
    'install-notes-graph.cjs',
    '--repo', repoRoot,
    '--app', 'Smoke App',
    ...(gitRepo ? [] : ['--allow-non-git'])
  ]);
  fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
  freshFixture(repoRoot);
  return repoRoot;
}

function newTask(repoRoot, title) {
  const output = run(repoRoot, [
    'scripts/project-notes.cjs', 'new', '--type', 'task', '--title', title,
    '--process', 'notes-graph-maintenance'
  ]);
  const rel = output.match(/^Created (.+)$/m)?.[1];
  assert.ok(rel, output);
  return rel;
}

function closeTask(repoRoot, rel, working) {
  const output = run(repoRoot, [
    'scripts/project-notes.cjs', 'closeout', '--note', path.join('Project Notes', rel),
    '--working', working, '--verified', 'Focused test ran.', '--not-verified', 'Obsidian rendering.'
  ]);
  const dailyRel = output.match(/^Updated (.+)$/m)?.[1];
  assert.ok(dailyRel, output);
  return dailyRel;
}

function legacyDaily(date, lines) {
  return [
    '---', `title: "${date}"`, 'schema_version: 1', 'daily_format: 2', 'type: daily', 'status: active',
    `date: "${date}"`, 'tags:', '  - notes/daily', 'related_apps:', '  - "[[Apps/Smoke App|Smoke App]]"',
    '---', '', `# ${date}`, '', ...lines, ''
  ].join('\n');
}

test('closeout writes one entry file per change and never edits the shared daily note', () => {
  const repoRoot = installRepo('daily-entries');
  try {
    const vault = path.join(repoRoot, 'Project Notes');
    assert.equal(fs.existsSync(path.join(vault, 'Daily')), false, 'install must not copy the kit\'s own daily entries');
    const firstRel = newTask(repoRoot, 'First Daily Change');
    const secondRel = newTask(repoRoot, 'Second Daily Change');
    const date = path.basename(firstRel).slice(0, 10);
    const legacyPath = path.join(vault, `${date}.md`);
    const legacyText = legacyDaily(date, ['- 00:00 PDT: Legacy shared-log outcome.']);
    fs.writeFileSync(legacyPath, legacyText);

    const firstDaily = closeTask(repoRoot, firstRel, 'First change works.');
    const secondDaily = closeTask(repoRoot, secondRel, 'Second change works.');
    assert.match(firstDaily, new RegExp(`^Daily/${date}/\\d{4}-first-daily-change\\.md$`));
    assert.match(secondDaily, new RegExp(`^Daily/${date}/\\d{4}-second-daily-change\\.md$`));
    assert.equal(fs.readFileSync(legacyPath, 'utf8'), legacyText, 'shared daily note must stay untouched');

    const entryText = fs.readFileSync(path.join(vault, firstDaily), 'utf8');
    assert.match(entryText, /^---\n[\s\S]*type: daily\n[\s\S]*---\n\n- \d{2}:\d{2} [A-Z]{2,5}: First change works\. — \[\[Evidence\//);
    assert.equal(entryText.match(/^- \d{2}:\d{2}/gm).length, 1);

    const view = run(repoRoot, ['scripts/project-notes.cjs', 'daily', '--date', date]);
    const lines = view.split('\n').filter((line) => line.startsWith('- '));
    assert.equal(lines.length, 3);
    assert.match(lines[0], /Legacy shared-log outcome/);
    assert.match(lines[1], /First change works/);
    assert.match(lines[2], /Second change works/);
    const json = JSON.parse(run(repoRoot, ['scripts/project-notes.cjs', 'daily', '--date', date, '--json']));
    assert.deepEqual(json.sources, [`${date}.md`, firstDaily, secondDaily].sort((a, b) => (a === `${date}.md` ? -1 : b === `${date}.md` ? 1 : a.localeCompare(b))));
    assert.equal(json.entries.length, 3);

    assert.match(run(repoRoot, ['scripts/validate-project-notes-graph.cjs']), /validation passed/);
    const search = JSON.parse(run(repoRoot, ['scripts/search-project-notes.cjs', 'Second change works', '--json']));
    const hitRels = search.results.map((result) => result.path);
    assert.ok(hitRels.some((rel) => String(rel).startsWith(`Daily/${date}/`)), JSON.stringify(search).slice(0, 500));
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('same-title notes closed in the same minute get unique entry files', () => {
  const repoRoot = installRepo('daily-unique');
  try {
    const cli = requireFromTest(path.join(repoRoot, 'scripts/project-notes.cjs'));
    const firstRel = newTask(repoRoot, 'Same Title');
    const secondRel = newTask(repoRoot, 'Same Title');
    assert.notEqual(firstRel, secondRel);
    const now = new Date(2026, 9, 21, 14, 5, 0);
    const options = { now, env: process.env, vaultRoot: path.join(repoRoot, 'Project Notes') };
    const args = (rel) => ({ note: path.join(repoRoot, 'Project Notes', rel), working: 'Works.', verified: 'Ran.', 'not-verified': 'Nothing.', _: [] });
    const first = cli.closeoutNote(args(firstRel), options);
    const second = cli.closeoutNote(args(secondRel), options);
    assert.equal(first.dailyRel, 'Daily/2026-10-21/1405-same-title.md');
    assert.equal(second.dailyRel, 'Daily/2026-10-21/1405-same-title-2.md');
    assert.equal(fs.existsSync(path.join(repoRoot, 'Project Notes', '2026-10-21.md')), false);
    assert.equal(cli.dailyEntrySlug('Ünïcode: Fix [[links]] / paths!'), 'unicode-fix-links-paths');
    assert.equal(cli.dailyEntrySlug('***'), 'entry');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('two branches closing notes on the same day merge without a daily-note conflict', () => {
  const repoRoot = installRepo('daily-merge', { gitRepo: true });
  try {
    // No union-merge help: drop the legacy .gitattributes rule to prove the
    // entry files alone avoid the conflict.
    fs.rmSync(path.join(repoRoot, '.gitattributes'), { force: true });
    git(repoRoot, 'add', '-A');
    git(repoRoot, 'commit', '-qm', 'install');
    git(repoRoot, 'checkout', '-qb', 'feature-a');
    closeTask(repoRoot, newTask(repoRoot, 'Branch A Change'), 'Branch A works.');
    git(repoRoot, 'add', '-A');
    git(repoRoot, 'commit', '-qm', 'a');
    git(repoRoot, 'checkout', '-q', 'main');
    git(repoRoot, 'checkout', '-qb', 'feature-b');
    closeTask(repoRoot, newTask(repoRoot, 'Branch B Change'), 'Branch B works.');
    git(repoRoot, 'add', '-A');
    git(repoRoot, 'commit', '-qm', 'b');
    git(repoRoot, 'checkout', '-q', 'main');
    git(repoRoot, 'merge', '-q', '--no-edit', 'feature-a');
    const merge = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'merge', '--no-edit', 'feature-b'], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(merge.status, 0, `${merge.stdout}${merge.stderr}`);
    const today = run(repoRoot, ['scripts/project-notes.cjs', 'daily']);
    assert.match(today, /Branch A works/);
    assert.match(today, /Branch B works/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('notes:daily:build writes a git-ignored read-only view that stays out of the graph', () => {
  const repoRoot = installRepo('daily-view', { gitRepo: true });
  try {
    const vault = path.join(repoRoot, 'Project Notes');
    const rel = newTask(repoRoot, 'Viewed Change');
    const date = path.basename(rel).slice(0, 10);
    closeTask(repoRoot, rel, 'Viewed change works.');
    const before = run(repoRoot, ['scripts/project-notes-stats.cjs', '--json']);
    const output = run(repoRoot, ['scripts/project-notes.cjs', 'daily-build', '--date', date]);
    assert.match(output, /read-only view, do not commit/);
    const viewPath = path.join(vault, 'Daily', `${date}.view.md`);
    const viewText = fs.readFileSync(viewPath, 'utf8');
    assert.match(viewText, /Read-only view: do not edit or commit/);
    assert.match(viewText, /Viewed change works/);
    const notesBefore = JSON.parse(before).scale.notes;
    assert.ok(notesBefore > 0);
    assert.equal(JSON.parse(run(repoRoot, ['scripts/project-notes-stats.cjs', '--json'])).scale.notes, notesBefore);
    assert.match(run(repoRoot, ['scripts/validate-project-notes-graph.cjs']), /validation passed/);
    const ignored = spawnSync('git', ['check-ignore', '-q', path.join('Project Notes', 'Daily', `${date}.view.md`)], { cwd: repoRoot });
    assert.equal(ignored.status, 0, 'view must be git-ignored');
    const entryIgnored = spawnSync('git', ['check-ignore', '-q', path.join('Project Notes', 'Daily', date, 'x.md')], { cwd: repoRoot });
    assert.notEqual(entryIgnored.status, 0, 'entry files must stay tracked');
    const out = path.join(repoRoot, 'custom-view.md');
    run(repoRoot, ['scripts/project-notes.cjs', 'daily-build', '--date', date, '--out', out]);
    assert.equal(fs.readFileSync(out, 'utf8'), viewText);
    assert.match(run(repoRoot, ['scripts/project-notes.cjs', 'daily', '--date', '2001-01-01']), /No daily outcomes recorded/);
    assert.throws(() => run(repoRoot, ['scripts/project-notes.cjs', 'daily', '--date', '21-10-2026']), /--date must be YYYY-MM-DD/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('upgrading from 0.18.0 keeps legacy daily notes and adds the daily commands and ignore rule', () => {
  const repoRoot = installRepo('daily-upgrade', { gitRepo: true });
  try {
    const configPath = path.join(repoRoot, 'notes-graph.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.kitVersion = '0.18.0';
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const pkgPath = path.join(repoRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    delete pkg.scripts['notes:daily'];
    delete pkg.scripts['notes:daily:build'];
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    fs.rmSync(path.join(repoRoot, '.gitignore'), { force: true });
    const legacyPath = path.join(repoRoot, 'Project Notes', '2026-10-20.md');
    const legacyText = legacyDaily('2026-10-20', ['- 09:00 PDT: Old outcome.', '- 10:00 PDT: Later outcome.']);
    fs.writeFileSync(legacyPath, legacyText);

    const output = run(kitRoot, ['install-notes-graph.cjs', '--repo', repoRoot, '--upgrade']);
    assert.match(output, /0\.18\.0 -> 0\.19\.0/);
    assert.match(output, /0\.19\.0 daily entries:/);
    assert.match(output, /never edit the shared daily note in PRs/);
    assert.equal(fs.readFileSync(legacyPath, 'utf8'), legacyText);
    const upgradedPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.equal(upgradedPkg.scripts['notes:daily'], 'node scripts/project-notes.cjs daily');
    assert.equal(upgradedPkg.scripts['notes:daily:build'], 'node scripts/project-notes.cjs daily-build');
    assert.match(fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8'), /^\/Project Notes\/Daily\/\*\.view\.md$/m);
    const view = run(repoRoot, ['scripts/project-notes.cjs', 'daily', '--date', '2026-10-20']);
    assert.match(view, /- 09:00 PDT: Old outcome\.\n- 10:00 PDT: Later outcome\./);
    assert.match(run(repoRoot, ['scripts/validate-project-notes-graph.cjs']), /validation passed/);

    const again = run(kitRoot, ['install-notes-graph.cjs', '--repo', repoRoot, '--upgrade']);
    assert.doesNotMatch(again, /0\.19\.0 daily entries:/);
    assert.equal(fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8').match(/view\.md/g).length, 1);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
