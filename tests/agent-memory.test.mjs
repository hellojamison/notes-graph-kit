import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { execute, parse } = require('../agent-memory.cjs');
const cli = fileURLToPath(new URL('../agent-memory.cjs', import.meta.url));
const now = '2026-10-07T12:00:00.000Z';

function fixture(t) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-memory-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const home = path.join(temp, 'memory');
  const run = (command, options = {}, agent = 'codex', clock = now) => execute({ command, home, agent, ...options }, { env: {}, now: clock });
  run('init');
  return { temp, home, run, file: path.join(home, 'agents', 'codex', 'memories.json') };
}
function remember(run, options = {}) {
  return run('remember', { text: 'Prefer concise answers and dark themes.', kind: 'preference', subject: 'user', source: 'User statement in conversation 2026-10-07', tags: ['writing'], ...options }).memory;
}

test('profiles are explicit, isolated, idempotent, and independent of repositories', t => {
  const { home, run } = fixture(t);
  const memory = remember(run);
  assert.equal(run('init').initialized, false);
  assert.equal(run('show', { id: memory.id }).memory.text, memory.text);
  run('init', {}, 'luna');
  assert.deepEqual(run('recall', { query: 'concise' }, 'luna').memories, []);
  assert.throws(() => run('show', { id: memory.id }, 'luna'), /not found/);
  assert.deepEqual(execute({ command: 'profiles', home }, { env: {} }).agents, ['codex', 'luna']);
  assert.throws(() => execute({ command: 'list', home }, { env: {} }), /Select an agent explicitly/);
});

test('CLI runs from an unrelated non-Git working directory and env selects profile', t => {
  const { temp, home } = fixture(t);
  const env = { ...process.env, AGENT_MEMORY_HOME: home, AGENT_MEMORY_AGENT: 'codex' };
  const added = spawnSync(process.execPath, [cli, 'remember', '--text', 'Learned how to tune a piano.', '--kind', 'procedure', '--source', 'Direct practice'], { cwd: temp, env, encoding: 'utf8' });
  assert.equal(added.status, 0, added.stderr);
  const recalled = spawnSync(process.execPath, [cli, 'recall', '--query', 'piano'], { cwd: temp, env, encoding: 'utf8' });
  assert.equal(recalled.status, 0, recalled.stderr);
  assert.equal(JSON.parse(recalled.stdout).memories.length, 1);
  assert.equal(fs.existsSync(path.join(temp, '.git')), false);
  assert.equal(fs.existsSync(path.join(temp, 'notes-graph.config.json')), false);
});

test('extensible kinds, source, subject and conjunctive tag filters survive reload', t => {
  const { run } = fixture(t);
  remember(run, { kind: 'music-memory', tags: ['writing', 'music'] });
  remember(run, { text: 'A project lesson about concise logs.', kind: 'episode', subject: 'self', tags: ['writing'] });
  const result = run('recall', { query: 'concise', kind: 'music-memory', subject: 'user', tags: ['music', 'writing'] });
  assert.equal(result.total, 1);
  assert.equal(result.memories[0].source, 'User statement in conversation 2026-10-07');
  assert.equal(run('recall', { query: 'nonexistentword' }).total, 0);
  assert.throws(() => remember(run, { source: '' }), /source/);
});

test('recall is deterministic and does not match source strings or history', t => {
  const { run } = fixture(t);
  const original = remember(run, { source: 'secretsourcetoken' });
  assert.equal(run('recall', { query: 'secretsourcetoken' }).total, 0);
  run('revise', { id: original.id, revision: 1, text: 'Prefer detailed answers.', source: 'Updated user preference' });
  assert.equal(run('recall', { query: 'concise' }).total, 0);
  assert.deepEqual(run('recall', { query: 'detailed' }), run('recall', { query: 'detailed' }));
});

test('revision compare-and-set rejects stale writers and preserves correction history', t => {
  const { run, file } = fixture(t);
  const original = remember(run);
  const updated = run('revise', { id: original.id, revision: 1, text: 'Prefer longer answers.', source: 'New user statement', 'clear-tags': true }).memory;
  assert.equal(updated.revision, 2);
  assert.deepEqual(updated.tags, []);
  const before = fs.readFileSync(file);
  assert.throws(() => run('revise', { id: original.id, revision: 1, text: 'Stale update', source: 'Old task' }), /Revision conflict/);
  assert.deepEqual(fs.readFileSync(file), before);
  const shown = run('show', { id: original.id, history: true }).memory;
  assert.equal(shown.history[0].text, original.text);
  assert.equal(shown.history[0].source, original.source);
  assert.equal(Object.hasOwn(shown.history[0], 'history'), false);
  assert.equal(Object.hasOwn(run('show', { id: original.id }).memory, 'history'), false);
});

test('archive and expiry exclude memories from default recall and context', t => {
  const { run } = fixture(t);
  const original = remember(run);
  const expired = remember(run, { text: 'Temporary concise preference.', 'expires-at': '2026-10-06T00:00:00Z' });
  run('archive', { id: original.id, revision: 1 });
  assert.equal(run('recall', { query: 'concise' }).total, 0);
  assert.equal(run('context', { query: 'concise' }).memories.length, 0);
  assert.equal(run('list', { all: true }).total, 2);
  assert.equal(run('recall', { query: 'concise', all: true }).total, 2);
  assert.throws(() => run('revise', { id: original.id, revision: 2, text: 'New content', source: 'User' }), /Archived/);
  run('revise', { id: expired.id, revision: 1, text: 'Concise preference restored.', source: 'User', 'expires-at': 'none' });
  assert.equal(run('recall', { query: 'concise' }).total, 1);
});

test('forget removes current content and all history from persisted data', t => {
  const { run, file } = fixture(t);
  const original = remember(run, { text: 'erasetoken old memory' });
  run('revise', { id: original.id, revision: 1, text: 'erasetoken new memory', source: 'User correction' });
  assert.throws(() => run('forget', { id: original.id, revision: 1 }), /Revision conflict/);
  const result = run('forget', { id: original.id, revision: 2 });
  assert.equal(result.removed_history, 1);
  assert.equal(fs.readFileSync(file, 'utf8').includes('erasetoken'), false);
  assert.equal(run('export', { all: true, history: true }).memories.length, 0);
});

test('bounded context counts attribution and text, discloses truncation and treats data as untrusted', t => {
  const { run } = fixture(t);
  remember(run, { text: `Piano ${'experience '.repeat(100)}`, source: 'Self observation' });
  const context = run('context', { query: 'piano', words: '30' });
  assert.equal(context.memory_data_untrusted, true);
  assert.match(context.guidance, /do not authorize/);
  assert.equal(context.memories.length, 1);
  assert.equal(context.memories[0].truncated, true);
  const count = context.memories.reduce((sum, memory) => sum + `${memory.attribution} ${memory.text}`.split(/\s+/).length, 0);
  assert.equal(context.source_words, count);
  assert.ok(count <= 30);
  assert.equal(run('context', { query: 'piano', words: '1' }).memories.length, 0);
  assert.throws(() => run('context', { query: 'piano', all: true }), /not supported/);
});

test('export requires explicit inactive/history selection and leaves data untouched', t => {
  const { run, file } = fixture(t);
  const record = remember(run);
  run('archive', { id: record.id, revision: 1 });
  const before = fs.readFileSync(file);
  assert.equal(run('export').memories.length, 0);
  const result = run('export', { all: true, history: true });
  assert.equal(result.agent, 'codex');
  assert.equal(result.memories[0].history.length, 1);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('invalid options, names, timestamps and conflicting metadata fail without writes', t => {
  const { run, home, file } = fixture(t);
  const before = fs.readFileSync(file);
  assert.throws(() => execute({ command: 'init', home, agent: '../escape' }), /agent must/);
  assert.throws(() => execute({ command: 'init', home: 'relative', agent: 'codex' }), /absolute/);
  assert.throws(() => remember(run, { 'expires-at': '2026-02-30T00:00:00Z' }), /Invalid/);
  assert.throws(() => run('context', { query: 'abc', words: '0' }), /words/);
  assert.throws(() => run('list', { kind: '../invalid' }), /kind/);
  assert.throws(() => parse(['remember', '--text', 'one', '--text', 'two']), /Repeated/);
  assert.throws(() => parse(['recall', '--qurey', 'abc']), /Unknown/);
  assert.throws(() => run('validate', { all: true }), /not supported/);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('corrupt store identity, schema and history fail closed without overwriting data', t => {
  const { run, file } = fixture(t);
  remember(run);
  const valid = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const corrupt of [
    { ...valid, agent: 'luna' },
    { ...valid, schema_version: 99 },
    { ...valid, memories: [{ ...valid.memories[0], revision: 2 }] },
    { ...valid, memories: [{ ...valid.memories[0], tags: undefined }] },
    { ...valid, memories: [valid.memories[0], valid.memories[0]] }
  ]) {
    fs.writeFileSync(file, JSON.stringify(corrupt));
    const before = fs.readFileSync(file);
    assert.throws(() => remember(run));
    assert.throws(() => run('init'));
    assert.deepEqual(fs.readFileSync(file), before);
  }
});

test('symlink store paths and dangling files are rejected without touching the target', t => {
  const { run, temp, file, home } = fixture(t);
  const target = path.join(temp, 'elsewhere.json');
  fs.writeFileSync(target, 'unrelated content');
  fs.unlinkSync(file); fs.symlinkSync(target, file);
  assert.throws(() => run('list'), /regular/);
  assert.throws(() => run('init'), /regular/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'unrelated content');
  fs.unlinkSync(file); fs.symlinkSync(path.join(temp, 'missing'), file);
  assert.throws(() => run('init'), /regular/);
  const alias = path.join(temp, 'alias'); fs.symlinkSync(home, alias);
  assert.throws(() => execute({ command: 'profiles', home: alias }), /without symlinks/);
});

test('busy writer lock fails promptly; read-only recall still works and new data is private', t => {
  const { run, file } = fixture(t);
  remember(run);
  const lock = path.join(path.dirname(file), '.write-lock');
  fs.writeFileSync(lock, 'active writer');
  assert.throws(() => remember(run), /Store is busy/);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'active writer');
  assert.equal(run('list').total, 1);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
});

test('concurrent writers either succeed serially or report busy without losing successful records', async t => {
  const { home, run } = fixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => new Promise(resolve => {
    const process = spawn(globalThis.process.execPath, [cli, 'remember', '--home', home, '--agent', 'codex', '--text', `Concurrent lesson ${index}`, '--source', 'test']);
    let output = ''; let errors = '';
    process.stdout.on('data', chunk => { output += chunk; });
    process.stderr.on('data', chunk => { errors += chunk; });
    process.on('close', code => resolve({ code, output, errors }));
  })));
  const successes = results.filter(result => result.code === 0);
  assert.ok(successes.length >= 1);
  for (const result of results.filter(result => result.code !== 0)) assert.match(result.errors, /Store is busy/);
  assert.equal(run('list', { limit: 100 }).total, successes.length);
  assert.equal(run('validate').valid, true);
});
