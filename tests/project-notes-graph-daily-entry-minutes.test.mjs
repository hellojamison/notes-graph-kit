import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromTest = createRequire(import.meta.url);
const graphLib = requireFromTest(path.join(kitRoot, 'scripts/lib/project-notes-graph.cjs'));

const { dailyEntryMinutes, getNoteTitle, wikilinkAlias } = graphLib;

// --- dailyEntryMinutes -------------------------------------------------------

test('dailyEntryMinutes parses a valid time and returns total minutes', () => {
  assert.equal(dailyEntryMinutes('- 09:30: some text'), 570);
  assert.equal(dailyEntryMinutes('- 14:15: another'), 855);
});

test('dailyEntryMinutes handles midnight and end-of-day', () => {
  assert.equal(dailyEntryMinutes('- 00:00: start'), 0);
  assert.equal(dailyEntryMinutes('- 23:59: end'), 1439);
});

test('dailyEntryMinutes accepts an optional two-to-five-letter timezone suffix', () => {
  assert.equal(dailyEntryMinutes('- 09:30 EST: with tz'), 570);
  assert.equal(dailyEntryMinutes('- 12:00 UTC: with tz'), 720);
  assert.equal(dailyEntryMinutes('- 18:45 PDT: with tz'), 1125);
});

test('dailyEntryMinutes returns null for lines without the expected prefix', () => {
  assert.equal(dailyEntryMinutes('not a timestamp'), null);
  assert.equal(dailyEntryMinutes('- not valid : missing time'), null);
  assert.equal(dailyEntryMinutes('just text'), null);
});

test('dailyEntryMinutes returns null for invalid hour (out of range)', () => {
  assert.equal(dailyEntryMinutes('- 25:00 : too high'), null);
  assert.equal(dailyEntryMinutes('- 99:99 : way off'), null);
});

test('dailyEntryMinutes returns null for invalid minute (out of range)', () => {
  assert.equal(dailyEntryMinutes('- 10:60 : too many minutes'), null);
  assert.equal(dailyEntryMinutes('- 10:99 : way off'), null);
});

test('dailyEntryMinutes coerces non-string input to string', () => {
  assert.equal(dailyEntryMinutes(123), null);
});

// --- getNoteTitle ------------------------------------------------------------

test('getNoteTitle returns frontmatter.title when present', () => {
  assert.equal(getNoteTitle({ frontmatter: { title: 'My Title' } }), 'My Title');
});

test('getNoteTitle returns title from frontmatter when passed as raw frontmatter object', () => {
  assert.equal(getNoteTitle({ title: 'Direct Title' }), 'Direct Title');
});

test('getNoteTitle falls back to path basename when no title exists', () => {
  assert.equal(getNoteTitle({ frontmatter: {} }, 'Notes/My Note.md'), 'My Note');
});

test('getNoteTitle falls back to noteOrFrontmatter.rel when rel is not provided', () => {
  assert.equal(getNoteTitle({ frontmatter: {}, rel: 'Other/File.md' }), 'File');
});

test('getNoteTitle strips .md extension from fallback basename', () => {
  assert.equal(getNoteTitle({ frontmatter: {} }, 'Deep/Path/Filename.md'), 'Filename');
});

test('getNoteTitle returns an empty string when no title or rel is available', () => {
  assert.equal(getNoteTitle({ frontmatter: {} }), '');
});

test('getNoteTitle returns empty string for null input', () => {
  assert.equal(getNoteTitle(null), '');
});

// --- wikilinkAlias -----------------------------------------------------------

test('wikilinkAlias strips brackets and pipes from a normal value', () => {
  assert.equal(wikilinkAlias('[Some|Title]'), 'Some Title');
});

test('wikilinkAlias collapses multiple spaces into one', () => {
  assert.equal(wikilinkAlias('hello   world'), 'hello world');
});

test('wikilinkAlias trims leading and trailing whitespace', () => {
  assert.equal(wikilinkAlias('  trimmed  '), 'trimmed');
});

test('wikilinkAlias replaces newlines with spaces', () => {
  assert.equal(wikilinkAlias('line1\nline2'), 'line1 line2');
  assert.equal(wikilinkAlias('line1\r\nline2'), 'line1 line2');
});

test('wikilinkAlias handles an empty string', () => {
  assert.equal(wikilinkAlias(''), '');
});

test('wikilinkAlias handles null and undefined', () => {
  assert.equal(wikilinkAlias(null), '');
  assert.equal(wikilinkAlias(undefined), '');
});

test('wikilinkAlias handles a value with only special characters', () => {
  assert.equal(wikilinkAlias('[|]'), '');
});
