#!/usr/bin/env node

const {
  getVaultRoot,
  loadVaultGraph,
  markdownLinesOutsideFences
} = require('./lib/project-notes-graph.cjs');

const DEFAULT_LIMIT = 10;
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const MAX_AUTHORITY_MULTIPLIER = 1.25;

function printHelp() {
  return `Search project notes by ranked Markdown section

Usage:
  node scripts/search-project-notes.cjs "query terms" [--type evidence] [--status verified] [--since YYYY-MM-DD] [--limit 10] [--json]

Options:
  --type TYPE       Include only notes with this frontmatter type (repeatable)
  --status STATUS   Include only notes with this frontmatter status (repeatable)
  --since DATE      Include only notes dated on or after YYYY-MM-DD
  --limit COUNT     Maximum results (default: 10)
  --json            Emit machine-readable JSON
  --include-templates  Include template notes, which are excluded by default
`;
}

function parseArgs(argv) {
  const parsed = { _: [], type: [], status: [] };
  const repeatable = new Set(['type', 'status']);
  const values = new Set(['since', 'limit']);
  const booleans = new Set(['json', 'include-templates', 'help']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      parsed._.push(arg);
      continue;
    }
    const equalsIndex = arg.indexOf('=');
    const key = arg.slice(2, equalsIndex === -1 ? undefined : equalsIndex);
    if (!repeatable.has(key) && !values.has(key) && !booleans.has(key)) {
      throw new Error(`Unknown option: --${key}`);
    }
    if (booleans.has(key)) {
      if (equalsIndex !== -1) {
        throw new Error(`--${key} does not take a value`);
      }
      parsed[key] = true;
      continue;
    }
    const value = equalsIndex === -1 ? argv[index + 1] : arg.slice(equalsIndex + 1);
    if (!value || (equalsIndex === -1 && value.startsWith('--'))) {
      throw new Error(`--${key} requires a value`);
    }
    if (equalsIndex === -1) {
      index += 1;
    }
    if (repeatable.has(key)) {
      parsed[key].push(value.trim());
    } else {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        throw new Error(`Duplicate option: --${key}`);
      }
      parsed[key] = value.trim();
    }
  }
  return parsed;
}

function tokenize(value) {
  return String(value || '')
    .toLocaleLowerCase('en-US')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) || [];
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

function validateOptions(args) {
  const query = args._.join(' ').trim();
  if (!query) {
    throw new Error('Search query is required');
  }
  if (args.since && !/^\d{4}-\d{2}-\d{2}$/.test(args.since)) {
    throw new Error('--since must be YYYY-MM-DD');
  }
  const limit = args.limit === undefined ? DEFAULT_LIMIT : Number(args.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('--limit must be an integer from 1 to 100');
  }
  return { query, limit };
}

function stripMarkdown(line) {
  return line
    .replace(/<!--.*?-->/g, ' ')
    .replace(/!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, '$2 $1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/^[ \t]*(?:[-*+] |\d+[.)] |>[ \t]*)/, '')
    .replace(/[`*_~=#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSections(note) {
  const sections = [];
  let heading = note.frontmatter?.title || note.rel.replace(/\.md$/i, '');
  let level = 0;
  let bodyLines = [];
  let startLine = 1;

  const flush = () => {
    const cleaned = bodyLines.map(stripMarkdown).filter(Boolean);
    if (cleaned.length > 0) {
      sections.push({ heading, level, line: startLine, text: cleaned.join(' ') });
    }
  };

  for (const { line, start } of markdownLinesOutsideFences(note.body)) {
    const match = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/);
    if (match) {
      flush();
      heading = stripMarkdown(match[2]);
      level = match[1].length;
      bodyLines = [];
      startLine = note.text.slice(0, note.text.indexOf(note.body) + start).split('\n').length;
    } else {
      bodyLines.push(line);
    }
  }
  flush();
  return sections;
}

function matchesFilters(note, args) {
  const frontmatter = note.frontmatter || {};
  if (!args['include-templates'] && frontmatter.type === 'template') {
    return false;
  }
  if (args.type.length > 0 && !args.type.includes(String(frontmatter.type || ''))) {
    return false;
  }
  if (args.status.length > 0 && !args.status.includes(String(frontmatter.status || ''))) {
    return false;
  }
  if (args.since && normalizeDate(frontmatter.date) < args.since) {
    return false;
  }
  return true;
}

function excerptFor(section, queryTokens, maxLength = 220) {
  const text = section.text;
  const lower = text.toLocaleLowerCase('en-US');
  const offsets = queryTokens.map((term) => lower.indexOf(term)).filter((offset) => offset >= 0);
  const matchAt = offsets.length > 0 ? Math.min(...offsets) : 0;
  const start = Math.max(0, matchAt - Math.floor(maxLength / 3));
  const end = Math.min(text.length, start + maxLength);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

function authorityFor(frontmatter = {}) {
  const type = String(frontmatter.type || '');
  const status = String(frontmatter.status || '');
  let multiplier = 1;
  const reasons = [];

  if (['evidence', 'audit', 'known-good'].includes(type)) {
    multiplier += 0.08;
    reasons.push(`${type} note`);
    if (status === 'verified') {
      multiplier += 0.12;
      reasons.push('verified status');
    }
  } else if (type === 'decision') {
    multiplier += 0.08;
    reasons.push('decision note');
    if (['current', 'implemented', 'verified'].includes(status)) {
      multiplier += 0.07;
      reasons.push(`${status} status`);
    }
  } else if (['runbook', 'process'].includes(type)) {
    multiplier += 0.05;
    reasons.push(`${type} note`);
    if (['current', 'verified'].includes(status)) {
      multiplier += 0.07;
      reasons.push(`${status} status`);
    }
  } else if (type === 'status' && status === 'current') {
    multiplier += 0.12;
    reasons.push('current status');
  } else if (type === 'release') {
    multiplier += 0.04;
    reasons.push('release note');
    if (['packaged', 'verified'].includes(status)) {
      multiplier += 0.06;
      reasons.push(`${status} status`);
    }
  } else if (type === 'incident') {
    multiplier += 0.02;
    reasons.push('incident note');
    if (['fixed-uncommitted', 'done', 'fixed', 'verified'].includes(status)) {
      multiplier += 0.05;
      reasons.push(`${status} status`);
    }
  } else if (type === 'daily') {
    multiplier -= 0.08;
    reasons.push('daily note');
  }

  if (frontmatter.source_of_truth === true) {
    multiplier += 0.05;
    reasons.push('source_of_truth');
  }
  multiplier = Math.min(MAX_AUTHORITY_MULTIPLIER, multiplier);
  return { multiplier: Number(multiplier.toFixed(2)), reasons };
}

function searchNotes(query, notes, options = {}) {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) {
    throw new Error('Search query must contain a letter or number');
  }
  const documents = notes.flatMap((note) => splitSections(note).map((section) => {
    const title = String(note.frontmatter?.title || '');
    const weightedText = `${title} ${title} ${section.heading} ${section.heading} ${section.text}`;
    const tokens = tokenize(weightedText);
    const frequencies = new Map();
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) || 0) + 1);
    }
    return { note, section, tokens, frequencies };
  }));
  if (documents.length === 0) {
    return [];
  }
  const averageLength = documents.reduce((sum, doc) => sum + doc.tokens.length, 0) / documents.length;
  const documentFrequency = new Map(queryTokens.map((term) => [
    term,
    documents.filter((doc) => doc.frequencies.has(term)).length
  ]));
  const normalizedPhrase = queryTokens.join(' ');
  const results = [];
  for (const doc of documents) {
    let lexicalScore = 0;
    for (const term of queryTokens) {
      const frequency = doc.frequencies.get(term) || 0;
      if (frequency === 0) continue;
      const df = documentFrequency.get(term);
      const idf = Math.log(1 + ((documents.length - df + 0.5) / (df + 0.5)));
      const denominator = frequency + BM25_K1 * (1 - BM25_B + BM25_B * (doc.tokens.length / averageLength));
      lexicalScore += idf * ((frequency * (BM25_K1 + 1)) / denominator);
    }
    if (lexicalScore === 0) continue;
    if (tokenize(`${doc.section.heading} ${doc.section.text}`).join(' ').includes(normalizedPhrase)) {
      lexicalScore *= 1.25;
    }
    const authority = authorityFor(doc.note.frontmatter);
    const score = lexicalScore * authority.multiplier;
    results.push({
      path: doc.note.rel,
      heading: doc.section.heading,
      line: doc.section.line,
      type: doc.note.frontmatter?.type || null,
      status: doc.note.frontmatter?.status || null,
      date: normalizeDate(doc.note.frontmatter?.date) || null,
      score: Number(score.toFixed(6)),
      lexicalScore: Number(lexicalScore.toFixed(6)),
      authority,
      excerpt: excerptFor(doc.section, queryTokens)
    });
  }
  return results.sort((left, right) =>
    right.score - left.score
    || left.path.localeCompare(right.path)
    || left.line - right.line
  ).slice(0, options.limit || DEFAULT_LIMIT);
}

function renderText(query, results) {
  if (results.length === 0) {
    return `No notes matched "${query}".\n`;
  }
  return `${results.map((result, index) => [
    `${index + 1}. ${result.path}:${result.line} — ${result.heading} [score ${result.score.toFixed(3)}; BM25 ${result.lexicalScore.toFixed(3)} × authority ${result.authority.multiplier.toFixed(2)}]`,
    `   ${result.type || 'untyped'} · ${result.status || 'no-status'}${result.date ? ` · ${result.date}` : ''}`,
    `   ${result.excerpt}`
  ].join('\n')).join('\n\n')}\n`;
}

function main(argv = process.argv.slice(2), options = {}) {
  const args = parseArgs(argv);
  if (args.help) return printHelp();
  const { query, limit } = validateOptions(args);
  const vaultRoot = getVaultRoot({ env: options.env, vaultRoot: options.vaultRoot });
  const graph = loadVaultGraph({ env: options.env, vaultRoot });
  const notes = graph.notes.filter((note) => matchesFilters(note, args));
  const results = searchNotes(query, notes, { limit });
  if (args.json) {
    return `${JSON.stringify({ query, filters: {
      type: args.type,
      status: args.status,
      since: args.since || null,
      includeTemplates: Boolean(args['include-templates'])
    }, count: results.length, results }, null, 2)}\n`;
  }
  return renderText(query, results);
}

if (require.main === module) {
  try {
    process.stdout.write(main());
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  tokenize,
  splitSections,
  authorityFor,
  searchNotes,
  matchesFilters,
  main
};
