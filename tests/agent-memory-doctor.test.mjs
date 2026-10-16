import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const memory = require('../agent-memory.cjs');
const root = path.resolve(import.meta.dirname, '..');
function fixture(t, categorized = false) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'memory-doctor-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const home = path.join(temp, 'profiles', 'personal'), store = path.join(temp, 'store');
  const skill = path.join(home, 'skills', ...(categorized ? ['productivity'] : []), 'agent-memory-toolbox');
  fs.mkdirSync(path.join(skill, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(root, 'skills/agent-memory-toolbox/SKILL.md'), path.join(skill, 'SKILL.md'));
  fs.copyFileSync(path.join(root, 'agent-memory.cjs'), path.join(skill, 'scripts/agent-memory.cjs'));
  const config = { skills: { auto_load: ['another-skill', 'agent-memory-toolbox'] } };
  const write = () => fs.writeFileSync(path.join(home, 'config.yaml'), JSON.stringify(config));
  write(); memory.execute(memory.parse(['init', '--home', store, '--agent', 'hermes']), { env: {} });
  const run = (args = ['--home', store], env = {}) => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/doctor-agent-memory.cjs'), '--hermes-home', home, ...args],
      { encoding: 'utf8', env: { ...process.env, AGENT_MEMORY_HOME: '', ...env } });
    return { ...result, report: JSON.parse(result.stdout || result.stderr) };
  };
  return { temp, home, store, skill, config, write, run, file: path.join(store, 'agents/hermes/memories.json') };
}
test('doctor checks actual profile, both skill layouts, and never changes memory', t => {
  for (const categorized of [false, true]) {
    const f = fixture(t, categorized), before = fs.readFileSync(f.file);
    const result = f.run(); assert.equal(result.status, 0, result.stdout); assert.equal(result.report.hermes_home, f.home);
    assert.equal(result.report.runtime_hooks_verified, false); assert.deepEqual(fs.readFileSync(f.file), before);
  }
});
test('wrong profile, missing pin, duplicate and stale installations fail', t => {
  const f = fixture(t); delete f.config.skills; f.write(); assert.equal(f.run().status, 1);
  f.config.skills = { auto_load: ['agent-memory-toolbox'] }; f.write();
  fs.appendFileSync(path.join(f.skill, 'scripts/agent-memory.cjs'), '\nthrow new Error("DO NOT EXECUTE INSTALLED CODE");\n');
  const stale = f.run(); assert.equal(stale.status, 1); assert(!stale.stdout.includes('DO NOT EXECUTE'));
  fs.copyFileSync(path.join(root, 'agent-memory.cjs'), path.join(f.skill, 'scripts/agent-memory.cjs'));
  fs.writeFileSync(path.join(f.skill, 'SKILL.md'), '---\nmetadata:\n  version: "0.0.0"\n---\n');
  assert.equal(f.run().report.checks.find(x => x.name === 'skill_version').ok, false);
  const other = path.join(f.home, 'skills/productivity/agent-memory-toolbox'); fs.mkdirSync(other, { recursive: true });
  fs.copyFileSync(path.join(f.skill, 'SKILL.md'), path.join(other, 'SKILL.md'));
  assert.equal(f.run().report.checks.find(x => x.name === 'skill_location').ok, false);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/doctor-agent-memory.cjs'), '--hermes-home', path.join(f.temp, 'wrong-profile'), '--home', f.store], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert(!fs.existsSync(path.join(f.temp, 'wrong-profile')));
});
test('config and memory errors do not reveal private data or initialize missing stores', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.home, 'config.yaml'), 'credential: [PRIVATE_SENTINEL\n');
  let result = f.run(); assert.equal(result.status, 1); assert(!result.stdout.includes('PRIVATE_SENTINEL')); assert(!result.stderr.includes('PRIVATE_SENTINEL'));
  f.write(); fs.writeFileSync(f.file, '{"private":"PRIVATE_SENTINEL"}');
  const before = fs.readFileSync(f.file); result = f.run(); assert.equal(result.status, 1); assert(!result.stdout.includes('PRIVATE_SENTINEL')); assert.deepEqual(fs.readFileSync(f.file), before);
  const missing = path.join(f.temp, 'missing'); assert.equal(f.run(['--home', missing]).status, 1); assert(!fs.existsSync(missing));
});
test('explicit selection wins over active plugin and environment; disabled plugins are ignored', t => {
  const f = fixture(t), wrong = path.join(f.temp, 'wrong');
  f.config.plugins = { enabled: ['shared-agent'], disabled: [], entries: { 'shared-agent': { enabled: true, settings: {
    memory_home: f.store, memory_agent: 'hermes', memory_cli: path.join(root, 'agent-memory.cjs')
  } } } }; f.write();
  let result = f.run([], { AGENT_MEMORY_HOME: wrong }); assert.equal(result.status, 0); assert.equal(result.report.selection_source.home, 'shared-agent');
  f.config.plugins.entries['shared-agent'].settings.memory_home = wrong; f.write();
  result = f.run(['--home', f.store, '--agent', 'hermes'], { AGENT_MEMORY_HOME: wrong }); assert.equal(result.status, 0); assert.equal(result.report.selection_source.home, 'argument');
  f.config.plugins.disabled = ['shared-agent']; f.write(); result = f.run([], { AGENT_MEMORY_HOME: f.store });
  assert.equal(result.status, 0); assert.equal(result.report.selection_source.home, 'environment'); assert(!result.report.checks.some(x => x.name === 'configured_cli'));
});
test('malformed selection and flags fail closed', t => {
  const f = fixture(t);
  for (const args of [['--unknown', 'x'], ['--home', 'relative'], ['--agent', '../other'], ['--home', f.store, '--home', f.store]]) assert.equal(f.run(args).status, 2);
  f.config.plugins = { enabled: ['shared-agent'], entries: { 'shared-agent': { enabled: true, settings: { memory_home: {}, memory_agent: '../bad' } } } }; f.write();
  assert.equal(f.run([]).status, 1);
});
