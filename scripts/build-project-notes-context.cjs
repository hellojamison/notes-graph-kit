#!/usr/bin/env node

const {
  getVaultRoot,
  loadVaultGraph,
  extractWikilinkTargets,
  resolveTargetDetailed
} = require('./lib/project-notes-graph.cjs');
const { splitSections, matchesFilters, searchNotes } = require('./search-project-notes.cjs');

const DEFAULT_RESULTS = 5;
const DEFAULT_MAX_WORDS = 3000;
const RELATED_TYPES = new Set(['status', 'decision', 'evidence', 'audit', 'known-good', 'process', 'runbook']);
const RELATED_TYPE_ORDER = ['status', 'decision', 'evidence', 'audit', 'known-good', 'process', 'runbook'];

function help() {
  return `Build a deterministic, source-attributed project-notes context packet

Usage:
  node scripts/build-project-notes-context.cjs "query terms" [--results 5] [--max-words 3000] [--type evidence] [--status verified] [--since YYYY-MM-DD] [--json]

Options:
  --results COUNT    Ranked sections to seed the packet (1-20; default: 5)
  --max-words COUNT  Maximum source-content words (100-20000; default: 3000)
  --type TYPE        Filter seed notes by frontmatter type (repeatable)
  --status STATUS    Filter seed notes by frontmatter status (repeatable)
  --since DATE       Filter seed notes dated on or after YYYY-MM-DD
  --json             Emit machine-readable JSON
`;
}

function parseArgs(argv) {
  const result = { _: [], type: [], status: [] };
  const repeatable = new Set(['type', 'status']);
  const values = new Set(['results', 'max-words', 'since']);
  const booleans = new Set(['json', 'help']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      result._.push(arg);
      continue;
    }
    const equals = arg.indexOf('=');
    const key = arg.slice(2, equals < 0 ? undefined : equals);
    if (!repeatable.has(key) && !values.has(key) && !booleans.has(key)) {
      throw new Error(`Unknown option: --${key}`);
    }
    if (booleans.has(key)) {
      if (equals >= 0) throw new Error(`--${key} does not take a value`);
      result[key] = true;
      continue;
    }
    const value = equals < 0 ? argv[++index] : arg.slice(equals + 1);
    if (!value || value.startsWith('--')) throw new Error(`--${key} requires a value`);
    if (repeatable.has(key)) result[key].push(value.trim());
    else {
      if (Object.hasOwn(result, key)) throw new Error(`Duplicate option: --${key}`);
      result[key] = value.trim();
    }
  }
  return result;
}

function integer(value, fallback, name, minimum, maximum) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

function words(text) {
  return String(text || '').trim().match(/\S+/g) || [];
}

function takeWords(text, limit) {
  const source = words(text);
  return {
    text: source.slice(0, limit).join(' '),
    words: Math.min(source.length, limit),
    truncated: source.length > limit
  };
}

function sectionForResult(note, result) {
  return splitSections(note).find((section) =>
    section.line === result.line && section.heading === result.heading
  );
}

function relatedSection(note, query) {
  const lexical = searchNotes(query, [note], { limit: 1 });
  if (lexical.length > 0) return sectionForResult(note, lexical[0]);
  const sections = splitSections(note);
  const preferred = /^(decision|result|verification|current status|summary|goal|context)$/i;
  return sections.find((section) => preferred.test(section.heading)) || sections[0] || null;
}

function relatedNotes(seedNotes, graph, query) {
  const seedPaths = new Set(seedNotes.map((note) => note.rel));
  const found = new Map();
  for (const seed of seedNotes) {
    for (const target of extractWikilinkTargets(seed.text)) {
      const resolution = resolveTargetDetailed(target, graph.index);
      if (resolution.status !== 'resolved' || seedPaths.has(resolution.rel)) continue;
      const note = graph.noteByRel.get(resolution.rel);
      if (!note || !RELATED_TYPES.has(note.frontmatter?.type) || note.frontmatter?.type === 'template') continue;
      if (!found.has(note.rel)) found.set(note.rel, { note, linkedFrom: new Set() });
      found.get(note.rel).linkedFrom.add(seed.rel);
    }
  }
  return [...found.values()].sort((left, right) =>
    RELATED_TYPE_ORDER.indexOf(left.note.frontmatter.type) - RELATED_TYPE_ORDER.indexOf(right.note.frontmatter.type)
    || left.note.rel.localeCompare(right.note.rel)
  ).map(({ note, linkedFrom }) => ({
    note,
    section: relatedSection(note, query),
    linkedFrom: [...linkedFrom].sort()
  })).filter((item) => item.section);
}

function buildContext(query, graph, options = {}) {
  const resultLimit = options.results || DEFAULT_RESULTS;
  const maxWords = options.maxWords || DEFAULT_MAX_WORDS;
  const filters = options.filters || { type: [], status: [] };
  const searchable = graph.notes.filter((note) => matchesFilters(note, {
    type: filters.type || [],
    status: filters.status || [],
    since: filters.since,
    'include-templates': false
  }));
  const ranked = searchNotes(query, searchable, { limit: resultLimit });
  const primary = ranked.map((result) => ({
    kind: 'match',
    note: graph.noteByRel.get(result.path),
    section: sectionForResult(graph.noteByRel.get(result.path), result),
    rank: ranked.indexOf(result) + 1,
    score: result.score,
    linkedFrom: []
  })).filter((item) => item.note && item.section);
  const seeds = [...new Map(primary.map((item) => [item.note.rel, item.note])).values()];
  const related = relatedNotes(seeds, graph, query).map((item) => ({ kind: 'related', ...item }));
  const candidates = [...primary, ...related];
  const included = [];
  const seen = new Set();
  let usedWords = 0;
  for (const candidate of candidates) {
    const key = `${candidate.note.rel}#${candidate.section.heading}`;
    if (seen.has(key) || usedWords >= maxWords) continue;
    seen.add(key);
    const remaining = maxWords - usedWords;
    const excerpt = takeWords(candidate.section.text, remaining);
    if (excerpt.words === 0) continue;
    usedWords += excerpt.words;
    included.push({
      kind: candidate.kind,
      path: candidate.note.rel,
      heading: candidate.section.heading,
      line: candidate.section.line,
      type: candidate.note.frontmatter?.type || null,
      status: candidate.note.frontmatter?.status || null,
      date: candidate.note.frontmatter?.date || null,
      ...(candidate.rank ? { rank: candidate.rank, score: candidate.score } : {}),
      ...(candidate.linkedFrom?.length ? { linkedFrom: candidate.linkedFrom } : {}),
      words: excerpt.words,
      truncated: excerpt.truncated,
      content: excerpt.text
    });
  }
  return {
    query,
    filters: { type: filters.type || [], status: filters.status || [], since: filters.since || null },
    budget: { maxSourceWords: maxWords, usedSourceWords: usedWords, remainingSourceWords: maxWords - usedWords },
    seedResults: ranked.length,
    sources: included.length,
    items: included
  };
}

function render(report) {
  const lines = [
    '# Project Notes Context',
    '',
    `Query: ${report.query}`,
    `Source-content budget: ${report.budget.usedSourceWords}/${report.budget.maxSourceWords} words`,
    `Sources: ${report.sources} (${report.seedResults} ranked seed sections)`,
    ''
  ];
  for (const item of report.items) {
    lines.push(`## ${item.path} — ${item.heading}`);
    lines.push('');
    const relation = item.kind === 'match'
      ? `rank ${item.rank} · score ${item.score.toFixed(3)}`
      : `one-hop link from ${item.linkedFrom.join(', ')}`;
    lines.push(`Source: ${item.path}:${item.line} · ${item.type || 'untyped'} · ${item.status || 'no-status'}${item.date ? ` · ${item.date}` : ''} · ${relation}`);
    lines.push('');
    lines.push(`${item.content}${item.truncated ? ' … [truncated by word budget]' : ''}`, '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function run(argv = process.argv.slice(2), options = {}) {
  const args = parseArgs(argv);
  if (args.help) return { output: help(), report: null };
  const query = args._.join(' ').trim();
  if (!query) throw new Error('Context query is required');
  if (args.since && !/^\d{4}-\d{2}-\d{2}$/.test(args.since)) throw new Error('--since must be YYYY-MM-DD');
  const results = integer(args.results, DEFAULT_RESULTS, 'results', 1, 20);
  const maxWords = integer(args['max-words'], DEFAULT_MAX_WORDS, 'max-words', 100, 20000);
  const env = options.env || process.env;
  const graph = loadVaultGraph({ env, vaultRoot: options.vaultRoot || getVaultRoot({ env }) });
  const report = buildContext(query, graph, {
    results,
    maxWords,
    filters: { type: args.type, status: args.status, since: args.since }
  });
  return { output: args.json ? `${JSON.stringify(report, null, 2)}\n` : render(report), report };
}

if (require.main === module) {
  try {
    process.stdout.write(run().output);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { parseArgs, takeWords, relatedNotes, buildContext, render, run };
