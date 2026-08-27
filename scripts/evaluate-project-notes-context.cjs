#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { getRepoRoot, getVaultRoot, loadVaultGraph } = require('./lib/project-notes-graph.cjs');
const { buildContext } = require('./build-project-notes-context.cjs');

const DEFAULT_FILE = 'notes-context-eval.yml';
class EvaluationInputError extends Error {}

function help() {
  return `Evaluate project-notes context packets against checked-in expectations

Usage:
  node scripts/evaluate-project-notes-context.cjs [--file notes-context-eval.yml] [--json]

Options:
  --file PATH  YAML evaluation contract relative to the repo root
  --json       Emit machine-readable JSON
`;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new EvaluationInputError(`Unexpected positional argument: ${arg}`);
    const equals = arg.indexOf('=');
    const key = arg.slice(2, equals < 0 ? undefined : equals);
    if (!['file', 'json', 'help'].includes(key)) throw new EvaluationInputError(`Unknown option: --${key}`);
    if (Object.hasOwn(result, key)) throw new EvaluationInputError(`Duplicate option: --${key}`);
    if (key === 'json' || key === 'help') {
      if (equals >= 0) throw new EvaluationInputError(`--${key} does not take a value`);
      result[key] = true;
      continue;
    }
    const value = equals < 0 ? argv[++index] : arg.slice(equals + 1);
    if (!value || value.startsWith('--')) throw new EvaluationInputError(`--${key} requires a value`);
    result[key] = value;
  }
  return result;
}

function rejectUnknown(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new EvaluationInputError(`${label} has unknown field(s): ${unknown.sort().join(', ')}`);
}

function regularContractPath(repoRoot, input) {
  const canonicalRepo = fs.realpathSync(repoRoot);
  const resolved = path.resolve(canonicalRepo, input);
  const relative = path.relative(canonicalRepo, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new EvaluationInputError(`Evaluation file must be inside the repo: ${input}`);
  }
  if (!fs.existsSync(resolved)) throw new EvaluationInputError(`Evaluation file does not exist: ${resolved}`);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new EvaluationInputError(`Evaluation file must be a regular file: ${resolved}`);
  const canonical = fs.realpathSync(resolved);
  const canonicalRelative = path.relative(canonicalRepo, canonical);
  if (canonicalRelative === '..' || canonicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(canonicalRelative)) {
    throw new EvaluationInputError(`Evaluation file must stay inside the repo: ${input}`);
  }
  return canonical;
}

function integer(value, label, minimum, maximum, fallback) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new EvaluationInputError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return number;
}

function stringArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new EvaluationInputError(`${label} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function source(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EvaluationInputError(`${label} must be a mapping`);
  rejectUnknown(value, new Set(['path', 'heading', 'kind']), label);
  if (typeof value.path !== 'string' || !value.path.trim().endsWith('.md') || value.path.includes('\\')) {
    throw new EvaluationInputError(`${label}.path must be a vault-relative Markdown path`);
  }
  const normalized = path.posix.normalize(value.path.trim());
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new EvaluationInputError(`${label}.path must stay inside the vault`);
  }
  if (value.heading !== undefined && (typeof value.heading !== 'string' || !value.heading.trim())) throw new EvaluationInputError(`${label}.heading must be a non-empty string`);
  if (value.kind !== undefined && !['match', 'related'].includes(value.kind)) throw new EvaluationInputError(`${label}.kind must be match or related`);
  return { path: normalized, ...(value.heading ? { heading: value.heading.trim() } : {}), ...(value.kind ? { kind: value.kind } : {}) };
}

function sourceArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new EvaluationInputError(`${label} must be an array`);
  return value.map((item, index) => source(item, `${label}[${index}]`));
}

function loadContract(filePath) {
  let parsed;
  try { parsed = yaml.load(fs.readFileSync(filePath, 'utf8'), { schema: yaml.JSON_SCHEMA }); }
  catch (error) { throw new EvaluationInputError(`Invalid evaluation YAML: ${error.message}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new EvaluationInputError('Evaluation contract must be a YAML mapping');
  rejectUnknown(parsed, new Set(['schema_version', 'cases']), 'Evaluation contract');
  if (parsed.schema_version !== 1) throw new EvaluationInputError('Evaluation contract schema_version must be 1');
  if (!Array.isArray(parsed.cases) || !parsed.cases.length) throw new EvaluationInputError('Evaluation contract cases must be a non-empty array');
  const ids = new Set();
  return { schemaVersion: 1, cases: parsed.cases.map((entry, index) => {
    const label = `cases[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new EvaluationInputError(`${label} must be a mapping`);
    rejectUnknown(entry, new Set(['id', 'query', 'results', 'max_words', 'filters', 'required', 'ordered', 'forbidden']), label);
    if (typeof entry.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(entry.id)) throw new EvaluationInputError(`${label}.id must use lowercase letters, digits, and hyphens`);
    if (ids.has(entry.id)) throw new EvaluationInputError(`Duplicate case id: ${entry.id}`);
    ids.add(entry.id);
    if (typeof entry.query !== 'string' || !entry.query.trim()) throw new EvaluationInputError(`${label}.query must be a non-empty string`);
    const filters = entry.filters || {};
    if (!filters || typeof filters !== 'object' || Array.isArray(filters)) throw new EvaluationInputError(`${label}.filters must be a mapping`);
    rejectUnknown(filters, new Set(['type', 'status', 'since']), `${label}.filters`);
    if (filters.since !== undefined && (typeof filters.since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(filters.since))) throw new EvaluationInputError(`${label}.filters.since must be YYYY-MM-DD`);
    const required = sourceArray(entry.required, `${label}.required`);
    const ordered = sourceArray(entry.ordered, `${label}.ordered`);
    const forbidden = sourceArray(entry.forbidden, `${label}.forbidden`);
    if (!required.length && !ordered.length && !forbidden.length) throw new EvaluationInputError(`${label} must define required, ordered, or forbidden sources`);
    return {
      id: entry.id, query: entry.query.trim(),
      results: integer(entry.results, `${label}.results`, 1, 20, 5),
      maxWords: integer(entry.max_words, `${label}.max_words`, 100, 20000, 3000),
      filters: { type: stringArray(filters.type, `${label}.filters.type`), status: stringArray(filters.status, `${label}.filters.status`), since: filters.since },
      required, ordered, forbidden
    };
  }) };
}

function matches(item, expected) {
  return item.path === expected.path && (expected.heading === undefined || item.heading === expected.heading) && (expected.kind === undefined || item.kind === expected.kind);
}

function evaluateContract(contract, graph) {
  const cases = contract.cases.map((entry) => {
    const context = buildContext(entry.query, graph, { results: entry.results, maxWords: entry.maxWords, filters: entry.filters });
    const required = entry.required.map((expected) => ({ ...expected, found: context.items.some((item) => matches(item, expected)) }));
    const forbidden = entry.forbidden.map((expected) => ({ ...expected, absent: !context.items.some((item) => matches(item, expected)) }));
    const orderedIndexes = entry.ordered.map((expected) => context.items.findIndex((item) => matches(item, expected)));
    const ordered = entry.ordered.map((expected, index) => ({ ...expected, index: orderedIndexes[index] < 0 ? null : orderedIndexes[index] + 1 }));
    const orderPassed = orderedIndexes.every((value) => value >= 0) && orderedIndexes.every((value, index) => index === 0 || orderedIndexes[index - 1] < value);
    const invariants = {
      budget_respected: context.budget.usedSourceWords <= entry.maxWords && context.budget.remainingSourceWords >= 0,
      word_counts_consistent: context.items.reduce((sum, item) => sum + item.words, 0) === context.budget.usedSourceWords,
      sources_attributed: context.items.every((item) => item.path && item.heading && Number.isSafeInteger(item.line) && item.line > 0 && ['match', 'related'].includes(item.kind))
    };
    const passed = required.every((item) => item.found) && forbidden.every((item) => item.absent) && orderPassed && Object.values(invariants).every(Boolean);
    return { id: entry.id, query: entry.query, passed, required, ordered, forbidden, invariants, budget: context.budget, actual: context.items.map(({ kind, path: itemPath, heading }) => ({ kind, path: itemPath, heading })) };
  });
  const passed = cases.filter((item) => item.passed).length;
  return { passed: passed === cases.length, summary: { caseCount: cases.length, passed, failed: cases.length - passed }, cases };
}

function render(report) {
  const lines = [`Context evaluation: ${report.summary.passed}/${report.summary.caseCount} cases passed`];
  for (const item of report.cases) {
    lines.push('', `${item.passed ? 'PASS' : 'FAIL'} ${item.id}: ${JSON.stringify(item.query)}`);
    for (const required of item.required) lines.push(`  required ${required.path}${required.heading ? `#${required.heading}` : ''}: ${required.found ? 'found' : 'missing'}`);
    for (const ordered of item.ordered) lines.push(`  ordered ${ordered.path}${ordered.heading ? `#${ordered.heading}` : ''}: ${ordered.index === null ? 'missing' : `position ${ordered.index}`}`);
    for (const forbidden of item.forbidden) lines.push(`  forbidden ${forbidden.path}${forbidden.heading ? `#${forbidden.heading}` : ''}: ${forbidden.absent ? 'absent' : 'present'}`);
    for (const [name, passed] of Object.entries(item.invariants)) lines.push(`  ${name}: ${passed ? 'pass' : 'fail'}`);
  }
  return `${lines.join('\n')}\n`;
}

function run(argv = process.argv.slice(2), options = {}) {
  const args = parseArgs(argv);
  if (args.help) return { output: help(), exitCode: 0, report: null };
  const env = options.env || process.env;
  const contract = loadContract(regularContractPath(getRepoRoot(env), args.file || DEFAULT_FILE));
  const graph = loadVaultGraph({ env, vaultRoot: options.vaultRoot || getVaultRoot({ env }) });
  const report = evaluateContract(contract, graph);
  return { output: args.json ? `${JSON.stringify(report, null, 2)}\n` : render(report), exitCode: report.passed ? 0 : 1, report };
}

if (require.main === module) {
  try { const result = run(); process.stdout.write(result.output); process.exitCode = result.exitCode; }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = error instanceof EvaluationInputError ? 2 : 1; }
}

module.exports = { EvaluationInputError, parseArgs, regularContractPath, loadContract, matches, evaluateContract, render, run };
