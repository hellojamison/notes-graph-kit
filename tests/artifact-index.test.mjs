import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { parseArgs, renderIndex } = require(path.join(kitRoot, 'scripts/build-project-notes-artifact-index.cjs'));

test('parseArgs returns write false for empty argv', () => {
  assert.deepEqual(parseArgs([]), { write: false });
});

test('parseArgs returns write true when --write is passed', () => {
  assert.deepEqual(parseArgs(['--write']), { write: true });
});

test('parseArgs sets help for --help', () => {
  assert.deepEqual(parseArgs(['--help']), { write: false, help: true });
});

test('parseArgs sets help for -h', () => {
  assert.deepEqual(parseArgs(['-h']), { write: false, help: true });
});

test('parseArgs throws for unknown option', () => {
  assert.throws(() => parseArgs(['--x']), /Unknown option: --x/);
});

test('renderIndex returns empty index with marker and no-receipts row', () => {
  const output = renderIndex([]);
  assert.ok(output.startsWith('<!-- notes-graph-kit:generated-artifact-index -->'));
  assert.match(output, /_No structured artifact receipts yet._/);
  assert.ok(output.endsWith('\n'));
});

test('renderIndex renders a record with escaped pipe and truncated SHA', () => {
  const records = [{
    path: 'artifacts/a|b.json',
    evidence: '[[E]]',
    outcome: 'verified',
    receipt: 'r1',
    sha256: '0123456789abcdef',
    gitSha: 'abc1234'
  }];
  const output = renderIndex(records);
  assert.ok(output.includes('\\|'));
  assert.ok(output.includes('abc1234 sha256:0123456789ab'));
});
