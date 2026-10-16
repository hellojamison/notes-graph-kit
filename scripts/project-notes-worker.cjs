#!/usr/bin/env node
'use strict';

// Optional adapter, not an agent framework. The registered host runtime owns
// tools, sandboxing, source coverage and model execution. Handoffs stay v1.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const handoff = require('./project-notes-handoff.cjs');

const START = '<!-- notes-graph-kit:worker:start -->';
const END = '<!-- notes-graph-kit:worker:end -->';
const AGENTS = { codex: 'AGENTS.md', cursor: 'AGENTS.md', claude: 'CLAUDE.md', gemini: 'GEMINI.md', copilot: '.github/copilot-instructions.md' };
const SECTIONS = ['CLAIM', 'EVIDENCE', 'COMMANDS RUN', 'FILES READ', 'FILES MODIFIED', 'TESTS', 'RISKS / UNCERTAINTY', 'RECOMMENDED NEXT ACTION'];
const HELP = `Optional repository workers (disabled by default)
  notes:worker enable [--profile local-coding] [--dry-run]
  notes:worker disable [--dry-run]
  notes:worker doctor
  notes:worker run --role SCOUT|AUDITOR|TESTER --task "bounded question"
    [--input relative/file ...] [--test-command "exact argv" ...]
    [--isolated-tests] [--allow-cloud-fallback] [--metrics-kind production|diagnostic]
  notes:worker status [--job UUID]
  notes:worker cancel --job UUID
  notes:worker review --job UUID
Host registration: PROJECT_NOTES_WORKER_PROFILE_FILE overrides the external JSON
file with schemaVersion:1 and profiles.<name> containing adapter:local-worker-v1,
runtimeDir, stateDir, endpoint, model, allowCloudFallback. Absolute host paths
stay outside repo config. Run is foreground; another terminal can status/cancel.
Exit 0: PASS/control success; 1: FAIL; 2: unavailable/inconclusive/invalid.
No model downloads, service startup, automatic acceptance, or note promotion.
macOS default: ~/Library/Application Support/notes-graph-kit/workers.json.
IMPLEMENTER is reserved for explicitly authorized direct-runtime worktree jobs.
`;
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inside = (base, file) => file === base || file.startsWith(base + path.sep);
const print = (value) => process.stdout.write(JSON.stringify(value, null, 2) + '\n');

function regular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected a regular non-symlink file: ${file}`);
}
function parse(argv) {
  const command = argv[0] || 'doctor';
  const allowed = {
    enable: ['profile', 'dry-run'], disable: ['dry-run'], doctor: [],
    run: ['role', 'task', 'input', 'test-command', 'isolated-tests', 'allow-cloud-fallback', 'metrics-kind'],
    status: ['job'], cancel: ['job'], review: ['job']
  };
  if (command === '--help') return { command: 'help' };
  if (!allowed[command]) throw new Error(`Unknown worker command: ${command}`);
  const args = { command, input: [], 'test-command': [] };
  const booleans = new Set(['dry-run', 'isolated-tests', 'allow-cloud-fallback']);
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i].slice(2);
    if (!argv[i].startsWith('--') || !allowed[command].includes(key)) throw new Error(`Unknown option: ${argv[i]}`);
    if (booleans.has(key)) {
      if (args[key]) throw new Error(`Duplicate option: --${key}`);
      args[key] = true;
    } else {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`--${key} requires a value`);
      if (['input', 'test-command'].includes(key)) args[key].push(value);
      else {
        if (args[key] !== undefined) throw new Error(`Duplicate option: --${key}`);
        args[key] = value;
      }
    }
  }
  return args;
}

function repoContext(env = process.env) {
  // Resolve relative to the installed helper, never a model-selected cwd.
  const root = fs.realpathSync(path.resolve(__dirname, '..'));
  const top = fs.realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim());
  if (top !== root) throw new Error('Worker helper must be installed at the exact Git worktree root');
  const configFile = path.join(root, 'notes-graph.config.json');
  regular(configFile);
  const config = json(configFile);
  const instruction = AGENTS[config.agent || 'codex'];
  if (!instruction) throw new Error('Invalid selected agent');
  return { root, configFile, config, instruction,
    env: { ...env, PROJECT_NOTES_NOTES_REPO_ROOT: root, PROJECT_NOTES_CONFIG: configFile,
      PROJECT_NOTES_NOTES_VAULT_ROOT: path.resolve(root, config.vaultDir || 'Project Notes') } };
}

function instructionContent(content, enabled) {
  // Ignore examples in fenced blocks; refuse damaged real marker pairs.
  const lines = content.split('\n');
  let fence = null;
  const starts = [], ends = [];
  lines.forEach((line, index) => {
    if (fence) {
      if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null;
      return;
    }
    const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (match) { fence = match[1]; return; }
    if (line.trim() === START) starts.push(index);
    if (line.trim() === END) ends.push(index);
  });
  if (starts.length !== ends.length || starts.length > 1 || (starts.length && starts[0] >= ends[0])) throw new Error('Damaged worker instruction markers');
  const block = `${START}\n## Optional repository workers\n\nWhen notes-graph.config.json has workers.enabled:true, run npm run notes:worker -- doctor before the first worker job. If unavailable, report the limitation; never install a runtime or enable cloud fallback silently.\nThe coordinator owns planning, architecture, ambiguity, risky changes and final acceptance. Route bounded mechanical work through npm run notes:worker -- run --role SCOUT|AUDITOR|TESTER --task "specific question" --input relevant/file (repeat inputs). Use real source/tool evidence; never a whole-repo dump.\nWorkers default to read-only. Authorize exact test argv with --test-command; use --isolated-tests for artifact-writing tests. IMPLEMENTER requires separately authorized direct-runtime work in a clean isolated non-main worktree; this adapter does not dispatch it.\nFor the local-coding profile, the selected coordinator may be GPT-6 Astra or GPT-6.1 Sol; both use Qwen first as the primary mechanical worker and Luna xhigh as the bounded fallback only when authorized. Additional Sol review from an Astra chat is reserved for difficult/risky work; a Sol coordinator does not launch another Sol for routine worker failure. A task exceeding about 90 seconds or lacking evidence must return promptly. Scope errors, stale packets and changed source return to the coordinator, not cloud.\nConsume the compact receipt and job artifact paths. Run npm run notes:worker -- review --job ID before using results later; review checks freshness and artifact integrity, not semantic correctness. Inspect material source/test evidence independently. Worker PASS and same-model agreement never certify evidence. Only the coordinator promotes accepted findings through notes:new/notes:closeout.\n${END}`;
  if (starts.length) {
    lines.splice(starts[0], ends[0] - starts[0] + 1, ...(enabled ? block.split('\n') : []));
    return lines.join('\n');
  }
  if (!enabled) return content;
  if (fence) throw new Error('Unclosed instruction fence; cannot safely append');
  return content + (content.endsWith('\n') ? '' : '\n') + block + '\n';
}

function safeParents(file, root) {
  for (let dir = path.dirname(file); inside(root, dir); dir = path.dirname(dir)) {
    if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) throw new Error(`Symlink parent refused: ${dir}`);
    if (dir === root) break;
  }
}
function toggle(ctx, args) {
  const enabled = args.command === 'enable';
  const profile = args.profile || ctx.config.workers?.profile || 'local-coding';
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(profile)) throw new Error('Invalid worker profile name');
  const instructionFile = path.join(ctx.root, ctx.instruction);
  safeParents(instructionFile, ctx.root);
  const exists = fs.existsSync(instructionFile);
  if (exists) regular(instructionFile);
  const before = exists ? fs.readFileSync(instructionFile, 'utf8') : '';
  const next = instructionContent(before, enabled);
  const config = { ...ctx.config, workers: { enabled, profile } };
  if (!args['dry-run']) {
    // Two-file reversible transaction; preserve every unrelated config key.
    const oldConfig = fs.readFileSync(ctx.configFile);
    try {
      fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
      fs.writeFileSync(instructionFile, next);
      fs.writeFileSync(ctx.configFile, JSON.stringify(config, null, 2) + '\n');
    } catch (error) {
      fs.writeFileSync(ctx.configFile, oldConfig);
      if (exists) fs.writeFileSync(instructionFile, before);
      else fs.rmSync(instructionFile, { force: true });
      throw error;
    }
  }
  return { enabled, profile, dry_run: Boolean(args['dry-run']), files: [ctx.configFile, instructionFile] };
}

function runtime(ctx) {
  const profileFile = ctx.env.PROJECT_NOTES_WORKER_PROFILE_FILE || path.join(os.homedir(), 'Library', 'Application Support', 'notes-graph-kit', 'workers.json');
  if (!profileFile || !path.isAbsolute(profileFile)) throw new Error('Set PROJECT_NOTES_WORKER_PROFILE_FILE to an absolute external host profile file');
  regular(profileFile);
  if (inside(ctx.root, fs.realpathSync(profileFile))) throw new Error('Host profile must be outside the repository');
  const registry = json(profileFile);
  const name = ctx.config.workers?.profile || 'local-coding';
  const p = registry.profiles?.[name];
  if (registry.schemaVersion !== 1 || p?.adapter !== 'local-worker-v1') throw new Error('Unsupported host profile/adapter');
  if (process.platform !== 'darwin') throw new Error('local-worker-v1 requires the registered macOS sandbox runtime');
  for (const key of ['runtimeDir', 'stateDir']) if (!path.isAbsolute(p[key] || '')) throw new Error(`${key} must be absolute`);
  if (!['http://127.0.0.1:8080/v1', 'http://localhost:8080/v1'].includes(p.endpoint)) throw new Error('This adapter requires the supported loopback endpoint on port 8080');
  if (typeof p.model !== 'string' || !p.model.trim()) throw new Error('Host profile requires model');
  if (typeof p.allowCloudFallback !== 'boolean') throw new Error('Host profile requires explicit allowCloudFallback boolean');
  const runtimeDir = fs.realpathSync(p.runtimeDir);
  for (const file of ['worker.py', 'route-worker.py', 'qwen', 'contract.txt']) regular(path.join(runtimeDir, file));
  // Managed Python environments commonly symlink their interpreter.
  fs.accessSync(path.join(runtimeDir, '.venv/bin/python'), fs.constants.X_OK);
  let stateDir = path.resolve(p.stateDir);
  // Resolve an existing ancestor before creating state, including symlink parents.
  let ancestor = stateDir;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  stateDir = path.join(fs.realpathSync(ancestor), path.relative(ancestor, stateDir));
  if (inside(ctx.root, stateDir) || stateDir === path.parse(stateDir).root) throw new Error('Worker state must be outside the repository, in a dedicated directory');
  if (fs.existsSync(stateDir) && fs.lstatSync(stateDir).isSymbolicLink()) throw new Error('Symlink state directory refused');
  return { ...p, runtimeDir, stateDir, name };
}

function writeJson(file, value, exclusive = false) {
  const text = JSON.stringify(value, null, 2) + '\n';
  if (exclusive) return fs.writeFileSync(file, text, { flag: 'wx', mode: 0o600 });
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(temp, text, { flag: 'wx', mode: 0o600 });
  fs.renameSync(temp, file);
}
function jobPath(p, id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id || '')) throw new Error('A valid --job UUID is required');
  return path.join(p.stateDir, id);
}
function loadJob(ctx, p, id) {
  const dir = jobPath(p, id), file = path.join(dir, 'job.json');
  regular(file);
  const job = json(file);
  if (job.repo !== ctx.root || job.id !== id) throw new Error('Job belongs to a different repository or identity');
  return { dir, file, job };
}
function validateReceipt(text) {
  const status = text.match(/^STATUS: (PASS|FAIL|INCONCLUSIVE)\s*$/m)?.[1];
  if (!status) throw new Error('Malformed receipt STATUS');
  for (const label of SECTIONS) if (!text.includes('\n' + label + ':\n')) throw new Error(`Receipt missing ${label}`);
  return status;
}
function verifyResult(ctx, dir, packet, exitCode, cloudAllowed) {
  const receiptFile = path.join(dir, 'receipt.txt');
  regular(receiptFile);
  const localStatus = validateReceipt(fs.readFileSync(receiptFile, 'utf8'));
  const evidenceFile = path.join(dir, 'receipt.evidence.json');
  const responseFile = path.join(dir, 'receipt.handoff-response.json');
  regular(evidenceFile); regular(responseFile);
  const evidence = json(evidenceFile), response = json(responseFile);
  if (response.packet_id !== packet.id || response.packet_sha256 !== packet.packetSha256
      || response.acceptance !== 'PENDING_COORDINATOR_REVIEW' || response.acceptance_owner !== packet.assignment.sender
      || response.status !== localStatus || evidence.handoff?.state !== 'READY'
      || !evidence.handoff?.freshness_after?.fresh) throw new Error('Invalid packet-linked response/freshness');
  if (!Array.isArray(evidence.files_modified) || evidence.files_modified.length || !Array.isArray(response.files_modified) || response.files_modified.length) throw new Error('Read-only source drift requires coordinator reconciliation');
  for (const key of ['examined_paths', 'unexamined_declared_inputs', 'coverage_gaps', 'commands', 'artifacts']) if (!Array.isArray(response[key])) throw new Error(`Malformed response ${key}`);
  for (const key of ['facts_versus_hypotheses', 'working', 'not_verified', 'tried_and_failed']) if (response[key] === undefined || response[key] === null) throw new Error(`Response missing ${key}`);
  for (const command of response.commands) if (!Array.isArray(command.argv) || !Number.isInteger(command.exit_code)) throw new Error('Malformed command evidence');
  const requiredArtifacts = [receiptFile, evidenceFile, path.join(dir, 'packet.json')];
  for (const file of requiredArtifacts) {
    const artifact = response.artifacts.find((a) => a.path === file);
    if (!artifact || artifact.sha256 !== digest(file)) throw new Error('Response artifact hash mismatch');
  }
  let status = localStatus, finalReceipt = receiptFile;
  const files = [...requiredArtifacts, responseFile];
  const routingFile = path.join(dir, 'receipt.routing.json');
  if (fs.existsSync(routingFile)) {
    regular(routingFile); files.push(routingFile);
    const routing = json(routingFile);
    if (routing.cloud_status && routing.cloud_status !== 'NOT_RUN') {
      if (!cloudAllowed) throw new Error('Unauthorized cloud fallback');
      finalReceipt = path.join(dir, 'receipt.luna.txt');
      regular(finalReceipt); files.push(finalReceipt);
      status = validateReceipt(fs.readFileSync(finalReceipt, 'utf8'));
      if (status !== routing.cloud_status) throw new Error('Cloud receipt status mismatch');
    }
  }
  const expected = { PASS: 0, FAIL: 1, INCONCLUSIVE: 2 }[status];
  if (expected !== exitCode) throw new Error('Receipt status does not match runtime exit');
  return { status, receipt_path: finalReceipt, response_path: responseFile,
    acceptance: 'PENDING_COORDINATOR_REVIEW',
    artifacts: files.map((file) => ({ path: file, sha256: digest(file) })) };
}

async function runJob(ctx, p, args) {
  if (ctx.config.workers?.enabled !== true) throw new Error('Repository workers are disabled; enable explicitly first');
  const role = args.role || 'SCOUT';
  if (!['SCOUT', 'AUDITOR', 'TESTER'].includes(role)) throw new Error('Only read-only SCOUT/AUDITOR/TESTER jobs are supported; IMPLEMENTER requires separate direct-runtime authorization');
  if (!args.task?.trim()) throw new Error('--task is required');
  const metricsKind = args['metrics-kind'] || 'production';
  if (!['production', 'diagnostic'].includes(metricsKind)) throw new Error('Invalid --metrics-kind');
  const cloudAllowed = Boolean(args['allow-cloud-fallback']);
  if (cloudAllowed && !p.allowCloudFallback) throw new Error('Cloud fallback is not authorized by the host profile');
  fs.mkdirSync(p.stateDir, { recursive: true, mode: 0o700 });
  const id = crypto.randomUUID(), dir = jobPath(p, id), lock = path.join(p.stateDir, 'active.json');
  // One worker across repos using this host state directory. Never steal a lock.
  try { writeJson(lock, { id, repo: ctx.root, supervisor_pid: process.pid }, true); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Host worker busy or stale lock; inspect status and reconcile before retrying'); throw error; }
  let child, timer, killTimer, stopReason, stopped, cleanupWarning;
  const stop = (reason) => {
    if (stopReason) return;
    stopReason = reason;
    if (child?.pid) {
      // The existing cloud launcher starts a new session. Capture descendants
      // before signalling, so cancellation also reaches that separate group.
      const descendants = new Set([child.pid]);
      let rows = [];
      try {
        rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n')
          .map((line) => line.trim().split(/\s+/).map(Number));
      } catch (error) {
        cleanupWarning = `Process inventory unavailable (${error.code || error.message}); group cancellation attempted, detached descendant cleanup not verified.`;
      }
      let changed = true;
      while (changed) {
        changed = false;
        for (const [pid, parent] of rows) if (descendants.has(parent) && !descendants.has(pid)) { descendants.add(pid); changed = true; }
      }
      const signal = (name) => {
        try { process.kill(-child.pid, name); } catch {}
        for (const pid of [...descendants].reverse()) { try { process.kill(pid, name); } catch {} }
      };
      signal('SIGTERM');
      stopped = new Promise((resolve) => { killTimer = setTimeout(() => { signal('SIGKILL'); resolve(); }, 1000); });
    }
  };
  const onSignal = () => stop('CANCELLED');
  process.on('SIGTERM', onSignal); process.on('SIGINT', onSignal);
  let job;
  try {
    fs.mkdirSync(dir, { mode: 0o700 });
    const inputs = [...new Set(['notes-graph.config.json', ctx.instruction, 'README.md', ...args.input]
      .filter((file) => args.input.includes(file) || fs.existsSync(path.join(ctx.root, file))))];
    const packet = handoff.create({ question: args.task, sender: p.coordinator || 'coordinator', recipient: 'qwen-worker-' + id,
      scope: [`${role}: bounded read-only investigation; modify no source or shared notes.`],
      acceptance: ['Exact file/line evidence, coverage gaps, command exit codes, and compact structured receipt; coordinator acceptance pending.'],
      inputs, query: args.task, maxWords: 1500, results: 3 }, ctx.env);
    writeJson(path.join(dir, 'packet.json'), packet, true);
    if (!handoff.check(packet, ctx.env).fresh) throw new Error('Handoff stale before dispatch');
    const argv = [path.join(p.runtimeDir, cloudAllowed ? 'route-worker.py' : 'worker.py'),
      '--repo', ctx.root, '--role', role, '--task', args.task,
      '--output', path.join(dir, 'receipt.txt'), '--handoff-mode', 'required', '--handoff-packet', path.join(dir, 'packet.json'),
      '--endpoint', p.endpoint, '--model', p.model, '--budget', '90', '--metrics-kind', metricsKind];
    for (const command of args['test-command']) argv.push('--test-command', command);
    if (args['isolated-tests']) argv.push('--isolated-tests');
    job = { schemaVersion: 1, id, repo: ctx.root, role, task: args.task, profile: p.name, state: 'RUNNING',
      status: null, acceptance: 'PENDING_COORDINATOR_REVIEW', packet_id: packet.id,
      packet_path: path.join(dir, 'packet.json'), started_at: new Date().toISOString(),
      supervisor_pid: process.pid, cloud_allowed: cloudAllowed, metrics_kind: metricsKind, command: [path.join(p.runtimeDir, '.venv/bin/python'), ...argv] };
    writeJson(path.join(dir, 'job.json'), job);
    process.stderr.write(`Worker job ${id}; artifacts: ${dir}\n`);
    const log = fs.openSync(path.join(dir, 'runtime.log'), 'wx', 0o600);
    const started = Date.now(), ceiling = (cloudAllowed ? 280 : 100) * 1000;
    let exitCode;
    try {
      child = spawn(job.command[0], argv, { cwd: ctx.root, env: ctx.env, detached: true, stdio: ['ignore', log, log] });
      timer = setInterval(() => {
        if (fs.existsSync(path.join(dir, 'cancel.json'))) stop('CANCELLED');
        else if (Date.now() - started > ceiling) stop('TIMED_OUT');
      }, 200);
      exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => resolve(code)); });
    } finally { fs.closeSync(log); clearInterval(timer); if (stopped) await stopped; }
    const freshness = handoff.check(packet, ctx.env);
    let result;
    try {
      if (stopReason) throw new Error(stopReason);
      if (!freshness.fresh) throw new Error('Handoff stale after execution; coordinator reconciliation required');
      result = verifyResult(ctx, dir, packet, exitCode, cloudAllowed);
    } catch (error) { result = { status: 'INCONCLUSIVE', reason: error.message, acceptance: 'PENDING_COORDINATOR_REVIEW' }; }
    job = { ...job, ...result, state: stopReason || 'COMPLETED', exit_code: exitCode,
      freshness, ...(cleanupWarning ? { cleanup_warning: cleanupWarning } : {}), ended_at: new Date().toISOString() };
    writeJson(path.join(dir, 'job.json'), job);
    print(job);
    return { PASS: 0, FAIL: 1, INCONCLUSIVE: 2 }[job.status];
  } catch (error) {
    if (job) writeJson(path.join(dir, 'job.json'), { ...job, state: 'COMPLETED', status: 'INCONCLUSIVE', reason: error.message, ended_at: new Date().toISOString() });
    throw error;
  } finally {
    clearInterval(timer); clearTimeout(killTimer);
    process.removeListener('SIGTERM', onSignal); process.removeListener('SIGINT', onSignal);
    if (fs.existsSync(lock) && json(lock).id === id) fs.unlinkSync(lock);
  }
}

async function main(argv = process.argv.slice(2)) {
  const args = parse(argv);
  if (args.command === 'help') { process.stdout.write(HELP); return 0; }
  const ctx = repoContext();
  if (['enable', 'disable'].includes(args.command)) { print(toggle(ctx, args)); return 0; }
  if (args.command === 'doctor') {
    try {
      const p = runtime(ctx);
      const reply = await fetch(p.endpoint + '/models', { signal: AbortSignal.timeout(5000) });
      if (!reply.ok) throw new Error(`Model service HTTP ${reply.status}`);
      const models = await reply.json();
      if (!models.data?.some((m) => m.id === p.model)) throw new Error(`Configured model ${p.model} is not available`);
      print({ status: 'READY', enabled: ctx.config.workers?.enabled === true, profile: p.name, endpoint: p.endpoint, model: p.model, state_dir: p.stateDir, read_only: true, concurrency: 1 });
      return 0;
    } catch (error) { print({ status: 'UNAVAILABLE', enabled: ctx.config.workers?.enabled === true, reason: error.message }); return 2; }
  }
  const p = runtime(ctx);
  if (args.command === 'run') return runJob(ctx, p, args);
  if (args.command === 'status' && !args.job) {
    const lock = path.join(p.stateDir, 'active.json');
    print(fs.existsSync(lock) ? { state: 'LOCKED', ...json(lock) } : { state: 'IDLE' });
    return 0;
  }
  const { dir, job } = loadJob(ctx, p, args.job);
  if (args.command === 'status') { print(job); return 0; }
  if (args.command === 'cancel') {
    if (job.state !== 'RUNNING') throw new Error('Job is not running');
    const lock = json(path.join(p.stateDir, 'active.json'));
    if (lock.id !== job.id) throw new Error('Job is no longer the active worker');
    writeJson(path.join(dir, 'cancel.json'), { requested_at: new Date().toISOString() }, true);
    print({ id: job.id, cancellation_requested: true }); return 0;
  }
  const packet = json(job.packet_path);
  const freshness = handoff.check(packet, ctx.env);
  const errors = [];
  if (!job.artifacts?.length) errors.push('No validated result artifacts');
  for (const a of job.artifacts || []) {
    try { regular(a.path); if (digest(a.path) !== a.sha256) errors.push('Artifact changed: ' + a.path); }
    catch { errors.push('Artifact unavailable: ' + a.path); }
  }
  print({ id: job.id, status: job.status, fresh: freshness.fresh, changes: freshness.changes, integrity_errors: errors,
    acceptance: 'PENDING_COORDINATOR_REVIEW', boundary: 'Integrity/freshness only; coordinator must independently assess claims and coverage.' });
  return freshness.fresh && !errors.length ? 0 : 2;
}

if (require.main === module) main().then((code) => { process.exitCode = code; }).catch((error) => { process.stderr.write(error.message + '\n'); process.exitCode = 2; });
module.exports = { parse, instructionContent, validateReceipt, verifyResult, runtime, HELP };
