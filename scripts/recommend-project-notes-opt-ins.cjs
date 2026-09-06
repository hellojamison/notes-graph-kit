#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { loadVaultGraph } = require('./lib/project-notes-graph.cjs');
const { adoptionReport } = require('./lib/project-notes-adoption.cjs');

const defaultRepoRoot = path.resolve(__dirname, '..');
const SCALE_RECOMMENDATION_NOTES = 20;

function help() {
  return `Recommend project-notes opt-ins without changing the repository

Usage:
  node scripts/recommend-project-notes-opt-ins.cjs [--json]

Options:
  --json  Emit a machine-readable agent recommendation contract
`;
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === '--json' || arg === '--help') {
      const key = arg.slice(2);
      if (parsed[key]) throw new Error(`Duplicate option: ${arg}`);
      parsed[key] = true;
    } else {
      throw new Error(arg.startsWith('--') ? `Unknown option: ${arg}` : `Unexpected positional argument: ${arg}`);
    }
  }
  return parsed;
}

function walkMarkdown(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkMarkdown(target));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(target);
  }
  return files;
}

function regularFileState(file) {
  if (!fs.existsSync(file)) return 'missing';
  const stat = fs.lstatSync(file);
  return stat.isFile() && !stat.isSymbolicLink() ? 'configured' : 'unsafe';
}

function workflowText(repoRoot) {
  const root = path.join(repoRoot, '.github', 'workflows');
  if (!fs.existsSync(root)) return '';
  const contents = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
    const file = path.join(root, entry.name);
    if (fs.lstatSync(file).isSymbolicLink()) continue;
    contents.push(fs.readFileSync(file, 'utf8'));
  }
  return contents.join('\n');
}

function recommendation(id, state, recommendationLevel, details) {
  return {
    id,
    state,
    recommendation: recommendationLevel,
    requires_user_approval: Boolean(details.requiresUserApproval),
    action_kind: details.actionKind,
    rationale: details.rationale,
    next_step: details.nextStep,
    command: details.command || null
  };
}

function inspect(repoRoot) {
  const configPath = path.join(repoRoot, 'notes-graph.config.json');
  if (regularFileState(configPath) !== 'configured') throw new Error(`A regular notes-graph.config.json is required in ${repoRoot}`);
  let config;
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch (error) { throw new Error(`Invalid notes-graph.config.json: ${error.message}`); }
  const vaultDir = typeof config.vaultDir === 'string' && config.vaultDir ? config.vaultDir : 'Project Notes';
  const vaultRoot = path.resolve(repoRoot, vaultDir);
  const relativeVault = path.relative(repoRoot, vaultRoot);
  if (relativeVault === '..' || relativeVault.startsWith(`..${path.sep}`) || path.isAbsolute(relativeVault)) {
    throw new Error('Configured vault must be inside the repository');
  }
  const noteCount = walkMarkdown(vaultRoot).length;
  const substantial = noteCount >= SCALE_RECOMMENDATION_NOTES;
  const evaluationState = regularFileState(path.join(repoRoot, 'notes-search-eval.yml'));
  const contextEvaluationState = regularFileState(path.join(repoRoot, 'notes-context-eval.yml'));
  const baselineState = regularFileState(path.join(repoRoot, 'notes-stats-baseline.json'));
  const workflows = workflowText(repoRoot);
  const evaluationCi = /npm\s+run\s+notes:search:eval\b/.test(workflows);
  const contextEvaluationCi = /npm\s+run\s+notes:context:eval\b/.test(workflows);
  const baselineCi = /npm\s+run\s+notes:stats\s+--\s+--baseline\b/.test(workflows);
  const recommendations = [];
  const adoption = adoptionReport(repoRoot, loadVaultGraph({ env: { ...process.env, PROJECT_NOTES_NOTES_REPO_ROOT: repoRoot }, vaultRoot }));

  if (adoption.instruction.presence !== 'present') {
    recommendations.push(recommendation('selected-agent-instruction-block', adoption.instruction.presence, 'recommended', {
      requiresUserApproval: true, actionKind: 'writes-instructions',
      rationale: `The selected ${adoption.instruction.selected_agent} instruction file does not have a usable Project Notes Graph block.`,
      nextStep: 'Ask before safely adding or repairing the selected agent instruction block.', command: null
    }));
  }
  if (!adoption.helpers.recorded || adoption.helpers.modified || adoption.helpers.missing || adoption.helpers.unsafe) {
    recommendations.push(recommendation('managed-helper-review', adoption.helpers.recorded ? 'attention-required' : 'unknown-baseline', 'recommended', {
      requiresUserApproval: true, actionKind: 'upgrade-review',
      rationale: adoption.helpers.recorded ? 'Managed helper drift or missing helpers require explicit review before an upgrade can overwrite anything.' : 'This install has no recorded managed-helper hashes.',
      nextStep: 'Run an upgrade dry-run and explicitly review every reported helper hash before accepting a managed change.', command: 'node install-notes-graph.cjs --upgrade --dry-run'
    }));
  }
  if (adoption.processes.missing_status.length || adoption.processes.duplicate_status.length) {
    recommendations.push(recommendation('process-status-coverage', 'incomplete', 'recommended', {
      requiresUserApproval: true, actionKind: 'writes-reviewed-notes',
      rationale: `${adoption.processes.missing_status.length} configured process(es) lack a Status note and ${adoption.processes.duplicate_status.length} have duplicate Status notes.`,
      nextStep: 'Inspect current evidence, then ask before creating a missing Status note or resolving a duplicate.', command: null
    }));
  }
  if (adoption.contracts.search.state === 'missing' || adoption.contracts.context.state === 'missing') {
    recommendations.push(recommendation('retrieval-contract-coverage', 'incomplete', 'recommended', {
      requiresUserApproval: true, actionKind: 'writes-reviewed-file',
      rationale: 'One or both reviewed retrieval contracts are missing.',
      nextStep: 'Ask whether the user wants to author representative search and context expectations; never generate expectations from current results automatically.', command: null
    }));
  }

  recommendations.push(recommendation('search-evaluation-contract', evaluationState,
    evaluationState === 'missing' ? (substantial ? 'recommended' : 'optional') : evaluationState === 'configured' ? 'enabled' : 'attention-required', {
      requiresUserApproval: evaluationState === 'missing',
      actionKind: evaluationState === 'missing' ? 'writes-reviewed-file' : 'read-only',
      rationale: evaluationState === 'missing'
        ? `${noteCount} Markdown notes are present; reviewed retrieval expectations prevent silent ranking regressions.`
        : evaluationState === 'configured' ? 'A repo-owned retrieval contract is present.' : 'The expected contract path is not a regular file.',
      nextStep: evaluationState === 'missing'
        ? 'Ask whether the user wants to author and review representative search queries; never generate expectations from current results automatically.'
        : evaluationState === 'configured' ? 'Run the existing contract and report any misses.' : 'Ask the user to resolve the unsafe path before continuing.',
      command: evaluationState === 'configured' ? 'npm run notes:search:eval' : null
    }));

  recommendations.push(recommendation('stats-baseline', baselineState,
    baselineState === 'missing' ? (substantial ? 'recommended' : 'optional') : baselineState === 'configured' ? 'enabled' : 'attention-required', {
      requiresUserApproval: baselineState === 'missing',
      actionKind: baselineState === 'missing' ? 'writes-reviewed-file' : 'read-only',
      rationale: baselineState === 'missing'
        ? `${noteCount} Markdown notes are present; a reviewed baseline can detect graph and retrieval regressions.`
        : baselineState === 'configured' ? 'A repo-owned stats baseline is present.' : 'The expected baseline path is not a regular file.',
      nextStep: baselineState === 'missing'
        ? 'After validation passes, ask whether the user wants to create and commit the current reviewed baseline.'
        : baselineState === 'configured' ? 'Compare current stats with the existing baseline.' : 'Ask the user to resolve the unsafe path before continuing.',
      command: baselineState === 'missing'
        ? 'npm run notes:stats -- --write-baseline notes-stats-baseline.json'
        : baselineState === 'configured' ? 'npm run notes:stats -- --baseline notes-stats-baseline.json' : null
    }));

  recommendations.push(recommendation('context-evaluation-contract', contextEvaluationState,
    contextEvaluationState === 'missing' ? (substantial ? 'recommended' : 'optional') : contextEvaluationState === 'configured' ? 'enabled' : 'attention-required', {
      requiresUserApproval: contextEvaluationState === 'missing',
      actionKind: contextEvaluationState === 'missing' ? 'writes-reviewed-file' : 'read-only',
      rationale: contextEvaluationState === 'missing'
        ? `${noteCount} Markdown notes are present; reviewed context expectations protect source selection, ordering, exclusions, attribution, and budget behavior.`
        : contextEvaluationState === 'configured' ? 'A repo-owned context-quality contract is present.' : 'The expected context contract path is not a regular file.',
      nextStep: contextEvaluationState === 'missing'
        ? 'Ask whether the user wants to author and review representative context cases; never generate expectations from current output automatically.'
        : contextEvaluationState === 'configured' ? 'Run the existing contract and report any misses.' : 'Ask the user to resolve the unsafe path before continuing.',
      command: contextEvaluationState === 'configured' ? 'npm run notes:context:eval' : null
    }));

  recommendations.push(recommendation('search-evaluation-ci', evaluationCi ? 'configured' : 'missing',
    evaluationState === 'configured' && !evaluationCi ? 'recommended' : evaluationCi ? 'enabled' : 'not-ready', {
      requiresUserApproval: evaluationState === 'configured' && !evaluationCi,
      actionKind: evaluationState === 'configured' && !evaluationCi ? 'edits-ci' : 'read-only',
      rationale: evaluationCi ? 'CI already runs the reviewed retrieval contract.' : evaluationState === 'configured' ? 'The contract exists but CI does not appear to run it.' : 'CI should not gate retrieval until a reviewed contract exists.',
      nextStep: evaluationState === 'configured' && !evaluationCi ? 'Ask before editing CI to run npm run notes:search:eval.' : evaluationCi ? 'Keep the gate and review failures.' : 'Create and review a contract before offering this CI opt-in.',
      command: null
    }));

  recommendations.push(recommendation('stats-baseline-ci', baselineCi ? 'configured' : 'missing',
    baselineState === 'configured' && !baselineCi ? 'recommended' : baselineCi ? 'enabled' : 'not-ready', {
      requiresUserApproval: baselineState === 'configured' && !baselineCi,
      actionKind: baselineState === 'configured' && !baselineCi ? 'edits-ci' : 'read-only',
      rationale: baselineCi ? 'CI already compares the reviewed stats baseline.' : baselineState === 'configured' ? 'The baseline exists but CI does not appear to compare it.' : 'CI should not reference a baseline that does not exist.',
      nextStep: baselineState === 'configured' && !baselineCi ? 'Ask before editing CI to run the baseline comparison.' : baselineCi ? 'Keep the gate and never replace the baseline merely to silence it.' : 'Create and review a baseline before offering this CI opt-in.',
      command: null
    }));

  recommendations.push(recommendation('context-evaluation-ci', contextEvaluationCi ? 'configured' : 'missing',
    contextEvaluationState === 'configured' && !contextEvaluationCi ? 'recommended' : contextEvaluationCi ? 'enabled' : 'not-ready', {
      requiresUserApproval: contextEvaluationState === 'configured' && !contextEvaluationCi,
      actionKind: contextEvaluationState === 'configured' && !contextEvaluationCi ? 'edits-ci' : 'read-only',
      rationale: contextEvaluationCi ? 'CI already runs the reviewed context contract.' : contextEvaluationState === 'configured' ? 'The context contract exists but CI does not appear to run it.' : 'CI should not gate context quality until a reviewed contract exists.',
      nextStep: contextEvaluationState === 'configured' && !contextEvaluationCi ? 'Ask before editing CI to run npm run notes:context:eval.' : contextEvaluationCi ? 'Keep the gate and review failures.' : 'Create and review a context contract before offering this CI opt-in.',
      command: null
    }));

  recommendations.push(recommendation('duplicate-review', 'available', substantial ? 'recommended-read-only' : 'optional-read-only', {
    requiresUserApproval: false,
    actionKind: 'read-only',
    rationale: `${noteCount} Markdown notes are present; the scan only reports candidates and never changes notes.`,
    nextStep: 'The agent may run the scan without approval, then ask before any merge, rewrite, or deletion.',
    command: 'npm run notes:duplicates'
  }));

  return {
    schema_version: 1,
    repo: repoRoot,
    vault: vaultDir,
    note_count: noteCount,
    adoption,
    agent_policy: {
      prompt_only_when_requires_user_approval: true,
      never_enable_opt_ins_silently: true,
      read_only_recommendations_may_run_without_approval: true
    },
    recommendations
  };
}

function render(report) {
  const lines = [`Agent opt-in recommendations: ${report.note_count} Markdown notes`];
  for (const item of report.recommendations) {
    lines.push(`${item.recommendation.toUpperCase()} ${item.id} [${item.state}]`);
    lines.push(`  ${item.rationale}`);
    lines.push(`  Next: ${item.next_step}`);
    if (item.command) lines.push(`  Command: ${item.command}`);
    if (item.requires_user_approval) lines.push('  User approval required before this write or CI edit.');
  }
  return `${lines.join('\n')}\n`;
}

function run(argv = process.argv.slice(2), options = {}) {
  const args = parseArgs(argv);
  if (args.help) return { output: help(), report: null };
  const repoRoot = path.resolve(options.repoRoot || process.env.PROJECT_NOTES_NOTES_REPO_ROOT || defaultRepoRoot);
  const report = inspect(repoRoot);
  return { output: args.json ? `${JSON.stringify(report, null, 2)}\n` : render(report), report };
}

if (require.main === module) {
  try { process.stdout.write(run().output); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}

module.exports = { parseArgs, regularFileState, workflowText, inspect, render, run };
