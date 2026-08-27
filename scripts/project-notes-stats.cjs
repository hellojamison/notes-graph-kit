#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const {
  getRepoRoot,
  getVaultRoot,
  loadVaultGraph,
  extractWikilinkTargets,
  resolveTargetDetailed,
  isDaily
} = require('./lib/project-notes-graph.cjs');
const { tokenize, splitSections } = require('./search-project-notes.cjs');
const {
  safeEvalPath,
  loadContract,
  evaluateContract
} = require('./evaluate-project-notes-search.cjs');

const DEFAULT_TOP = 10;
const DEFAULT_STALE_DAYS = 90;
const DEFAULT_EVAL_FILE = 'notes-search-eval.yml';
const BASELINE_SCHEMA_VERSION = 1;

function help() {
  return `Report project-notes scale, graph health, freshness, and retrieval quality

Usage:
  node scripts/project-notes-stats.cjs [--top 10] [--stale-days 90] [--eval-file notes-search-eval.yml] [--baseline PATH] [--changed-since REF] [--json]
  node scripts/project-notes-stats.cjs --write-baseline PATH [--replace-baseline]

Options:
  --top COUNT        Largest notes and sections to show (1-100; default: 10)
  --stale-days DAYS  Age at which current processes/runbooks are stale (1-3650; default: 90)
  --eval-file PATH   Evaluation contract inside the repo
  --baseline PATH    Compare stable metrics with a versioned baseline inside the repo
  --changed-since REF  Add tracked Markdown changes since a Git commit/ref
  --write-baseline PATH  Create a baseline; refuses an existing file by default
  --replace-baseline Replace an existing baseline (only with --write-baseline)
  --json             Emit machine-readable JSON
`;
}

function parseArgs(argv) {
  const result = {};
  const values = new Set(['top', 'stale-days', 'eval-file', 'baseline', 'write-baseline', 'changed-since']);
  const booleans = new Set(['json', 'help', 'replace-baseline']);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected positional argument: ${arg}`);
    const split = arg.indexOf('=');
    const key = arg.slice(2, split < 0 ? undefined : split);
    if (!values.has(key) && !booleans.has(key)) throw new Error(`Unknown option: --${key}`);
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate option: --${key}`);
    if (booleans.has(key)) {
      if (split >= 0) throw new Error(`--${key} does not take a value`);
      result[key] = true;
      continue;
    }
    const value = split < 0 ? argv[++i] : arg.slice(split + 1);
    if (!value || value.startsWith('--')) throw new Error(`--${key} requires a value`);
    result[key] = value;
  }
  return result;
}

function changedSinceStats(repoRoot, vaultRoot, graph, ref, runner = execFileSync) {
  const vaultRelative = path.relative(repoRoot, vaultRoot);
  if (vaultRelative === '..' || vaultRelative.startsWith(`..${path.sep}`) || path.isAbsolute(vaultRelative)) {
    throw new Error('Changed-note statistics require the vault to be inside the Git repository');
  }
  try {
    runner('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    throw new Error(`--changed-since must resolve to a Git commit: ${ref}`);
  }
  let output;
  try {
    output = runner('git', ['diff', '--name-only', '-z', ref, '--', vaultRelative], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    throw new Error(`Could not inspect notes changed since ${ref}: ${error.stderr?.trim() || error.message}`);
  }
  const prefix = `${vaultRelative.split(path.sep).join('/')}/`;
  const paths = output.split('\0').filter(Boolean).map((entry) => entry.split(path.sep).join('/'))
    .filter((entry) => entry.startsWith(prefix) && entry.toLowerCase().endsWith('.md'))
    .map((entry) => entry.slice(prefix.length)).sort();
  const existing = paths.filter((rel) => graph.noteByRel.has(rel));
  const deleted = paths.filter((rel) => !graph.noteByRel.has(rel));
  const notes = existing.map((rel) => graph.noteByRel.get(rel));
  return {
    ref,
    trackedOnly: true,
    changed: paths.length,
    existing: existing.length,
    deleted: deleted.length,
    paths: existing,
    deletedPaths: deleted,
    scale: {
      sections: notes.reduce((sum, note) => sum + splitSections(note).length, 0),
      words: notes.reduce((sum, note) => sum + tokenize(note.body).length, 0),
      bytes: notes.reduce((sum, note) => sum + Buffer.byteLength(note.text, 'utf8'), 0)
    }
  };
}

function safeRepoFile(repoRoot, input, options = {}) {
  const canonicalRepo = fs.realpathSync(repoRoot);
  const resolved = path.resolve(canonicalRepo, input);
  const relative = path.relative(canonicalRepo, resolved);
  if (!input || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Baseline file must be inside the repo: ${input}`);
  }
  const parent = path.dirname(resolved);
  if (!fs.existsSync(parent)) throw new Error(`Baseline parent directory does not exist: ${parent}`);
  const canonicalParent = fs.realpathSync(parent);
  const parentRelative = path.relative(canonicalRepo, canonicalParent);
  if (parentRelative === '..' || parentRelative.startsWith(`..${path.sep}`) || path.isAbsolute(parentRelative)) {
    throw new Error(`Baseline file must stay inside the repo: ${input}`);
  }
  if (fs.existsSync(resolved)) {
    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Baseline must be a regular file: ${resolved}`);
    const canonicalFile = fs.realpathSync(resolved);
    const fileRelative = path.relative(canonicalRepo, canonicalFile);
    if (fileRelative === '..' || fileRelative.startsWith(`..${path.sep}`) || path.isAbsolute(fileRelative)) {
      throw new Error(`Baseline file must stay inside the repo: ${input}`);
    }
  } else if (options.mustExist) {
    throw new Error(`Baseline file does not exist: ${resolved}`);
  }
  return resolved;
}

function baselineFor(report) {
  return {
    schema_version: BASELINE_SCHEMA_VERSION,
    metrics: {
      scale: {
        notes: report.scale.notes,
        sections: report.scale.sections,
        words: report.scale.words,
        bytes: report.scale.bytes
      },
      graph: {
        broken_links: report.graph.brokenLinks,
        ambiguous_links: report.graph.ambiguousLinks,
        orphans: report.graph.orphans
      },
      freshness: { stale_current_guides: report.freshness.staleCurrentGuides },
      evaluation: report.evaluation.status === 'not-configured' ? { status: 'not-configured' } : {
        status: report.evaluation.status,
        queries: report.evaluation.queries,
        passed: report.evaluation.passed,
        top1_hits: report.evaluation.top1Hits,
        top3_hits: report.evaluation.top3Hits,
        mean_reciprocal_rank: report.evaluation.meanReciprocalRank
      }
    },
    limits: {}
  };
}

function assertKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`${label} has unknown field(s): ${unknown.sort().join(', ')}`);
}

function nonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number`);
}

function loadBaseline(file) {
  let baseline;
  try { baseline = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`Invalid stats baseline JSON: ${error.message}`); }
  assertKeys(baseline, ['schema_version', 'metrics', 'limits'], 'Baseline');
  if (baseline.schema_version !== BASELINE_SCHEMA_VERSION) throw new Error(`Baseline schema_version must be ${BASELINE_SCHEMA_VERSION}`);
  assertKeys(baseline.metrics, ['scale', 'graph', 'freshness', 'evaluation'], 'Baseline metrics');
  assertKeys(baseline.metrics.scale, ['notes', 'sections', 'words', 'bytes'], 'Baseline scale');
  assertKeys(baseline.metrics.graph, ['broken_links', 'ambiguous_links', 'orphans'], 'Baseline graph');
  assertKeys(baseline.metrics.freshness, ['stale_current_guides'], 'Baseline freshness');
  for (const [key, value] of Object.entries(baseline.metrics.scale)) nonNegative(value, `Baseline scale.${key}`);
  for (const [key, value] of Object.entries(baseline.metrics.graph)) nonNegative(value, `Baseline graph.${key}`);
  nonNegative(baseline.metrics.freshness.stale_current_guides, 'Baseline freshness.stale_current_guides');
  assertKeys(baseline.metrics.evaluation, ['status', 'queries', 'passed', 'top1_hits', 'top3_hits', 'mean_reciprocal_rank'], 'Baseline evaluation');
  if (!['not-configured', 'passing', 'failing'].includes(baseline.metrics.evaluation.status)) throw new Error('Baseline evaluation.status is invalid');
  if (baseline.metrics.evaluation.status !== 'not-configured') {
    for (const key of ['queries', 'passed', 'top1_hits', 'top3_hits', 'mean_reciprocal_rank']) nonNegative(baseline.metrics.evaluation[key], `Baseline evaluation.${key}`);
  }
  const limits = baseline.limits === undefined ? {} : baseline.limits;
  assertKeys(limits, ['max_note_growth', 'max_word_growth_percent'], 'Baseline limits');
  for (const [key, value] of Object.entries(limits)) nonNegative(value, `Baseline limits.${key}`);
  return { ...baseline, limits };
}

function compareBaseline(baseline, report) {
  const current = baselineFor(report).metrics;
  const regressions = [];
  const changes = [];
  const worse = (label, before, after) => {
    changes.push({ metric: label, baseline: before, current: after, delta: after - before });
    if (after > before) regressions.push(`${label} increased from ${before} to ${after}`);
  };
  worse('broken links', baseline.metrics.graph.broken_links, current.graph.broken_links);
  worse('ambiguous links', baseline.metrics.graph.ambiguous_links, current.graph.ambiguous_links);
  worse('orphans', baseline.metrics.graph.orphans, current.graph.orphans);
  worse('stale current guides', baseline.metrics.freshness.stale_current_guides, current.freshness.stale_current_guides);
  for (const key of ['notes', 'sections', 'words', 'bytes']) {
    changes.push({ metric: key, baseline: baseline.metrics.scale[key], current: current.scale[key], delta: current.scale[key] - baseline.metrics.scale[key] });
  }
  if (baseline.limits.max_note_growth !== undefined && current.scale.notes - baseline.metrics.scale.notes > baseline.limits.max_note_growth) {
    regressions.push(`note growth exceeded ${baseline.limits.max_note_growth}: ${baseline.metrics.scale.notes} to ${current.scale.notes}`);
  }
  if (baseline.limits.max_word_growth_percent !== undefined) {
    const baseWords = baseline.metrics.scale.words;
    const growth = baseWords === 0 ? (current.scale.words === 0 ? 0 : Infinity) : ((current.scale.words - baseWords) / baseWords) * 100;
    if (growth > baseline.limits.max_word_growth_percent) regressions.push(`word growth ${growth.toFixed(2)}% exceeded ${baseline.limits.max_word_growth_percent}%`);
  }
  const previousEval = baseline.metrics.evaluation;
  const currentEval = current.evaluation;
  if (previousEval.status !== 'not-configured') {
    if (currentEval.status === 'not-configured') regressions.push('search evaluation became not-configured');
    else {
      for (const [key, label] of [['passed', 'evaluation passed'], ['top1_hits', 'evaluation top-1 hits'], ['top3_hits', 'evaluation top-3 hits'], ['mean_reciprocal_rank', 'evaluation MRR']]) {
        if (currentEval[key] < previousEval[key]) regressions.push(`${label} decreased from ${previousEval[key]} to ${currentEval[key]}`);
      }
    }
  }
  return { passed: regressions.length === 0, regressions, changes };
}

function writeBaseline(file, baseline, replace) {
  if (fs.existsSync(file) && !replace) throw new Error(`Baseline already exists: ${file}. Use --replace-baseline to replace it explicitly.`);
  const temporary = `${file}.tmp-${process.pid}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o644);
    fs.writeFileSync(descriptor, `${JSON.stringify(baseline, null, 2)}\n`);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function boundedInteger(value, fallback, name, maximum) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw new Error(`--${name} must be an integer from 1 to ${maximum}`);
  }
  return number;
}

function increment(object, key) {
  object[key || 'untyped'] = (object[key || 'untyped'] || 0) + 1;
}

function dateString(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function collectStats(graph, options = {}) {
  const top = options.top || DEFAULT_TOP;
  const staleDays = options.staleDays || DEFAULT_STALE_DAYS;
  const now = options.now || new Date();
  const notes = graph.notes.filter((note) => note.frontmatter?.type !== 'template');
  const byType = {};
  const byStatus = {};
  const inbound = new Map(notes.map((note) => [note.rel, 0]));
  let brokenLinks = 0;
  let ambiguousLinks = 0;
  let links = 0;
  const noteRows = [];
  const sectionRows = [];

  for (const note of notes) {
    increment(byType, String(note.frontmatter?.type || 'untyped'));
    increment(byStatus, String(note.frontmatter?.status || 'untyped'));
    const sections = splitSections(note);
    const words = tokenize(note.body).length;
    const bytes = Buffer.byteLength(note.text, 'utf8');
    noteRows.push({ path: note.rel, words, bytes, sections: sections.length });
    for (const section of sections) {
      sectionRows.push({ path: note.rel, heading: section.heading, words: tokenize(section.text).length });
    }
    for (const target of extractWikilinkTargets(note.text)) {
      links += 1;
      const resolution = resolveTargetDetailed(target, graph.index);
      if (resolution.status === 'missing') brokenLinks += 1;
      else if (resolution.status === 'ambiguous') ambiguousLinks += 1;
      else if (resolution.rel !== note.rel && inbound.has(resolution.rel)) {
        inbound.set(resolution.rel, inbound.get(resolution.rel) + 1);
      }
    }
  }

  const evidenceNotes = notes.filter((note) => ['evidence', 'audit', 'known-good'].includes(note.frontmatter?.type));
  const staleBefore = new Date(now.getTime() - staleDays * 86400000).toISOString().slice(0, 10);
  const staleGuides = notes.filter((note) => {
    const fm = note.frontmatter || {};
    if (!['process', 'runbook'].includes(fm.type) || fm.status !== 'current') return false;
    const checked = dateString(fm.last_verified) || dateString(fm.date);
    return !checked || checked < staleBefore;
  }).map((note) => note.rel).sort();
  const orphanPaths = notes.filter((note) => {
    const type = note.frontmatter?.type;
    return !isDaily(note.rel) && !['index', 'app'].includes(type) && inbound.get(note.rel) === 0;
  }).map((note) => note.rel).sort();

  noteRows.sort((a, b) => b.words - a.words || a.path.localeCompare(b.path));
  sectionRows.sort((a, b) => b.words - a.words || a.path.localeCompare(b.path));
  return {
    generatedAt: now.toISOString(),
    scale: {
      notes: notes.length,
      templates: graph.notes.length - notes.length,
      sections: sectionRows.length,
      words: noteRows.reduce((sum, row) => sum + row.words, 0),
      bytes: noteRows.reduce((sum, row) => sum + row.bytes, 0),
      byType,
      byStatus
    },
    graph: { links, brokenLinks, ambiguousLinks, orphans: orphanPaths.length, orphanPaths },
    evidence: {
      total: evidenceNotes.length,
      verified: evidenceNotes.filter((note) => note.frontmatter?.status === 'verified').length,
      unverified: evidenceNotes.filter((note) => note.frontmatter?.status !== 'verified').length
    },
    freshness: { staleDays, staleBefore, staleCurrentGuides: staleGuides.length, paths: staleGuides },
    largest: { notes: noteRows.slice(0, top), sections: sectionRows.slice(0, top) }
  };
}

function evaluationStats(repoRoot, graph, input, explicit, clock = performance) {
  const candidate = path.resolve(repoRoot, input);
  if (!explicit && !fs.existsSync(candidate)) return { status: 'not-configured', file: input };
  const file = safeEvalPath(repoRoot, input);
  const contract = loadContract(file);
  const start = clock.now();
  const report = evaluateContract(contract, graph);
  const elapsedMs = Number((clock.now() - start).toFixed(3));
  return {
    status: report.passed ? 'passing' : 'failing',
    file: path.relative(repoRoot, file).split(path.sep).join('/'),
    queries: report.summary.queryCount,
    passed: report.summary.passed,
    top1Hits: report.summary.top1Hits,
    top3Hits: report.summary.top3Hits,
    meanReciprocalRank: report.summary.meanReciprocalRank,
    elapsedMs,
    averageQueryMs: Number((elapsedMs / report.summary.queryCount).toFixed(3))
  };
}

function render(report) {
  const s = report.scale;
  const lines = [
    `Project notes: ${s.notes} notes · ${s.sections} sections · ${s.words} words · ${s.bytes} bytes (${s.templates} templates excluded)`,
    `Graph: ${report.graph.links} links · ${report.graph.brokenLinks} broken · ${report.graph.ambiguousLinks} ambiguous · ${report.graph.orphans} orphans`,
    `Evidence: ${report.evidence.verified}/${report.evidence.total} verified · ${report.evidence.unverified} unverified`,
    `Freshness: ${report.freshness.staleCurrentGuides} current process/runbook notes older than ${report.freshness.staleDays} days`,
    report.evaluation.status === 'not-configured'
      ? `Search evaluation: not configured (${report.evaluation.file})`
      : `Search evaluation: ${report.evaluation.status} · ${report.evaluation.passed}/${report.evaluation.queries} passed · MRR ${report.evaluation.meanReciprocalRank.toFixed(3)} · ${report.evaluation.elapsedMs.toFixed(3)} ms`
  ];
  lines.push('', 'Largest notes:');
  for (const item of report.largest.notes) lines.push(`  ${item.words} words · ${item.path}`);
  if (report.baselineComparison) {
    lines.push('', `Baseline: ${report.baselineComparison.passed ? 'PASS' : 'FAIL'}`);
    for (const regression of report.baselineComparison.regressions) lines.push(`  REGRESSION ${regression}`);
  }
  if (report.changedSince) {
    lines.push('', `Changed since ${report.changedSince.ref}: ${report.changedSince.changed} tracked Markdown notes (${report.changedSince.existing} existing, ${report.changedSince.deleted} deleted)`);
  }
  return `${lines.join('\n')}\n`;
}

function run(argv = process.argv.slice(2), options = {}) {
  const args = parseArgs(argv);
  if (args.help) return { output: help(), report: null };
  if (args.baseline && args['write-baseline']) throw new Error('--baseline and --write-baseline are mutually exclusive');
  if (args['replace-baseline'] && !args['write-baseline']) throw new Error('--replace-baseline requires --write-baseline');
  const top = boundedInteger(args.top, DEFAULT_TOP, 'top', 100);
  const staleDays = boundedInteger(args['stale-days'], DEFAULT_STALE_DAYS, 'stale-days', 3650);
  const env = options.env || process.env;
  const repoRoot = getRepoRoot(env);
  const vaultRoot = options.vaultRoot || getVaultRoot({ env });
  const graph = loadVaultGraph({ env, vaultRoot });
  const report = collectStats(graph, { top, staleDays, now: options.now });
  report.evaluation = evaluationStats(
    repoRoot,
    graph,
    args['eval-file'] || DEFAULT_EVAL_FILE,
    Object.hasOwn(args, 'eval-file'),
    options.clock
  );
  if (args.baseline) {
    const file = safeRepoFile(repoRoot, args.baseline, { mustExist: true });
    report.baselineComparison = { file: path.relative(repoRoot, file).split(path.sep).join('/'), ...compareBaseline(loadBaseline(file), report) };
  }
  if (args['write-baseline']) {
    const file = safeRepoFile(repoRoot, args['write-baseline']);
    writeBaseline(file, baselineFor(report), Boolean(args['replace-baseline']));
    report.baselineWritten = path.relative(repoRoot, file).split(path.sep).join('/');
  }
  if (args['changed-since']) report.changedSince = changedSinceStats(repoRoot, vaultRoot, graph, args['changed-since'], options.runner);
  return {
    output: args.json ? `${JSON.stringify(report, null, 2)}\n` : render(report),
    report,
    exitCode: report.baselineComparison?.passed === false ? 1 : 0
  };
}

if (require.main === module) {
  try {
    const result = run();
    process.stdout.write(result.output);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { parseArgs, safeRepoFile, changedSinceStats, collectStats, evaluationStats, baselineFor, loadBaseline, compareBaseline, writeBaseline, render, run };
