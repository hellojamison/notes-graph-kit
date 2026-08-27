#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { getRepoRoot, getVaultRoot, loadVaultGraph } = require('./lib/project-notes-graph.cjs');
const { matchesFilters, searchNotes } = require('./search-project-notes.cjs');

const DEFAULT_FILE = 'notes-search-eval.yml';
const DEFAULT_TOP_K = 3;
const RESULT_LIMIT = 100;

class EvaluationInputError extends Error {}

function printHelp() {
  return `Evaluate ranked project-notes search against checked-in expectations

Usage:
  node scripts/evaluate-project-notes-search.cjs [--file notes-search-eval.yml] [--top-k 3] [--json]

Options:
  --file PATH    YAML evaluation contract relative to the repo root
  --top-k COUNT  A query passes when any expected result ranks within this depth (1-100)
  --json         Emit machine-readable JSON
`;
}

function parseArgs(argv) {
  const parsed = {};
  const valueFlags = new Set(['file', 'top-k']);
  const booleanFlags = new Set(['json', 'help']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      throw new EvaluationInputError(`Unexpected positional argument: ${arg}`);
    }
    const equalsIndex = arg.indexOf('=');
    const key = arg.slice(2, equalsIndex === -1 ? undefined : equalsIndex);
    if (!valueFlags.has(key) && !booleanFlags.has(key)) {
      throw new EvaluationInputError(`Unknown option: --${key}`);
    }
    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
      throw new EvaluationInputError(`Duplicate option: --${key}`);
    }
    if (booleanFlags.has(key)) {
      if (equalsIndex !== -1) {
        throw new EvaluationInputError(`--${key} does not take a value`);
      }
      parsed[key] = true;
      continue;
    }
    const value = equalsIndex === -1 ? argv[index + 1] : arg.slice(equalsIndex + 1);
    if (!value || (equalsIndex === -1 && value.startsWith('--'))) {
      throw new EvaluationInputError(`--${key} requires a value`);
    }
    parsed[key] = value;
    if (equalsIndex === -1) index += 1;
  }
  return parsed;
}

function topKValue(value, fallback = DEFAULT_TOP_K) {
  const topK = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(topK) || topK < 1 || topK > 100) {
    throw new EvaluationInputError('--top-k must be an integer from 1 to 100');
  }
  return topK;
}

function safeEvalPath(repoRoot, input = DEFAULT_FILE) {
  const canonicalRepo = fs.realpathSync(repoRoot);
  const resolved = path.resolve(canonicalRepo, input);
  const relative = path.relative(canonicalRepo, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new EvaluationInputError(`Evaluation file must be inside the repo: ${input}`);
  }
  if (!fs.existsSync(resolved)) {
    throw new EvaluationInputError(`Evaluation file does not exist: ${resolved}`);
  }
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new EvaluationInputError(`Evaluation file must be a regular file: ${resolved}`);
  }
  const canonicalFile = fs.realpathSync(resolved);
  const canonicalRelative = path.relative(canonicalRepo, canonicalFile);
  if (
    canonicalRelative === '..'
    || canonicalRelative.startsWith(`..${path.sep}`)
    || path.isAbsolute(canonicalRelative)
  ) {
    throw new EvaluationInputError(`Evaluation file must stay inside the repo: ${input}`);
  }
  return canonicalFile;
}

function rejectUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new EvaluationInputError(`${label} has unknown field(s): ${unknown.sort().join(', ')}`);
  }
}

function stringArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new EvaluationInputError(`${label} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function validateExpected(entry, label) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new EvaluationInputError(`${label} must be a mapping`);
  }
  rejectUnknownKeys(entry, new Set(['path', 'heading']), label);
  if (
    typeof entry.path !== 'string'
    || !entry.path.trim()
    || !entry.path.endsWith('.md')
    || entry.path.includes('\\')
  ) {
    throw new EvaluationInputError(`${label}.path must be a vault-relative Markdown path`);
  }
  const normalized = path.posix.normalize(entry.path.trim());
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new EvaluationInputError(`${label}.path must stay inside the vault`);
  }
  if (entry.heading !== undefined && (typeof entry.heading !== 'string' || !entry.heading.trim())) {
    throw new EvaluationInputError(`${label}.heading must be a non-empty string when present`);
  }
  return { path: normalized, ...(entry.heading === undefined ? {} : { heading: entry.heading.trim() }) };
}

function loadContract(filePath) {
  let parsed;
  try {
    parsed = yaml.load(fs.readFileSync(filePath, 'utf8'), { schema: yaml.JSON_SCHEMA });
  } catch (error) {
    throw new EvaluationInputError(`Invalid evaluation YAML: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new EvaluationInputError('Evaluation contract must be a YAML mapping');
  }
  rejectUnknownKeys(parsed, new Set(['schema_version', 'top_k', 'queries']), 'Evaluation contract');
  if (parsed.schema_version !== 1) {
    throw new EvaluationInputError('Evaluation contract schema_version must be 1');
  }
  if (!Array.isArray(parsed.queries) || parsed.queries.length === 0) {
    throw new EvaluationInputError('Evaluation contract queries must be a non-empty array');
  }
  const ids = new Set();
  const queries = parsed.queries.map((entry, index) => {
    const label = `queries[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new EvaluationInputError(`${label} must be a mapping`);
    }
    rejectUnknownKeys(entry, new Set(['id', 'query', 'filters', 'expected']), label);
    if (typeof entry.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(entry.id)) {
      throw new EvaluationInputError(`${label}.id must use lowercase letters, digits, and hyphens`);
    }
    if (ids.has(entry.id)) throw new EvaluationInputError(`Duplicate query id: ${entry.id}`);
    ids.add(entry.id);
    if (typeof entry.query !== 'string' || !entry.query.trim()) {
      throw new EvaluationInputError(`${label}.query must be a non-empty string`);
    }
    if (!Array.isArray(entry.expected) || entry.expected.length === 0) {
      throw new EvaluationInputError(`${label}.expected must be a non-empty array`);
    }
    const filters = entry.filters === undefined ? {} : entry.filters;
    if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
      throw new EvaluationInputError(`${label}.filters must be a mapping`);
    }
    rejectUnknownKeys(
      filters,
      new Set(['type', 'status', 'since', 'include_templates']),
      `${label}.filters`
    );
    const since = filters.since;
    if (since !== undefined && (typeof since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(since))) {
      throw new EvaluationInputError(`${label}.filters.since must be YYYY-MM-DD`);
    }
    if (filters.include_templates !== undefined && typeof filters.include_templates !== 'boolean') {
      throw new EvaluationInputError(`${label}.filters.include_templates must be boolean`);
    }
    return {
      id: entry.id,
      query: entry.query.trim(),
      filters: {
        type: stringArray(filters.type, `${label}.filters.type`),
        status: stringArray(filters.status, `${label}.filters.status`),
        since,
        'include-templates': Boolean(filters.include_templates)
      },
      expected: entry.expected.map((expected, expectedIndex) =>
        validateExpected(expected, `${label}.expected[${expectedIndex}]`)
      )
    };
  });
  return { schemaVersion: 1, topK: topKValue(parsed.top_k), queries };
}

function expectedMatches(result, expected) {
  return result.path === expected.path
    && (expected.heading === undefined || result.heading === expected.heading);
}

function evaluateContract(contract, graph, options = {}) {
  const topK = topKValue(options.topK, contract.topK);
  const evaluations = contract.queries.map((queryCase) => {
    const notes = graph.notes.filter((note) => matchesFilters(note, queryCase.filters));
    const results = searchNotes(queryCase.query, notes, { limit: RESULT_LIMIT });
    const expected = queryCase.expected.map((target) => {
      const index = results.findIndex((result) => expectedMatches(result, target));
      return { ...target, rank: index === -1 ? null : index + 1 };
    });
    const ranks = expected.map((target) => target.rank).filter((rank) => rank !== null);
    const firstRelevantRank = ranks.length === 0 ? null : Math.min(...ranks);
    return {
      id: queryCase.id,
      query: queryCase.query,
      passed: firstRelevantRank !== null && firstRelevantRank <= topK,
      firstRelevantRank,
      reciprocalRank: firstRelevantRank === null ? 0 : Number((1 / firstRelevantRank).toFixed(6)),
      expected,
      topResults: results.slice(0, topK).map(({ path: resultPath, heading, score }) => ({
        path: resultPath,
        heading,
        score
      }))
    };
  });
  const queryCount = evaluations.length;
  const passed = evaluations.filter((item) => item.passed).length;
  const top1Hits = evaluations.filter((item) => item.firstRelevantRank === 1).length;
  const top3Hits = evaluations.filter(
    (item) => item.firstRelevantRank !== null && item.firstRelevantRank <= 3
  ).length;
  const meanReciprocalRank = evaluations.reduce((sum, item) => sum + item.reciprocalRank, 0) / queryCount;
  return {
    passed: passed === queryCount,
    topK,
    summary: {
      queryCount,
      passed,
      failed: queryCount - passed,
      top1Hits,
      top3Hits,
      meanReciprocalRank: Number(meanReciprocalRank.toFixed(6))
    },
    queries: evaluations
  };
}

function renderText(report) {
  const lines = [
    `Search evaluation: ${report.summary.passed}/${report.summary.queryCount} queries passed at top ${report.topK}`,
    `Top-1: ${report.summary.top1Hits}/${report.summary.queryCount} · Top-3: ${report.summary.top3Hits}/${report.summary.queryCount} · MRR: ${report.summary.meanReciprocalRank.toFixed(3)}`
  ];
  for (const item of report.queries) {
    lines.push('');
    lines.push(`${item.passed ? 'PASS' : 'FAIL'} ${item.id}: ${JSON.stringify(item.query)}`);
    lines.push(`  first relevant rank: ${item.firstRelevantRank ?? 'not found'}`);
    for (const target of item.expected) {
      lines.push(`  expected ${target.path}${target.heading ? `#${target.heading}` : ''}: ${target.rank === null ? 'not found' : `rank ${target.rank}`}`);
    }
    if (!item.passed) {
      for (const [index, result] of item.topResults.entries()) {
        lines.push(`  actual ${index + 1}: ${result.path}#${result.heading}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

function run(argv = process.argv.slice(2), options = {}) {
  const args = parseArgs(argv);
  if (args.help) return { output: printHelp(), exitCode: 0, report: null };
  const env = options.env || process.env;
  const repoRoot = getRepoRoot(env);
  const filePath = safeEvalPath(repoRoot, args.file || DEFAULT_FILE);
  const contract = loadContract(filePath);
  const graph = loadVaultGraph({ env, vaultRoot: options.vaultRoot || getVaultRoot({ env }) });
  const report = evaluateContract(contract, graph, {
    topK: args['top-k'] === undefined ? undefined : topKValue(args['top-k'])
  });
  return {
    output: args.json ? `${JSON.stringify(report, null, 2)}\n` : renderText(report),
    exitCode: report.passed ? 0 : 1,
    report
  };
}

if (require.main === module) {
  try {
    const result = run();
    process.stdout.write(result.output);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error instanceof EvaluationInputError ? 2 : 1;
  }
}

module.exports = {
  EvaluationInputError,
  parseArgs,
  safeEvalPath,
  loadContract,
  evaluateContract,
  expectedMatches,
  renderText,
  run
};
