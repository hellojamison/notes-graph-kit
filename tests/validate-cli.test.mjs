import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validateModule = require(path.join(kitRoot, 'scripts/validate-project-notes-graph.cjs'));
const { printWarnings, main } = validateModule;

test('printWarnings summarizes recurring warnings and prints actionable ones individually', () => {
  const warnLines = [];
  const originalWarn = console.warn;
  try {
    console.warn = (...args) => { warnLines.push(args.join(' ')); };
    printWarnings([
      'a.md: typed note has no related_apps',
      'b.md: typed note has no related_apps',
      'c.md: something else'
    ]);
    assert.ok(warnLines.some((line) => line === 'WARN c.md: something else'),
      `expected actionable warning; got: ${JSON.stringify(warnLines)}`);
    assert.ok(warnLines.some((line) => line.includes('Summarized 2 recurring warning(s):')),
      `expected summary; got: ${JSON.stringify(warnLines)}`);
    assert.ok(warnLines.some((line) => line.includes('2 typed notes without related_apps')),
      `expected category summary; got: ${JSON.stringify(warnLines)}`);
  } finally { console.warn = originalWarn; }
});

test('printWarnings with verbose prints every warning and skips the summary', () => {
  const warnLines = [];
  const originalWarn = console.warn;
  try {
    console.warn = (...args) => { warnLines.push(args.join(' ')); };
    printWarnings([
      'a.md: typed note has no related_apps',
      'b.md: typed note has no related_apps',
      'c.md: something else'
    ], true);
    assert.ok(warnLines.some((line) => line === 'WARN a.md: typed note has no related_apps'));
    assert.ok(warnLines.some((line) => line === 'WARN b.md: typed note has no related_apps'));
    assert.ok(warnLines.some((line) => line === 'WARN c.md: something else'));
    assert.ok(!warnLines.some((line) => line.includes('Summarized')));
  } finally { console.warn = originalWarn; }
});

test('main rejects unknown options without reading notes', () => {
  const errLines = [];
  const originalError = console.error;
  try {
    console.error = (...args) => { errLines.push(args.join(' ')); };
    const exitCode = main(['--bogus']);
    assert.equal(exitCode, 2);
    assert.ok(errLines.some((line) => line.includes('--bogus')),
      `expected error naming --bogus; got: ${JSON.stringify(errLines)}`);
  } finally { console.error = originalError; }
});
