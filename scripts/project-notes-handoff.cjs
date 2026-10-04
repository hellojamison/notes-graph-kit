#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { getRepoRoot, getVaultRoot, loadVaultGraph } = require('./lib/project-notes-graph.cjs');
const context = require('./build-project-notes-context.cjs');

const help = `Opt-in agent handoff packets (no graph writes or verification promotion)
Usage:
  notes:handoff create --assignment assignment.json [--out packet.json]
  notes:handoff check --packet packet.json
Create prints JSON unless --out writes a new file exclusively.
Check exits 0 when captured inputs match, 1 when stale, 2 on invalid input.
Assignment fields: question, sender, recipient, scope, acceptance (string arrays),
  inputs (repo-relative files), query, optional maxWords (100-20000), results (1-20).
Scope and acceptance are instructions, not execution permissions enforced by this tool.
`;

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a nonempty string`);
  return value;
}
function strings(value, label) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must be a nonempty string array`);
  value.forEach((item) => text(item, label));
  return value;
}
function fileHash(root, relative) {
  text(relative, 'file path');
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('File paths must be relative and contain no parent traversal');
  const base = fs.realpathSync(root);
  const file = fs.realpathSync(path.resolve(base, relative));
  if (!file.startsWith(`${base}${path.sep}`)) throw new Error('File resolves outside its source root');
  if (!fs.statSync(file).isFile()) throw new Error(`Expected a file: ${relative}`);
  return hash(fs.readFileSync(file));
}
function identity(repo) {
  const root = fs.realpathSync(repo);
  const top = fs.realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim());
  if (top !== root) throw new Error('Repository must be the exact Git worktree root');
  return { root, head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() };
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function create(assignment, env = process.env) {
  const allowed = new Set(['question', 'sender', 'recipient', 'scope', 'acceptance', 'inputs', 'query', 'maxWords', 'results']);
  if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) throw new Error('Assignment must be an object');
  for (const key of Object.keys(assignment)) if (!allowed.has(key)) throw new Error(`Unknown assignment field: ${key}`);
  ['question', 'sender', 'recipient', 'query'].forEach((key) => text(assignment[key], key));
  ['scope', 'acceptance', 'inputs'].forEach((key) => strings(assignment[key], key));
  const repository = identity(getRepoRoot(env));
  const vault = fs.realpathSync(getVaultRoot({ env }));
  const maxWords = assignment.maxWords ?? 3000;
  const results = assignment.results ?? 5;
  if (!Number.isSafeInteger(maxWords) || maxWords < 100 || maxWords > 20000) throw new Error('maxWords must be an integer from 100 to 20000');
  if (!Number.isSafeInteger(results) || results < 1 || results > 20) throw new Error('results must be an integer from 1 to 20');
  const inputs = [...new Set(assignment.inputs)].map((file) => ({ path: file, sha256: fileHash(repository.root, file) }));
  const graph = loadVaultGraph({ env, vaultRoot: vault });
  const packetContext = context.buildContext(assignment.query, graph, { maxWords, results });
  const sources = [...new Set(packetContext.items.map((item) => item.path))].map((file) => ({ path: file, sha256: hash(graph.noteByRel.get(file).text) }));
  const packet = {
    handoffFormat: 1, id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    state: 'prepared', assignment, repository, vault, inputs, sources, context: packetContext,
    responseContract: {
      required: ['examined paths', 'coverage gaps', 'findings with source references', 'facts versus hypotheses', 'exact commands and exit codes', 'artifact paths and hashes', 'working', 'not verified', 'tried and failed'],
      acceptanceOwner: assignment.sender,
      instruction: 'Submit results for review. Worker completion does not certify evidence. Read repository instructions; execution permissions come from the runner and user authorization.'
    },
    freshnessBoundary: 'Checks HEAD and declared file bytes, including retrieved note files. Does not establish exhaustive coverage, permissions, authenticity, environment identity, or test correctness. Declare all relevant inputs.'
  };
  packet.packetSha256 = packetHash(packet);
  // Detect ordinary concurrent edits while assembling the packet.
  if (!check(packet, env).fresh) throw new Error('Inputs changed during packet creation; retry');
  return packet;
}
function check(packet, env = process.env) {
  if (!packet || packet.handoffFormat !== 1 || packet.state !== 'prepared') throw new Error('Unsupported or invalid handoff packet');
  if (packet.packetSha256 !== packetHash(packet)) throw new Error('Packet content digest does not match');
  text(packet.repository?.root, 'repository root'); text(packet.repository?.head, 'repository HEAD'); text(packet.vault, 'vault');
  for (const key of ['inputs', 'sources']) {
    if (!Array.isArray(packet[key]) || (key === 'inputs' && !packet[key].length)) throw new Error(`Invalid ${key}`);
    for (const item of packet[key]) {
      text(item?.path, 'file path');
      if (!/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('Invalid file digest');
    }
  }
  const current = identity(getRepoRoot(env));
  const vault = fs.realpathSync(getVaultRoot({ env }));
  const changes = [];
  if (current.root !== packet.repository.root) changes.push('worktree root differs');
  if (current.head !== packet.repository.head) changes.push('HEAD differs');
  if (vault !== packet.vault) changes.push('vault root differs');
  for (const [items, root, label] of [[packet.inputs, current.root, 'input'], [packet.sources, vault, 'note']]) {
    for (const item of items) {
      try { if (fileHash(root, item.path) !== item.sha256) changes.push(`${label} changed: ${item.path}`); }
      catch (error) { changes.push(`${label} unavailable: ${item.path}: ${error.message}`); }
    }
  }
  return { id: packet.id, fresh: changes.length === 0, changes, boundary: packet.freshnessBoundary };
}
function packetHash(packet) {
  const { packetSha256, ...content } = packet;
  return hash(JSON.stringify(content));
}
function run(argv = process.argv.slice(2), env = process.env) {
  if (argv.length === 0 || argv.includes('--help')) return { output: help, exitCode: 0 };
  const [mode, ...flags] = argv;
  if (!['create', 'check'].includes(mode)) throw new Error('Expected create or check');
  const allowed = mode === 'create' ? ['assignment', 'out'] : ['packet'];
  const args = {};
  for (let i = 0; i < flags.length; i += 2) {
    const key = flags[i].replace(/^--/, '');
    if (!flags[i].startsWith('--') || !allowed.includes(key) || Object.hasOwn(args, key) || !flags[i + 1] || flags[i + 1].startsWith('--')) throw new Error(`Invalid or duplicate option: ${flags[i]}`);
    args[key] = flags[i + 1];
  }
  if (!args[mode === 'create' ? 'assignment' : 'packet']) throw new Error(`Missing --${mode === 'create' ? 'assignment' : 'packet'}`);
  const report = mode === 'create' ? create(readJson(args.assignment), env) : check(readJson(args.packet), env);
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    const destination = path.join(fs.realpathSync(path.dirname(path.resolve(args.out))), path.basename(args.out));
    const vault = fs.realpathSync(getVaultRoot({ env }));
    if (destination === vault || destination.startsWith(`${vault}${path.sep}`)) throw new Error('Keep handoff packets outside the canonical notes vault');
    fs.writeFileSync(args.out, output, { flag: 'wx', mode: 0o600 });
    return { output: `Created ${args.out}\n`, exitCode: 0 };
  }
  return { output, exitCode: mode === 'check' && !report.fresh ? 1 : 0 };
}
if (require.main === module) {
  try { const result = run(); process.stdout.write(result.output); process.exitCode = result.exitCode; }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}
module.exports = { create, check, run };
