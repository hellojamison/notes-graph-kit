import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { extractReceiptBlocks, extractOpenItemsBlock } = require('../scripts/lib/project-notes-receipts.cjs');

test('extractReceiptBlocks returns empty arrays for an empty body', () => {
  const result = extractReceiptBlocks('');
  assert.deepEqual(result.receipts, []);
  assert.deepEqual(result.receiptRecords, []);
  assert.deepEqual(result.errors, []);
});

test('extractReceiptBlocks parses a single valid receipt block', () => {
  const body = [
    '<!-- notes-graph-kit:receipt:start -->',
    '```yaml',
    'id: abc-123',
    'outcome: working',
    '```',
    '<!-- notes-graph-kit:receipt:end -->'
  ].join('\n');

  const result = extractReceiptBlocks(body);
  assert.equal(result.receipts.length, 1);
  assert.deepEqual(result.receipts[0], { id: 'abc-123', outcome: 'working' });
  assert.equal(result.receiptRecords.length, 1);
  assert.equal(result.errors.length, 0);
});

test('extractReceiptBlocks parses multiple valid receipt blocks', () => {
  const body = [
    '<!-- notes-graph-kit:receipt:start -->',
    '```yaml',
    'id: first-receipt',
    'outcome: done',
    '```',
    '<!-- notes-graph-kit:receipt:end -->',
    '<!-- notes-graph-kit:receipt:start -->',
    '```yaml',
    'id: second-receipt',
    'outcome: open',
    '```',
    '<!-- notes-graph-kit:receipt:end -->'
  ].join('\n');

  const result = extractReceiptBlocks(body);
  assert.equal(result.receipts.length, 2);
  assert.deepEqual(result.receipts[0], { id: 'first-receipt', outcome: 'done' });
  assert.deepEqual(result.receipts[1], { id: 'second-receipt', outcome: 'open' });
  assert.deepEqual(result.errors, []);
});

test('extractReceiptBlocks reports an error for an unclosed receipt marker', () => {
  const body = [
    '<!-- notes-graph-kit:receipt:start -->',
    '```yaml',
    'id: abc-123',
    'outcome: working',
    '```'
  ].join('\n');

  const result = extractReceiptBlocks(body);
  assert.equal(result.receipts.length, 0);
  assert.equal(result.errors.length, 1);
  assert.ok(result.errors[0].includes('receipt marker is not closed'));
});

test('extractReceiptBlocks reports an error for a receipt block that is not a mapping', () => {
  const body = [
    '<!-- notes-graph-kit:receipt:start -->',
    '```yaml',
    '- item1',
    '- item2',
    '```',
    '<!-- notes-graph-kit:receipt:end -->'
  ].join('\n');

  const result = extractReceiptBlocks(body);
  assert.equal(result.receipts.length, 0);
  assert.equal(result.errors.length, 1);
  assert.ok(result.errors[0].includes('must be a YAML mapping'));
});

test('extractReceiptBlocks reports an error for invalid YAML inside receipt markers', () => {
  const body = [
    '<!-- notes-graph-kit:receipt:start -->',
    '```yaml',
    ': invalid yaml [',
    '```',
    '<!-- notes-graph-kit:receipt:end -->'
  ].join('\n');

  const result = extractReceiptBlocks(body);
  assert.equal(result.receipts.length, 0);
  assert.equal(result.errors.length, 1);
  assert.ok(result.errors[0].includes('invalid receipt YAML'));
});

test('extractReceiptBlocks reports an error for an unmatched end marker', () => {
  const body = [
    '<!-- notes-graph-kit:receipt:start -->',
    '```yaml',
    'id: abc-123',
    'outcome: working',
    '```',
    '<!-- notes-graph-kit:receipt:end -->',
    '<!-- notes-graph-kit:receipt:end -->'
  ].join('\n');

  const result = extractReceiptBlocks(body);
  assert.equal(result.receipts.length, 1);
  assert.equal(result.errors.length, 1);
  assert.ok(result.errors[0].includes('unmatched end'));
});

test('extractOpenItemsBlock returns null items for an empty body', () => {
  const result = extractOpenItemsBlock('');
  assert.equal(result.items, null);
  assert.deepEqual(result.itemRecords, []);
  assert.deepEqual(result.errors, []);
});

test('extractOpenItemsBlock parses a single valid open-items block', () => {
  const body = [
    '<!-- notes-graph-kit:open-items:start -->',
    '```yaml',
    'items:',
    '  - id: item-one',
    '    summary: first task',
    '    opened_by: evidence-1',
    '    state: open',
    '```',
    '<!-- notes-graph-kit:open-items:end -->'
  ].join('\n');

  const result = extractOpenItemsBlock(body);
  assert.ok(Array.isArray(result.items));
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, 'item-one');
  assert.equal(result.itemRecords.length, 1);
  assert.deepEqual(result.errors, []);
});

test('extractOpenItemsBlock returns null items when there is no open-items block', () => {
  const body = 'Some regular note content.\n';
  const result = extractOpenItemsBlock(body);
  assert.equal(result.items, null);
  assert.deepEqual(result.itemRecords, []);
  assert.deepEqual(result.errors, []);
});

test('extractOpenItemsBlock reports an error when there are multiple open-items blocks', () => {
  const body = [
    '<!-- notes-graph-kit:open-items:start -->',
    '```yaml',
    'items:',
    '  - id: item-one',
    '    summary: first task',
    '    opened_by: evidence-1',
    '    state: open',
    '```',
    '<!-- notes-graph-kit:open-items:end -->',
    '<!-- notes-graph-kit:open-items:start -->',
    '```yaml',
    'items:',
    '  - id: item-two',
    '    summary: second task',
    '    opened_by: evidence-2',
    '    state: open',
    '```',
    '<!-- notes-graph-kit:open-items:end -->'
  ].join('\n');

  const result = extractOpenItemsBlock(body);
  assert.ok(Array.isArray(result.items));
  assert.equal(result.items.length, 1);
  assert.equal(result.errors.length, 1);
  assert.ok(result.errors[0].includes('more than one open-items block'));
});

test('extractOpenItemsBlock reports an error when the YAML is not a mapping with items', () => {
  const body = [
    '<!-- notes-graph-kit:open-items:start -->',
    '```yaml',
    'just a scalar value',
    '```',
    '<!-- notes-graph-kit:open-items:end -->'
  ].join('\n');

  const result = extractOpenItemsBlock(body);
  assert.equal(result.items, null);
  assert.deepEqual(result.itemRecords, []);
  assert.equal(result.errors.length, 1);
  assert.ok(result.errors[0].includes('must be a mapping with an items array'));
});

test('extractOpenItemsBlock reports an error when the YAML mapping lacks an items array', () => {
  const body = [
    '<!-- notes-graph-kit:open-items:start -->',
    '```yaml',
    'id: some-id',
    'summary: no items key here',
    '```',
    '<!-- notes-graph-kit:open-items:end -->'
  ].join('\n');

  const result = extractOpenItemsBlock(body);
  assert.equal(result.items, null);
  assert.deepEqual(result.itemRecords, []);
  assert.equal(result.errors.length, 1);
  assert.ok(result.errors[0].includes('must be a mapping with an items array'));
});

test('extractReceiptBlocks returns receiptRecords with line numbers', () => {
  const body = [
    'Some preamble.',
    '<!-- notes-graph-kit:receipt:start -->',
    '```yaml',
    'id: abc-123',
    'outcome: working',
    '```',
    '<!-- notes-graph-kit:receipt:end -->',
    ''
  ].join('\n');

  const result = extractReceiptBlocks(body);
  assert.equal(result.receiptRecords.length, 1);
  assert.ok(typeof result.receiptRecords[0].line === 'number');
});

test('extractOpenItemsBlock returns itemRecords with line numbers', () => {
  const body = [
    'Some preamble.',
    '<!-- notes-graph-kit:open-items:start -->',
    '```yaml',
    'items:',
    '  - id: item-one',
    '    summary: first task',
    '    opened_by: evidence-1',
    '    state: open',
    '```',
    '<!-- notes-graph-kit:open-items:end -->'
  ].join('\n');

  const result = extractOpenItemsBlock(body);
  assert.equal(result.itemRecords.length, 1);
  assert.ok(typeof result.itemRecords[0].line === 'number');
});
