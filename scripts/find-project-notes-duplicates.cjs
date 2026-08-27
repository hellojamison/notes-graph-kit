#!/usr/bin/env node

const { getVaultRoot, loadVaultGraph, isDaily, markdownLinesOutsideFences } = require('./lib/project-notes-graph.cjs');
const { tokenize } = require('./search-project-notes.cjs');

const DEFAULT_THRESHOLD = 0.85;
const DEFAULT_MIN_WORDS = 100;
const DEFAULT_LIMIT = 50;
const SHINGLE_SIZE = 5;
const MAX_NOTES = 5000;

function help() {
  return `Find informational near-duplicate project notes using deterministic word shingles

Usage:
  node scripts/find-project-notes-duplicates.cjs [--threshold 0.85] [--min-words 100] [--limit 50] [--include-daily] [--json]

Options:
  --threshold VALUE  Minimum Jaccard similarity (0.50-1.00; default: 0.85)
  --min-words COUNT  Ignore shorter notes (20-10000; default: 100)
  --limit COUNT      Maximum candidate pairs (1-500; default: 50)
  --include-daily    Include daily notes, which are excluded by default
  --json             Emit machine-readable JSON
`;
}

function parseArgs(argv) {
  const parsed = {};
  const values = new Set(['threshold', 'min-words', 'limit']);
  const booleans = new Set(['include-daily', 'json', 'help']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected positional argument: ${arg}`);
    const equals = arg.indexOf('=');
    const key = arg.slice(2, equals < 0 ? undefined : equals);
    if (!values.has(key) && !booleans.has(key)) throw new Error(`Unknown option: --${key}`);
    if (Object.hasOwn(parsed, key)) throw new Error(`Duplicate option: --${key}`);
    if (booleans.has(key)) {
      if (equals >= 0) throw new Error(`--${key} does not take a value`);
      parsed[key] = true;
      continue;
    }
    const value = equals < 0 ? argv[++index] : arg.slice(equals + 1);
    if (!value || value.startsWith('--')) throw new Error(`--${key} requires a value`);
    parsed[key] = value;
  }
  return parsed;
}

function numberOption(value, fallback, name, minimum, maximum, integer = false) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum || (integer && !Number.isSafeInteger(number))) {
    throw new Error(`--${name} must be ${integer ? 'an integer' : 'a number'} from ${minimum} to ${maximum}`);
  }
  return number;
}

function noteTokens(note) {
  return tokenize(markdownLinesOutsideFences(note.body).map(({ line }) => line).join(' '));
}

function shingles(tokens, size = SHINGLE_SIZE) {
  const result = new Set();
  for (let index = 0; index <= tokens.length - size; index += 1) result.add(tokens.slice(index, index + size).join('\u0001'));
  return result;
}

function similarity(left, right) {
  if (left.size === 0 || right.size === 0) return 0;
  const smaller = left.size <= right.size ? left : right;
  const larger = smaller === left ? right : left;
  let intersection = 0;
  for (const value of smaller) if (larger.has(value)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function findDuplicates(graph, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const minWords = options.minWords ?? DEFAULT_MIN_WORDS;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const candidates = graph.notes.filter((note) =>
    note.frontmatter?.type !== 'template' && (options.includeDaily || !isDaily(note.rel))
  ).map((note) => {
    const tokens = noteTokens(note);
    return { note, tokens, shingles: shingles(tokens) };
  }).filter((item) => item.tokens.length >= minWords && item.shingles.size > 0);
  if (candidates.length > MAX_NOTES) throw new Error(`Duplicate scan supports at most ${MAX_NOTES} eligible notes; narrow the vault or raise --min-words`);
  const pairs = [];
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      if (Math.min(left.shingles.size, right.shingles.size) / Math.max(left.shingles.size, right.shingles.size) < threshold) continue;
      const score = similarity(left.shingles, right.shingles);
      if (score >= threshold) pairs.push({
        left: left.note.rel,
        right: right.note.rel,
        similarity: Number(score.toFixed(6)),
        leftWords: left.tokens.length,
        rightWords: right.tokens.length
      });
    }
  }
  pairs.sort((a, b) => b.similarity - a.similarity || a.left.localeCompare(b.left) || a.right.localeCompare(b.right));
  return {
    threshold,
    minWords,
    includeDaily: Boolean(options.includeDaily),
    eligibleNotes: candidates.length,
    pairCount: pairs.length,
    truncated: pairs.length > limit,
    pairs: pairs.slice(0, limit)
  };
}

function render(report) {
  const lines = [`Near-duplicate notes: ${report.pairCount} candidate pair(s) among ${report.eligibleNotes} eligible notes (threshold ${report.threshold.toFixed(2)})`];
  for (const pair of report.pairs) lines.push(`${(pair.similarity * 100).toFixed(1)}% · ${pair.left} ↔ ${pair.right}`);
  if (report.truncated) lines.push(`Showing the first ${report.pairs.length} pairs; raise --limit to see more.`);
  return `${lines.join('\n')}\n`;
}

function run(argv = process.argv.slice(2), options = {}) {
  const args = parseArgs(argv);
  if (args.help) return { output: help(), report: null };
  const threshold = numberOption(args.threshold, DEFAULT_THRESHOLD, 'threshold', 0.5, 1);
  const minWords = numberOption(args['min-words'], DEFAULT_MIN_WORDS, 'min-words', 20, 10000, true);
  const limit = numberOption(args.limit, DEFAULT_LIMIT, 'limit', 1, 500, true);
  const env = options.env || process.env;
  const graph = loadVaultGraph({ env, vaultRoot: options.vaultRoot || getVaultRoot({ env }) });
  const report = findDuplicates(graph, { threshold, minWords, limit, includeDaily: args['include-daily'] });
  return { output: args.json ? `${JSON.stringify(report, null, 2)}\n` : render(report), report };
}

if (require.main === module) {
  try { process.stdout.write(run().output); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}

module.exports = { parseArgs, noteTokens, shingles, similarity, findDuplicates, render, run };
