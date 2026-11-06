import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromTest = createRequire(import.meta.url);
const graphLib = requireFromTest(path.join(kitRoot, 'scripts/lib/project-notes-graph.cjs'));

const { resolveRelationshipLinks, currentDateParts, splitFrontmatter } = graphLib;

// --- resolveRelationshipLinks -----------------------------------------------

test('resolveRelationshipLinks resolves a wikilink to the note path', () => {
  const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ngk-rel-'));
  try {
    fs.mkdirSync(path.join(vaultRoot, 'Tasks'), { recursive: true });
    fs.writeFileSync(path.join(vaultRoot, 'Tasks', 'A.md'), '');
    const index = graphLib.buildNoteIndex([path.join(vaultRoot, 'Tasks', 'A.md')], vaultRoot);
    const result = resolveRelationshipLinks('[[Tasks/A]]', { index });
    assert.deepEqual(result, ['Tasks/A.md']);
  } finally {
    fs.rmSync(vaultRoot, { recursive: true });
  }
});

test('resolveRelationshipLinks strips alias and heading from wikilinks', () => {
  const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ngk-rel-'));
  try {
    fs.mkdirSync(path.join(vaultRoot, 'Tasks'), { recursive: true });
    fs.writeFileSync(path.join(vaultRoot, 'Tasks', 'A.md'), '');
    const index = graphLib.buildNoteIndex([path.join(vaultRoot, 'Tasks', 'A.md')], vaultRoot);
    assert.deepEqual(resolveRelationshipLinks('[[Tasks/A|Display]]', { index }), ['Tasks/A.md']);
    assert.deepEqual(resolveRelationshipLinks('[[Tasks/A#Section]]', { index }), ['Tasks/A.md']);
  } finally {
    fs.rmSync(vaultRoot, { recursive: true });
  }
});

test('resolveRelationshipLinks skips non-string values', () => {
  const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ngk-rel-'));
  try {
    fs.mkdirSync(path.join(vaultRoot, 'Tasks'), { recursive: true });
    fs.writeFileSync(path.join(vaultRoot, 'Tasks', 'A.md'), '');
    const index = graphLib.buildNoteIndex([path.join(vaultRoot, 'Tasks', 'A.md')], vaultRoot);
    const result = resolveRelationshipLinks([42, null, undefined], { index });
    assert.deepEqual(result, []);
  } finally {
    fs.rmSync(vaultRoot, { recursive: true });
  }
});

test('resolveRelationshipLinks filters out template notes', () => {
  const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ngk-rel-'));
  try {
    fs.mkdirSync(path.join(vaultRoot, 'Templates'), { recursive: true });
    fs.writeFileSync(path.join(vaultRoot, 'Templates', 'Task.md'), '');
    const index = graphLib.buildNoteIndex([path.join(vaultRoot, 'Templates', 'Task.md')], vaultRoot);
    const result = resolveRelationshipLinks('[[Templates/Task]]', { index });
    assert.deepEqual(result, []);
  } finally {
    fs.rmSync(vaultRoot, { recursive: true });
  }
});

// --- currentDateParts -------------------------------------------------------

test('currentDateParts formats a fixed date correctly', () => {
  const result = currentDateParts(new Date(2026, 9, 15, 8, 30));
  assert.equal(result.date, '2026-10-15');
  assert.equal(result.time, '08:30');
  assert.ok(typeof result.timeZoneName === 'string' && result.timeZoneName.length > 0);
});

test('currentDateParts pads month and day with zeros', () => {
  const result = currentDateParts(new Date(2026, 0, 5, 9, 5));
  assert.equal(result.date, '2026-01-05');
  assert.equal(result.time, '09:05');
});

test('currentDateParts uses the current date when called without arguments', () => {
  const result = currentDateParts();
  const now = new Date();
  const expectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const expectedTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  assert.equal(result.date, expectedDate);
  assert.equal(result.time, expectedTime);
});

// --- splitFrontmatter -------------------------------------------------------

test('splitFrontmatter splits a valid YAML frontmatter block', () => {
  const result = splitFrontmatter('---\ntitle: Hello\n---\nBody content');
  assert.equal(result.body, 'Body content');
  assert.ok(result.frontmatter !== null);
  assert.equal(result.frontmatter.title, 'Hello');
});

test('splitFrontmatter returns null frontmatter when there is no leading ---', () => {
  const result = splitFrontmatter('Hello body');
  assert.equal(result.frontmatter, null);
  assert.equal(result.body, 'Hello body');
});

test('splitFrontmatter returns null frontmatter when there is no closing ---', () => {
  const result = splitFrontmatter('---\ntitle: Hello\nNo closing');
  assert.equal(result.frontmatter, null);
  assert.equal(result.body, '---\ntitle: Hello\nNo closing');
});

test('splitFrontmatter returns null frontmatter for an empty string', () => {
  const result = splitFrontmatter('');
  assert.equal(result.frontmatter, null);
  assert.equal(result.body, '');
});
