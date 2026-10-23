import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isSafeArtifactRel, asArray } = require('../scripts/lib/project-notes-receipts.cjs');

test('asArray returns the same array for an array', () => {
  const arr = [1, 2];
  assert.strictEqual(asArray(arr), arr);
});

test('asArray returns [] for null', () => {
  assert.deepEqual(asArray(null), []);
});

test('asArray returns [] for undefined', () => {
  assert.deepEqual(asArray(undefined), []);
});

test('asArray wraps a single value in an array', () => {
  assert.deepEqual(asArray(42), [42]);
  assert.deepEqual(asArray('hello'), ['hello']);
});

test('isSafeArtifactRel is true for artifacts/run.json', () => {
  assert.strictEqual(isSafeArtifactRel('artifacts/run.json'), true);
});

test('isSafeArtifactRel is true for artifacts\\sub\\run.json (backslashes normalised)', () => {
  assert.strictEqual(isSafeArtifactRel('artifacts\\sub\\run.json'), true);
});

test('isSafeArtifactRel is false for empty string', () => {
  assert.strictEqual(isSafeArtifactRel(''), false);
});

test('isSafeArtifactRel is false for whitespace-only string', () => {
  assert.strictEqual(isSafeArtifactRel('   '), false);
});

test('isSafeArtifactRel is false for null', () => {
  assert.strictEqual(isSafeArtifactRel(null), false);
});

test('isSafeArtifactRel is false for non-string number', () => {
  assert.strictEqual(isSafeArtifactRel(42), false);
});

test('isSafeArtifactRel is false for absolute path /artifacts/x', () => {
  assert.strictEqual(isSafeArtifactRel('/artifacts/x'), false);
});

test('isSafeArtifactRel is false for artifacts/../secret', () => {
  assert.strictEqual(isSafeArtifactRel('artifacts/../secret'), false);
});

test('isSafeArtifactRel is false for other/x', () => {
  assert.strictEqual(isSafeArtifactRel('other/x'), false);
});

test('isSafeArtifactRel is false for a string containing a NUL character', () => {
  assert.strictEqual(isSafeArtifactRel('artifacts/x\0y'), false);
});
