#!/usr/bin/env node
'use strict';

// Installation checks only. Never execute a profile's CLI or print its data.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const memory = require('../agent-memory.cjs');
const root = path.resolve(__dirname, '..');
const skillName = 'agent-memory-toolbox';
const help = `Read-only Hermes memory installation doctor
Usage: node scripts/doctor-agent-memory.cjs --hermes-home /absolute/profile/home
  [--home /absolute/memory/store] [--agent hermes]
Choose the actual Hermes profile home (for example ~/.hermes/profiles/personal).
Explicit memory options override enabled shared-agent settings, then
AGENT_MEMORY_HOME, then the standard store. Agent defaults to hermes.
Exit 0: healthy; 1: failed checks; 2: invalid arguments. No files are written.
This checks installation/configuration, not live model behavior or plugin hooks.
`;

function parse(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (!['--hermes-home', '--home', '--agent'].includes(name) || args[name] !== undefined)
      throw new Error('Unknown or repeated option. Use --help.');
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('Option requires a value.');
    args[name] = value;
  }
  if (!path.isAbsolute(args['--hermes-home'] || '')) throw new Error('--hermes-home must be an absolute profile directory.');
  if (args['--home'] && !path.isAbsolute(args['--home'])) throw new Error('--home must be absolute.');
  if (args['--agent'] && !/^[a-z][a-z0-9_-]{0,63}$/.test(args['--agent'])) throw new Error('Invalid --agent name.');
  return args;
}

function readText(file) {
  if (fs.statSync(file).size > 1024 * 1024) throw new Error('Oversized metadata file.');
  return fs.readFileSync(file, 'utf8');
}
function version(file) {
  const frontmatter = readText(file).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const value = frontmatter && yaml.load(frontmatter[1], { schema: yaml.JSON_SCHEMA })?.metadata?.version;
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) throw new Error('Invalid skill version.');
  return value;
}
function hash(file) {
  if (fs.statSync(file).size > 1024 * 1024) throw new Error('Oversized CLI.');
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function discover(home) {
  const skills = path.join(home, 'skills');
  if (!fs.existsSync(skills)) return [];
  const candidates = [path.join(skills, skillName)];
  for (const entry of fs.readdirSync(skills, { withFileTypes: true })) {
    if (entry.name !== skillName && entry.isDirectory()) candidates.push(path.join(skills, entry.name, skillName));
  }
  return candidates.filter(dir => fs.existsSync(path.join(dir, 'SKILL.md')));
}
function diagnose(args, env = process.env) {
  const home = path.resolve(args['--hermes-home']);
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
  let config = {}, validConfig = false;
  try {
    config = yaml.load(readText(path.join(home, 'config.yaml')), { schema: yaml.JSON_SCHEMA });
    validConfig = Boolean(config && typeof config === 'object' && !Array.isArray(config));
  } catch { /* Do not expose YAML diagnostics: they can contain credentials. */ }
  check('config', validConfig, validConfig ? 'Selected profile config parsed.' : 'Missing or invalid selected profile config.yaml.');
  if (!validConfig) config = {};
  check('auto_load', Array.isArray(config.skills?.auto_load) && config.skills.auto_load.includes(skillName),
    'The selected profile must pin agent-memory-toolbox in skills.auto_load.');

  let installed = [];
  try { installed = discover(home); } catch { /* A failed discovery is a failed check. */ }
  check('skill_location', installed.length === 1, installed.length === 1 ? installed[0] : `Expected one installation; found ${installed.length}. Check root and category skills directories.`);
  let expectedVersion;
  try { expectedVersion = version(path.join(root, 'skills', skillName, 'SKILL.md')); }
  catch { check('kit_version', false, 'Authoritative kit skill metadata is unavailable.'); }
  if (installed.length === 1) {
    let installedVersion;
    try { installedVersion = version(path.join(installed[0], 'SKILL.md')); } catch {}
    check('skill_version', Boolean(expectedVersion && installedVersion === expectedVersion),
      `Expected skill ${expectedVersion || 'unavailable'}; installed ${installedVersion || 'invalid'}.`);
    let matches = false;
    try { matches = hash(path.join(installed[0], 'scripts', 'agent-memory.cjs')) === hash(path.join(root, 'agent-memory.cjs')); } catch {}
    check('bundled_cli', matches, matches ? 'Bundled CLI matches this kit.' : 'Bundled CLI is missing or differs from this kit; review and refresh the skill.');
  }

  const plugins = config.plugins;
  const entry = plugins?.entries?.['shared-agent'];
  const enabled = entry?.enabled === true && Array.isArray(plugins.enabled) && plugins.enabled.includes('shared-agent')
    && (!Array.isArray(plugins.disabled) || !plugins.disabled.includes('shared-agent'));
  const settings = enabled && entry.settings && typeof entry.settings === 'object' ? entry.settings : {};
  const memoryHome = args['--home'] || settings.memory_home || env.AGENT_MEMORY_HOME || path.join(os.homedir(), '.local/share/notes-graph-kit/agent-memory');
  const agent = args['--agent'] || settings.memory_agent || 'hermes';
  const validSelection = typeof memoryHome === 'string' && path.isAbsolute(memoryHome)
    && typeof agent === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(agent);
  check('memory_selection', validSelection, validSelection ? 'Memory store and agent selection are explicit below.' : 'Invalid memory store or agent selection; supply --home and --agent.');
  if (enabled) {
    let matches = false;
    try { matches = path.isAbsolute(settings.memory_cli || '') && hash(settings.memory_cli) === hash(path.join(root, 'agent-memory.cjs')); } catch {}
    check('configured_cli', matches, matches ? 'Enabled shared-agent CLI matches this kit.' : 'Enabled shared-agent memory_cli is missing or differs from this kit.');
  }
  let validStore = false;
  if (validSelection) {
    try {
      memory.execute(memory.parse(['validate', '--home', memoryHome, '--agent', agent]), { env: {} });
      validStore = true;
    } catch { /* Memory validation errors may contain private data; emit no details. */ }
  }
  check('memory_store', validStore, validStore ? 'Selected store passes schema validation.' : 'Selected store is missing, corrupt, or unsafe. Inspect it before initializing or repairing; no files were changed.');
  return { ok: checks.every(item => item.ok), hermes_home: home,
    memory_home: validSelection ? memoryHome : null, agent: validSelection ? agent : null,
    selection_source: { home: args['--home'] ? 'argument' : settings.memory_home ? 'shared-agent' : env.AGENT_MEMORY_HOME ? 'environment' : 'default',
      agent: args['--agent'] ? 'argument' : settings.memory_agent ? 'shared-agent' : 'default' },
    runtime_hooks_verified: false, checks };
}
function main(argv = process.argv.slice(2)) {
  try {
    const args = parse(argv);
    if (args.help) { process.stdout.write(help); return 0; }
    const result = diagnose(args);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.ok ? 0 : 1;
  } catch {
    process.stderr.write(JSON.stringify({ error: 'Invalid arguments or unavailable kit dependencies. Use --help; diagnostic details withheld to protect profile data.' }) + '\n');
    return 2;
  }
}
if (require.main === module) process.exitCode = main();
module.exports = { diagnose, parse };
