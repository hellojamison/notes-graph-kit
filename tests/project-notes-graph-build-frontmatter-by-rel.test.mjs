import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromTest = createRequire(import.meta.url);
const graphLib = requireFromTest(path.join(kitRoot, 'scripts/lib/project-notes-graph.cjs'));

const { buildFrontmatterByRel, firstFolder, dailyEntryDir } = graphLib;

// --- buildFrontmatterByRel -------------------------------------------------

test('buildFrontmatterByRel returns a Map from rel to frontmatter', () => {
  const notes = [
    { rel: 'Tasks/A.md', frontmatter: { type: 'task', title: 'A' } },
    { rel: 'Tasks/B.md', frontmatter: { type: 'task', title: 'B' } },
  ];
  const result = buildFrontmatterByRel(notes);
  assert.ok(result instanceof Map);
  assert.deepEqual(result.get('Tasks/A.md'), { type: 'task', title: 'A' });
  assert.deepEqual(result.get('Tasks/B.md'), { type: 'task', title: 'B' });
});

test('buildFrontmatterByRel skips notes without frontmatter', () => {
  const notes = [
    { rel: 'Tasks/A.md', frontmatter: { type: 'task' } },
    { rel: 'Tasks/B.md', frontmatter: null },
    { rel: 'Tasks/C.md' },
  ];
  const result = buildFrontmatterByRel(notes);
  assert.ok(result.has('Tasks/A.md'));
  assert.equal(result.has('Tasks/B.md'), false);
  assert.equal(result.has('Tasks/C.md'), false);
});

test('buildFrontmatterByRel returns an empty Map for an empty array', () => {
  const result = buildFrontmatterByRel([]);
  assert.ok(result instanceof Map);
  assert.equal(result.size, 0);
});

test('buildFrontmatterByRel overwrites duplicates with the last value', () => {
  const notes = [
    { rel: 'Tasks/A.md', frontmatter: { type: 'task' } },
    { rel: 'Tasks/A.md', frontmatter: { type: 'evidence' } },
  ];
  const result = buildFrontmatterByRel(notes);
  assert.deepEqual(result.get('Tasks/A.md'), { type: 'evidence' });
});

// --- firstFolder -----------------------------------------------------------

test('firstFolder returns the top-level folder', () => {
  assert.equal(firstFolder('Tasks/A.md'), 'Tasks');
  assert.equal(firstFolder('Processes/My Process.md'), 'Processes');
  assert.equal(firstFolder('Apps/My Project.md'), 'Apps');
});

test('firstFolder handles nested paths', () => {
  assert.equal(firstFolder('Daily/2026-10-31/entry.md'), 'Daily');
  assert.equal(firstFolder('Templates/Sub/dir.md'), 'Templates');
});

test('firstFolder handles a bare filename with no slash', () => {
  assert.equal(firstFolder('README.md'), 'README.md');
});

test('firstFolder handles an empty string', () => {
  assert.equal(firstFolder(''), '');
});

// --- dailyEntryDir ---------------------------------------------------------

test('dailyEntryDir joins vault root with Daily folder and date', () => {
  assert.equal(dailyEntryDir('/vault', '2026-10-31'), path.join('/vault', 'Daily', '2026-10-31'));
});

test('dailyEntryDir handles different date formats', () => {
  assert.equal(dailyEntryDir('/vault', '1999-01-01'), path.join('/vault', 'Daily', '1999-01-01'));
  assert.equal(dailyEntryDir('/vault', '2026-12-31'), path.join('/vault', 'Daily', '2026-12-31'));
});

test('dailyEntryDir handles nested vault root paths', () => {
  assert.equal(
    dailyEntryDir('/home/user/projects/my-app', '2026-10-31'),
    path.join('/home/user/projects/my-app', 'Daily', '2026-10-31')
  );
});
