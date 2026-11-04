import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { sanitizeFileTitle, parseMarkedScaffold, printRoute } = require('../scripts/project-notes.cjs');

// --- sanitizeFileTitle -------------------------------------------------------

test('sanitizeFileTitle strips invalid filename characters', () => {
  assert.equal(sanitizeFileTitle('Hello:World'), 'Hello World');
  assert.equal(sanitizeFileTitle('a\\b/c*d?e"f<g>h|i[j]^k'), 'a b c d e f g h i j k');
});

test('sanitizeFileTitle collapses whitespace and trims', () => {
  assert.equal(sanitizeFileTitle('  foo   bar  '), 'foo bar');
});

test('sanitizeFileTitle returns default for empty string', () => {
  assert.equal(sanitizeFileTitle(''), 'Untitled Notes Task');
});

test('sanitizeFileTitle returns default for null', () => {
  assert.equal(sanitizeFileTitle(null), 'Untitled Notes Task');
});

test('sanitizeFileTitle returns default for undefined', () => {
  assert.equal(sanitizeFileTitle(undefined), 'Untitled Notes Task');
});

test('sanitizeFileTitle returns default for whitespace-only string', () => {
  assert.equal(sanitizeFileTitle('   '), 'Untitled Notes Task');
});

test('sanitizeFileTitle returns default for tab-and-newline-only string', () => {
  assert.equal(sanitizeFileTitle('\t\n\r'), 'Untitled Notes Task');
});

test('sanitizeFileTitle returns default for zero', () => {
  assert.equal(sanitizeFileTitle(0), 'Untitled Notes Task');
});

test('sanitizeFileTitle returns default for false', () => {
  assert.equal(sanitizeFileTitle(false), 'Untitled Notes Task');
});

test('sanitizeFileTitle converts non-empty number to string', () => {
  assert.equal(sanitizeFileTitle(42), '42');
});

test('sanitizeFileTitle converts object to its string representation', () => {
  assert.equal(sanitizeFileTitle({}), 'object Object');
});

// --- parseMarkedScaffold -----------------------------------------------------

test('parseMarkedScaffold returns scaffold and stripped body', () => {
  const template = [
    '---',
    'title: Task Template',
    'schema_version: 1',
    'type: template',
    'status: active',
    'tags:',
    '  - template',
    '---',
    '',
    '<!-- notes-graph-kit:scaffold:start -->',
    '```yaml',
    'title: Task',
    'schema_version: 1',
    'type: task',
    'status: active',
    'date: 2026-01-01',
    'tags:',
    '  - notes/task',
    '```',
    '<!-- notes-graph-kit:scaffold:end -->',
    '',
    '# Task Name'
  ].join('\n');
  const result = parseMarkedScaffold(template, 'task', 'Task Template');
  assert.equal(result.scaffold.type, 'task');
  assert.equal(result.body.trim(), '# Task Name');
});

test('parseMarkedScaffold throws when scaffold markers are missing', () => {
  const template = '---\ntitle: X\nschema_version: 1\ntype: template\nstatus: active\ntags:\n  - template\n---\n\n# No markers';
  assert.throws(() => parseMarkedScaffold(template, 'task', 'Bad'), /requires exactly one ordered scaffold marker pair/);
});

test('parseMarkedScaffold throws for invalid YAML', () => {
  const template = [
    '---',
    'title: Bad YAML',
    'schema_version: 1',
    'type: template',
    'status: active',
    'tags:',
    '  - template',
    '---',
    '',
    '<!-- notes-graph-kit:scaffold:start -->',
    '```yaml',
    '  bad: [',
    '```',
    '<!-- notes-graph-kit:scaffold:end -->'
  ].join('\n');
  assert.throws(() => parseMarkedScaffold(template, 'task', 'Bad YAML'), /invalid scaffold YAML/);
});

// --- printRoute --------------------------------------------------------------

test('printRoute throws when query is missing', () => {
  assert.throws(() => printRoute({ _: [] }), /Missing route query/);
});

test('printRoute returns JSON for a matching route', () => {
  const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ngk-route-'));
  try {
    const config = {
      appName: 'Test App',
      vaultDir: 'Project Notes',
      routes: [{ id: 'test-route', processRel: 'Processes/Test Process.md', aliases: ['test'] }]
    };
    fs.writeFileSync(path.join(vaultRoot, 'notes-graph.config.json'), JSON.stringify(config, null, 2));
    fs.mkdirSync(path.join(vaultRoot, 'Processes'), { recursive: true });
    const processNote = [
      '---',
      'title: Test Process',
      'schema_version: 1',
      'type: process',
      'status: current',
      'tags:',
      '  - notes/process',
      '---',
      '',
      '# Test Process'
    ].join('\n');
    fs.writeFileSync(path.join(vaultRoot, 'Processes/Test Process.md'), processNote);

    const result = printRoute({ _: ['test'], json: true }, { vaultRoot, routeDefinitions: config.routes });
    const parsed = JSON.parse(result);
    assert.equal(parsed.process.rel, 'Processes/Test Process.md');
    assert.equal(parsed.process.title, 'Test Process');
  } finally {
    fs.rmSync(vaultRoot, { recursive: true, force: true });
  }
});
