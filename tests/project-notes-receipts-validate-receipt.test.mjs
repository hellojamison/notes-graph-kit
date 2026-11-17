import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateReceipt, validateOpenItem, stripMarkedReceiptBlocks } = require('../scripts/lib/project-notes-receipts.cjs');

test('validateReceipt returns no errors for a valid receipt', () => {
  const receipt = { id: 'abc-123', outcome: 'working' };
  const errors = validateReceipt(receipt);
  assert.deepEqual(errors, []);
});

test('validateReceipt rejects a missing id', () => {
  const errors = validateReceipt({ outcome: 'working' });
  assert.deepEqual(errors, ['id must be a lowercase kebab-case identifier']);
});

test('validateReceipt rejects an invalid id format', () => {
  const errors = validateReceipt({ id: 'ABC', outcome: 'working' });
  assert.deepEqual(errors, ['id must be a lowercase kebab-case identifier']);
});

test('validateReceipt rejects a duplicate id', () => {
  const knownIds = new Set();
  const receipt = { id: 'abc-123', outcome: 'working' };
  validateReceipt(receipt, knownIds);
  const errors = validateReceipt(receipt, knownIds);
  assert.deepEqual(errors, ['id "abc-123" is duplicated']);
});

test('validateReceipt rejects an invalid outcome', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'missing' });
  assert.deepEqual(errors, ['outcome must be one of working, verified, failed, open']);
});

test('validateReceipt accepts valid outcomes', () => {
  for (const outcome of ['working', 'verified', 'failed', 'open']) {
    const errors = validateReceipt({ id: 'abc-123', outcome });
    assert.deepEqual(errors, []);
  }
});

test('validateReceipt rejects an empty command', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', command: '' });
  assert.deepEqual(errors, ['command must be a non-empty string when present']);
});

test('validateReceipt accepts a non-empty command', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', command: 'echo hello' });
  assert.deepEqual(errors, []);
});

test('validateReceipt rejects a non-mapping tests value', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', tests: [1, 2] });
  assert.deepEqual(errors, ['tests must be a mapping']);
});

test('validateReceipt rejects missing tests.passed', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', tests: { filter: '--grep foo' } });
  assert.deepEqual(errors, ['tests.passed must be a non-negative integer']);
});

test('validateReceipt rejects negative tests.passed', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', tests: { passed: -1, filter: '--grep foo' } });
  assert.deepEqual(errors, ['tests.passed must be a non-negative integer']);
});

test('validateReceipt rejects missing tests.filter', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', tests: { passed: 5 } });
  assert.deepEqual(errors, ['tests.filter is required whenever tests is present']);
});

test('validateReceipt accepts valid tests', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', tests: { passed: 5, filter: '--grep foo' } });
  assert.deepEqual(errors, []);
});

test('validateReceipt rejects invalid open_items entries', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', open_items: ['INVALID'] });
  assert.deepEqual(errors, ['open_items entries must be lowercase kebab-case identifiers']);
});

test('validateReceipt accepts valid open_items', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', open_items: ['def-456'] });
  assert.deepEqual(errors, []);
});

test('validateReceipt rejects invalid closes_open_items entries', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', closes_open_items: ['INVALID'] });
  assert.deepEqual(errors, ['closes_open_items entries must be lowercase kebab-case identifiers']);
});

test('validateReceipt accepts valid closes_open_items', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', closes_open_items: ['def-456'] });
  assert.deepEqual(errors, []);
});

test('validateReceipt rejects an artifact that is not a mapping', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', artifacts: [null] });
  assert.deepEqual(errors, ['artifacts[0] must be a mapping']);
});

test('validateReceipt rejects an artifact with missing path', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', artifacts: [{}] });
  assert.deepEqual(errors, ['artifacts[0].path must be a non-empty string']);
});

test('validateReceipt rejects an artifact with invalid sha256', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', artifacts: [{ path: 'artifacts/run.json', sha256: 'not-a-hash' }] });
  assert.deepEqual(errors, ['artifacts[0].sha256 must be a 64-character hex digest']);
});

test('validateReceipt rejects an artifact with invalid git_sha', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', artifacts: [{ path: 'artifacts/run.json', git_sha: 'abc' }] });
  assert.deepEqual(errors, ['artifacts[0].git_sha must be a Git SHA']);
});

test('validateReceipt accepts a valid artifact', () => {
  const errors = validateReceipt({ id: 'abc-123', outcome: 'working', artifacts: [{ path: 'artifacts/run.json' }] });
  assert.deepEqual(errors, []);
});

test('validateOpenItem returns an error for null input', () => {
  const errors = validateOpenItem(null);
  assert.deepEqual(errors, ['Open Items entries must be mappings']);
});

test('validateOpenItem returns an error for a non-mapping', () => {
  const errors = validateOpenItem('hello');
  assert.deepEqual(errors, ['Open Items entries must be mappings']);
});

test('validateOpenItem returns an error for an array', () => {
  const errors = validateOpenItem([1, 2]);
  assert.deepEqual(errors, ['Open Items entries must be mappings']);
});

test('validateOpenItem returns errors for a minimal invalid item', () => {
  const errors = validateOpenItem({});
  assert.deepEqual(errors, ['id must be a lowercase kebab-case identifier', 'missing a summary', 'missing opened_by evidence', 'state must be open or closed']);
});

test('validateOpenItem accepts a valid open item', () => {
  const errors = validateOpenItem({ id: 'abc-123', summary: 'some work', opened_by: 'user@example.com', state: 'open' });
  assert.deepEqual(errors, []);
});

test('validateOpenItem accepts a valid closed item', () => {
  const errors = validateOpenItem({ id: 'abc-123', summary: 'some work', opened_by: 'user@example.com', state: 'closed', closed_by: 'user@example.com' });
  assert.deepEqual(errors, []);
});

test('validateOpenItem rejects a closed item without closed_by', () => {
  const errors = validateOpenItem({ id: 'abc-123', summary: 'some work', opened_by: 'user@example.com', state: 'closed' });
  assert.deepEqual(errors, ['missing closed_by evidence']);
});

test('validateOpenItem rejects an invalid state', () => {
  const errors = validateOpenItem({ id: 'abc-123', summary: 'some work', opened_by: 'user@example.com', state: 'pending' });
  assert.deepEqual(errors, ['state must be open or closed']);
});

test('stripMarkedReceiptBlocks removes a single receipt block', () => {
  const body = 'before\n<!-- notes-graph-kit:receipt:start -->\nsome yaml\n---\nend:\n<!-- notes-graph-kit:receipt:end -->\nafter';
  const result = stripMarkedReceiptBlocks(body);
  assert.equal(result, 'before\n\nafter');
});

test('stripMarkedReceiptBlocks removes multiple receipt blocks', () => {
  const body = '<!-- notes-graph-kit:receipt:start -->\na\n<!-- notes-graph-kit:receipt:end --><!-- notes-graph-kit:receipt:start -->\nb\n<!-- notes-graph-kit:receipt:end -->';
  const result = stripMarkedReceiptBlocks(body);
  assert.equal(result, '');
});

test('stripMarkedReceiptBlocks leaves body unchanged when no receipt blocks exist', () => {
  const body = 'just some text\nno markers here';
  const result = stripMarkedReceiptBlocks(body);
  assert.equal(result, body);
});

test('stripMarkedReceiptBlocks leaves non-receipt markers untouched', () => {
  const body = 'before\n<!-- notes-graph-kit:other:start -->\nsome content\n<!-- notes-graph-kit:other:end -->\nafter';
  const result = stripMarkedReceiptBlocks(body);
  assert.equal(result, body);
});
