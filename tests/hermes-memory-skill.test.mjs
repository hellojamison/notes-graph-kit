import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('portable Hermes skill bundle works independently through the full memory lifecycle', t => {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-memory-skill-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const source = fileURLToPath(new URL('../skills/agent-memory-toolbox/', import.meta.url));
  const installed = path.join(temp, 'installed-skill');
  fs.cpSync(source, installed, { recursive: true });
  const cwd = path.join(temp, 'unrelated-folder'); fs.mkdirSync(cwd);
  const home = path.join(temp, 'memories');
  const script = path.join(installed, 'scripts', 'agent-memory.cjs');
  const run = (command, options = []) => {
    const result = spawnSync(process.execPath, [script, command, '--agent', 'hermes', '--home', home, ...options], {
      cwd, encoding: 'utf8', env: { ...process.env, AGENT_MEMORY_AGENT: 'another-agent' }
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  assert.equal(run('init').agent, 'hermes');
  const saved = run('remember', ['--kind', 'procedure', '--subject', 'self', '--text', 'Check studio equipment labels before an inventory.', '--source', 'Observed lesson in an isolated test']).memory;
  assert.equal(run('context', ['--query', 'studio equipment', '--words', '100']).memories[0].id, saved.id);
  const updated = run('revise', ['--id', saved.id, '--revision', '1', '--text', 'Check serial numbers for studio equipment inventory.', '--source', 'Corrected isolated observation']).memory;
  assert.equal(updated.revision, 2);
  assert.equal(run('show', ['--id', saved.id, '--history']).memory.history[0].text, saved.text);
  run('archive', ['--id', saved.id, '--revision', '2']);
  assert.equal(run('recall', ['--query', 'studio']).total, 0);
  assert.equal(run('export', ['--all', '--history']).memories[0].revision, 3);
  run('forget', ['--id', saved.id, '--revision', '3']);
  assert.equal(run('validate').memories, 0);
  assert.equal(fs.existsSync(path.join(cwd, 'notes-graph.config.json')), false);
  assert.equal(fs.existsSync(path.join(home, 'agents', 'another-agent')), false);
});
