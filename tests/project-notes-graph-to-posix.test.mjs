import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromTest = createRequire(import.meta.url);
const graphLib = requireFromTest(path.join(kitRoot, 'scripts/lib/project-notes-graph.cjs'));

const { toPosix, relativePath, normalizeFrontmatter } = graphLib;

// --- toPosix ---------------------------------------------------------------

test('toPosix leaves forward slashes unchanged', () => {
  assert.equal(toPosix('a/b/c'), 'a/b/c');
});

test('toPosix converts the platform separator to forward slashes', () => {
  const input = 'a' + path.sep + 'b' + path.sep + 'c';
  assert.equal(toPosix(input), 'a/b/c');
});

test('toPosix returns a bare string unchanged when there are no separators', () => {
  assert.equal(toPosix('single'), 'single');
});

test('toPosix handles an empty string', () => {
  assert.equal(toPosix(''), '');
});

// --- relativePath ----------------------------------------------------------

test('relativePath returns a POSIX-style relative path', () => {
  assert.equal(relativePath('/vault/sub/file.md', '/vault'), 'sub/file.md');
});

test('relativePath returns just the filename when file is in vault root', () => {
  assert.equal(relativePath('/vault/file.md', '/vault'), 'file.md');
});

// --- normalizeFrontmatter --------------------------------------------------

test('normalizeFrontmatter returns the object when given a plain object', () => {
  const obj = { type: 'task', title: 'Test' };
  assert.equal(normalizeFrontmatter(obj), obj);
});

test('normalizeFrontmatter returns an empty object for null', () => {
  assert.deepEqual(normalizeFrontmatter(null), {});
});

test('normalizeFrontmatter returns an empty object for undefined', () => {
  assert.deepEqual(normalizeFrontmatter(undefined), {});
});

test('normalizeFrontmatter returns an empty object for a string', () => {
  assert.deepEqual(normalizeFrontmatter('hello'), {});
});

test('normalizeFrontmatter returns an empty object for a number', () => {
  assert.deepEqual(normalizeFrontmatter(42), {});
});

test('normalizeFrontmatter returns an empty object for an array', () => {
  assert.deepEqual(normalizeFrontmatter([1, 2]), {});
});

test('normalizeFrontmatter returns an empty object for a boolean', () => {
  assert.deepEqual(normalizeFrontmatter(true), {});
});
