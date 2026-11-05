import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromTest = createRequire(import.meta.url);
const graphLib = requireFromTest(path.join(kitRoot, 'scripts/lib/project-notes-graph.cjs'));

const { normalizeFrontmatterDateFields, linkForRel, normalizeInput } = graphLib;

// --- normalizeFrontmatterDateFields -----------------------------------------

test('normalizeFrontmatterDateFields converts a Date date field to YYYY-MM-DD', () => {
  const input = { date: new Date('2026-10-31'), title: 'Test' };
  const result = normalizeFrontmatterDateFields(input);
  assert.equal(result.date, '2026-10-31');
  assert.equal(result.title, 'Test');
});

test('normalizeFrontmatterDateFields converts a Date last_verified field to YYYY-MM-DD', () => {
  const input = { last_verified: new Date('2026-05-15'), status: 'done' };
  const result = normalizeFrontmatterDateFields(input);
  assert.equal(result.last_verified, '2026-05-15');
  assert.equal(result.status, 'done');
});

test('normalizeFrontmatterDateFields converts both date and last_verified', () => {
  const input = {
    date: new Date('2026-10-31'),
    last_verified: new Date('2026-06-01'),
  };
  const result = normalizeFrontmatterDateFields(input);
  assert.equal(result.date, '2026-10-31');
  assert.equal(result.last_verified, '2026-06-01');
});

test('normalizeFrontmatterDateFields leaves string dates untouched', () => {
  const input = { date: '2026-10-31' };
  const result = normalizeFrontmatterDateFields(input);
  assert.equal(result.date, '2026-10-31');
});

test('normalizeFrontmatterDateFields leaves non-Date fields untouched', () => {
  const input = { type: 'task', status: 'open' };
  const result = normalizeFrontmatterDateFields(input);
  assert.equal(result.type, 'task');
  assert.equal(result.status, 'open');
});

test('normalizeFrontmatterDateFields returns a copy without mutating the input', () => {
  const input = { date: new Date('2026-10-31') };
  const result = normalizeFrontmatterDateFields(input);
  assert.ok(input.date instanceof Date);
  assert.equal(result.date, '2026-10-31');
});

test('normalizeFrontmatterDateFields throws on an invalid Date for date', () => {
  const input = { date: new Date('not-a-date') };
  assert.throws(() => normalizeFrontmatterDateFields(input), /date is an invalid Date/);
});

test('normalizeFrontmatterDateFields throws on an invalid Date for last_verified', () => {
  const input = { last_verified: new Date('invalid') };
  assert.throws(() => normalizeFrontmatterDateFields(input), /last_verified is an invalid Date/);
});

test('normalizeFrontmatterDateFields handles an empty object', () => {
  const result = normalizeFrontmatterDateFields({});
  assert.deepEqual(result, {});
});

// --- linkForRel ------------------------------------------------------------

test('linkForRel produces a wikilink with alias when title is provided', () => {
  const result = linkForRel('Tasks/A.md', 'Task A');
  assert.equal(result, '[[Tasks/A|Task A]]');
});

test('linkForRel falls back to basename when no title is given', () => {
  const result = linkForRel('Tasks/B.md');
  assert.equal(result, '[[Tasks/B|B]]');
});

test('linkForRel strips .md extension from the target', () => {
  const result = linkForRel('Notes/Something.md', 'Something');
  assert.equal(result, '[[Notes/Something|Something]]');
});

test('linkForRel strips .base extension from the target', () => {
  const result = linkForRel('Dashboards/R.base', 'Report');
  assert.equal(result, '[[Dashboards/R|Report]]');
});

test('linkForRel strips both .md and .base extensions case-insensitively', () => {
  const result = linkForRel('Docs/Guide.MD');
  assert.equal(result, '[[Docs/Guide|Guide]]');
});

test('linkForRel sanitizes special characters in the alias', () => {
  const result = linkForRel('Tasks/C.md', 'C [|pipe|]');
  assert.equal(result, '[[Tasks/C|C pipe]]');
});

// --- normalizeInput ---------------------------------------------------------

test('normalizeInput lowercases and trims text', () => {
  const result = normalizeInput('Hello World');
  assert.equal(result, 'hello world');
});

test('normalizeInput strips .md extension', () => {
  const result = normalizeInput('tasks/my-task.md');
  assert.equal(result, 'tasks my task');
});

test('normalizeInput converts null to an empty string', () => {
  const result = normalizeInput(null);
  assert.equal(result, '');
});

test('normalizeInput converts undefined to an empty string', () => {
  const result = normalizeInput(undefined);
  assert.equal(result, '');
});

test('normalizeInput converts numbers to lowercase strings', () => {
  const result = normalizeInput(123);
  assert.equal(result, '123');
});

test('normalizeInput replaces non-alphanumeric runs with single spaces', () => {
  const result = normalizeInput('a--b!!c');
  assert.equal(result, 'a b c');
});

test('normalizeInput collapses multiple spaces into one', () => {
  const result = normalizeInput('foo   bar');
  assert.equal(result, 'foo bar');
});

test('normalizeInput trims leading and trailing spaces', () => {
  const result = normalizeInput('  hello  ');
  assert.equal(result, 'hello');
});
