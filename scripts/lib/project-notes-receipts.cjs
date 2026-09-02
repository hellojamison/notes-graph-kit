const path = require('node:path');
const yaml = require('js-yaml');
const { markdownLinesOutsideFences } = require('./project-notes-graph.cjs');

const receiptStartMarker = '<!-- notes-graph-kit:receipt:start -->';
const receiptEndMarker = '<!-- notes-graph-kit:receipt:end -->';
const openItemStartMarker = '<!-- notes-graph-kit:open-items:start -->';
const openItemEndMarker = '<!-- notes-graph-kit:open-items:end -->';

const receiptOutcomes = new Set(['working', 'verified', 'failed', 'open']);
const receiptIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function parseMarkedYamlBlocks(body, startMarker, endMarker, label) {
  const blocks = [];
  const errors = [];
  const outsideLines = markdownLinesOutsideFences(body);
  const starts = outsideLines.filter(({ line }) => line.trim() === startMarker);
  const ends = outsideLines.filter(({ line }) => line.trim() === endMarker);
  let endCursor = 0;
  for (const start of starts) {
    const end = ends.find((candidate) => candidate.start > start.start && candidate.start >= endCursor);
    if (!end) {
      errors.push(`${label} marker is not closed`);
      continue;
    }
    const contentStart = body.indexOf('\n', start.start) + 1;
    const marked = body.slice(contentStart, end.start).trim();
    const match = marked.match(/^```yaml[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/);
    if (!match) {
      errors.push(`${label} markers must enclose exactly one yaml fenced block`);
    } else {
      try {
        blocks.push({ value: yaml.load(match[1]), start: start.start, end: end.start + endMarker.length });
      } catch (error) {
        errors.push(`invalid ${label} YAML: ${error.message}`);
      }
    }
    endCursor = end.start + endMarker.length;
  }
  if (ends.length > starts.length) {
    errors.push(`${label} marker has an unmatched end`);
  }
  return { blocks, errors };
}

function extractReceiptBlocks(body) {
  const parsed = parseMarkedYamlBlocks(body, receiptStartMarker, receiptEndMarker, 'receipt');
  const receipts = [];
  const errors = [...parsed.errors];
  parsed.blocks.forEach(({ value }, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`receipt ${index + 1} must be a YAML mapping`);
      return;
    }
    receipts.push(value);
  });
  return { receipts, errors };
}

function extractOpenItemsBlock(body) {
  const parsed = parseMarkedYamlBlocks(body, openItemStartMarker, openItemEndMarker, 'open-items');
  if (parsed.blocks.length > 1) {
    parsed.errors.push('Status note has more than one open-items block');
  }
  if (parsed.blocks.length === 0) {
    return { items: null, errors: parsed.errors };
  }
  const value = parsed.blocks[0].value;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.items)) {
    return { items: null, errors: [...parsed.errors, 'open-items YAML must be a mapping with an items array'] };
  }
  return { items: value.items, errors: parsed.errors };
}

function validateReceipt(receipt, knownIds = new Set()) {
  const errors = [];
  if (!isNonEmptyString(receipt.id) || !receiptIdPattern.test(receipt.id)) {
    errors.push('id must be a lowercase kebab-case identifier');
  } else if (knownIds.has(receipt.id)) {
    errors.push(`id "${receipt.id}" is duplicated`);
  } else {
    knownIds.add(receipt.id);
  }
  if (!receiptOutcomes.has(receipt.outcome)) {
    errors.push(`outcome must be one of ${[...receiptOutcomes].join(', ')}`);
  }
  if (receipt.command != null && !isNonEmptyString(receipt.command)) {
    errors.push('command must be a non-empty string when present');
  }
  if (receipt.tests != null) {
    if (!receipt.tests || typeof receipt.tests !== 'object' || Array.isArray(receipt.tests)) {
      errors.push('tests must be a mapping');
    } else {
      if (!Number.isInteger(receipt.tests.passed) || receipt.tests.passed < 0) {
        errors.push('tests.passed must be a non-negative integer');
      }
      if (!isNonEmptyString(receipt.tests.filter)) {
        errors.push('tests.filter is required whenever tests is present');
      }
    }
  }
  for (const field of ['open_items', 'closes_open_items']) {
    for (const value of asArray(receipt[field])) {
      if (!isNonEmptyString(value) || !receiptIdPattern.test(value)) {
        errors.push(`${field} entries must be lowercase kebab-case identifiers`);
      }
    }
  }
  for (const [index, artifact] of asArray(receipt.artifacts).entries()) {
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
      errors.push(`artifacts[${index}] must be a mapping`);
      continue;
    }
    if (!isNonEmptyString(artifact.path)) {
      errors.push(`artifacts[${index}].path must be a non-empty string`);
    }
    if (artifact.sha256 != null && (!isNonEmptyString(artifact.sha256) || !/^[a-f0-9]{64}$/i.test(artifact.sha256))) {
      errors.push(`artifacts[${index}].sha256 must be a 64-character hex digest`);
    }
    if (artifact.git_sha != null && (!isNonEmptyString(artifact.git_sha) || !/^[a-f0-9]{7,64}$/i.test(artifact.git_sha))) {
      errors.push(`artifacts[${index}].git_sha must be a Git SHA`);
    }
  }
  return errors;
}

function isSafeArtifactRel(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }
  const normalized = value.replace(/\\/g, '/');
  return normalized.startsWith('artifacts/')
    && !normalized.includes('\0')
    && !path.posix.isAbsolute(normalized)
    && !normalized.split('/').includes('..');
}

function stripMarkedReceiptBlocks(body) {
  const expression = new RegExp(
    `${receiptStartMarker.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}[\\s\\S]*?${receiptEndMarker.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`,
    'g'
  );
  return body.replace(expression, '');
}

module.exports = {
  asArray,
  extractOpenItemsBlock,
  extractReceiptBlocks,
  isSafeArtifactRel,
  openItemEndMarker,
  openItemStartMarker,
  receiptEndMarker,
  receiptIdPattern,
  receiptStartMarker,
  stripMarkedReceiptBlocks,
  validateReceipt
};
