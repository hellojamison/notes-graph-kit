import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { tokenize } = require('../scripts/search-project-notes.cjs');

test('tokenize lowercases and splits on whitespace', () => {
  assert.deepEqual(tokenize('Rollback Backup'), ['rollback', 'backup']);
});

test('tokenize keeps digits attached to words and separates at other punctuation', () => {
  assert.deepEqual(tokenize('v1.2 404 error code'), ['v1', '2', '404', 'error', 'code']);
  assert.deepEqual(tokenize('BM25 search'), ['bm25', 'search']);
});

test("tokenize keeps apostrophes inside a word as one token", () => {
  assert.deepEqual(tokenize(`O'Brien's don't`), ["o'brien's", "don't"]);
});

test('tokenize keeps hyphenated words as one token but splits on underscores', () => {
  assert.deepEqual(tokenize('well-known test-case'), ['well-known', 'test-case']);
  assert.deepEqual(tokenize('snake_case tokens'), ['snake', 'case', 'tokens']);
});

test('tokenize strips accent marks via NFKD normalization and combining-mark removal', () => {
  assert.deepEqual(tokenize('Résumé café déjà vu'), ['resume', 'cafe', 'deja', 'vu']);
});

test('tokenize decomposes fullwidth letters and Roman numerals to ASCII tokens', () => {
  assert.deepEqual(tokenize('Ｆｉｌｅ Ⅷ'), ['file', 'viii']);
});

test('tokenize returns an empty array for punctuation-only or whitespace input', () => {
  assert.deepEqual(tokenize('!!! ??? ... '), []);
  assert.deepEqual(tokenize('   \t\n  '), []);
});

test('tokenize coerces falsy and non-string values through String(value || \'\')', () => {
  // Falsy values collapse to the empty string before matching.
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(undefined), []);
  assert.deepEqual(tokenize(0), []);
  // Truthy non-strings are stringified and then tokenized like text.
  assert.deepEqual(tokenize(42), ['42']);
  assert.deepEqual(tokenize(true), ['true']);
});
