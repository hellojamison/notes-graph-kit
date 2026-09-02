#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  getRepoRoot,
  getVaultRoot,
  getNoteTitle,
  linkForRel,
  loadVaultGraph
} = require('./lib/project-notes-graph.cjs');
const { asArray, extractReceiptBlocks, isSafeArtifactRel } = require('./lib/project-notes-receipts.cjs');

const generatedMarker = '<!-- notes-graph-kit:generated-artifact-index -->';

function parseArgs(argv) {
  const parsed = { write: false };
  for (const arg of argv) {
    if (arg === '--write') {
      parsed.write = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return parsed;
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|');
}

function collectArtifacts(graph) {
  const records = [];
  for (const note of graph.notes) {
    if (note.frontmatter?.type !== 'evidence') {
      continue;
    }
    const { receipts } = extractReceiptBlocks(note.body);
    receipts.forEach((receipt) => {
      for (const artifact of asArray(receipt.artifacts)) {
        if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) || !isSafeArtifactRel(artifact.path)) {
          continue;
        }
        records.push({
          path: artifact.path.replace(/\\/g, '/'),
          evidence: linkForRel(note.rel, getNoteTitle(note, note.rel)),
          outcome: receipt.outcome || 'unknown',
          receipt: receipt.id || 'unnamed',
          sha256: artifact.sha256 || '',
          gitSha: artifact.git_sha || ''
        });
      }
    });
  }
  return records.sort((left, right) =>
    left.path.localeCompare(right.path)
    || left.evidence.localeCompare(right.evidence)
    || left.receipt.localeCompare(right.receipt)
  );
}

function renderIndex(records) {
  const lines = [
    generatedMarker,
    '# Artifact Index',
    '',
    'Generated from structured evidence receipts. Do not edit; run `npm run notes:artifacts -- --write`.',
    '',
    '| Artifact | Evidence | Outcome | Receipt | SHA |',
    '| --- | --- | --- | --- | --- |'
  ];
  for (const record of records) {
    const sha = [record.gitSha, record.sha256 ? `sha256:${record.sha256.slice(0, 12)}` : ''].filter(Boolean).join(' ');
    lines.push(`| \`${escapeCell(record.path)}\` | ${record.evidence} | ${escapeCell(record.outcome)} | \`${escapeCell(record.receipt)}\` | \`${escapeCell(sha)}\` |`);
  }
  if (records.length === 0) {
    lines.push('| _No structured artifact receipts yet._ |  |  |  |  |');
  }
  return `${lines.join('\n')}\n`;
}

function main(argv = process.argv.slice(2), options = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    return 'Usage: node scripts/build-project-notes-artifact-index.cjs [--write]\n';
  }
  const env = options.env || process.env;
  const repoRoot = path.resolve(options.repoRoot || getRepoRoot(env));
  const graph = loadVaultGraph({ env, vaultRoot: options.vaultRoot || getVaultRoot({ env }) });
  const output = renderIndex(collectArtifacts(graph));
  if (!args.write) {
    return output;
  }
  const target = path.join(repoRoot, 'artifacts', 'INDEX.md');
  if (fs.existsSync(target) && !fs.readFileSync(target, 'utf8').startsWith(generatedMarker)) {
    throw new Error(`Refusing to overwrite non-generated artifact index: ${target}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output);
  return `Wrote ${path.relative(repoRoot, target).split(path.sep).join('/')}\n`;
}

if (require.main === module) {
  try {
    process.stdout.write(main());
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = { collectArtifacts, main, parseArgs, renderIndex };
