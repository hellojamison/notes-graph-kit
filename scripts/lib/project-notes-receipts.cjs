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
  const errorRecords = [];
  const addError = (message, start = 0) => {
    errors.push(message);
    errorRecords.push({ message, line: lineForOffset(body, start) });
  };
  const outsideLines = markdownLinesOutsideFences(body);
  const starts = outsideLines.filter(({ line }) => line.trim() === startMarker);
  const ends = outsideLines.filter(({ line }) => line.trim() === endMarker);
  let endCursor = 0;
  for (const start of starts) {
    const end = ends.find((candidate) => candidate.start > start.start && candidate.start >= endCursor);
    if (!end) {
      addError(`${label} marker is not closed`, start.start);
      continue;
    }
    const contentStart = body.indexOf('\n', start.start) + 1;
    const marked = body.slice(contentStart, end.start);
    const match = marked.match(/^[ \t\r\n]*```yaml[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t\r\n]*$/);
    if (!match) {
      addError(`${label} markers must enclose exactly one yaml fenced block`, start.start);
    } else {
      try {
        const yamlStart = contentStart + match[0].indexOf(match[1]);
        blocks.push({
          value: yaml.load(match[1]),
          start: start.start,
          end: end.start + endMarker.length,
          yaml: match[1],
          yamlStart,
          line: lineForOffset(body, yamlStart)
        });
      } catch (error) {
        addError(`invalid ${label} YAML: ${error.message}`, start.start);
      }
    }
    endCursor = end.start + endMarker.length;
  }
  if (ends.length > starts.length) {
    for (const end of ends.slice(starts.length)) addError(`${label} marker has an unmatched end`, end.start);
  }
  return { blocks, errors, errorRecords };
}

function lineForOffset(text, offset) {
  return text.slice(0, Math.max(0, offset)).split(/\r?\n/).length;
}

function yamlScalarPattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// YAML parsers intentionally do not retain source locations.  The structured
// record format has stable id fields, so recover the exact id line for useful,
// deterministic retrieval diagnostics without changing the public YAML values.
function lineForRecordId(block, id) {
  if (id == null) return block.line;
  const pattern = new RegExp(`^\\s*(?:-\\s+)?id:\\s*["']?${yamlScalarPattern(id)}["']?\\s*(?:#.*)?$`);
  const index = block.yaml.split(/\r?\n/).findIndex((line) => pattern.test(line));
  return index < 0 ? block.line : block.line + index;
}

function extractReceiptBlocks(body) {
  const parsed = parseMarkedYamlBlocks(body, receiptStartMarker, receiptEndMarker, 'receipt');
  const receipts = [];
  const errors = [...parsed.errors];
  const errorRecords = [...parsed.errorRecords];
  const receiptRecords = [];
  parsed.blocks.forEach((block, index) => {
    const { value } = block;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      const message = `receipt ${index + 1} must be a YAML mapping`;
      errors.push(message);
      errorRecords.push({ message, line: block.line });
      return;
    }
    receipts.push(value);
    receiptRecords.push({ value, line: lineForRecordId(block, value.id) });
  });
  return { receipts, receiptRecords, errors, errorRecords };
}

function extractOpenItemsBlock(body) {
  const parsed = parseMarkedYamlBlocks(body, openItemStartMarker, openItemEndMarker, 'open-items');
  if (parsed.blocks.length > 1) {
    const message = 'Status note has more than one open-items block';
    parsed.errors.push(message);
    parsed.errorRecords.push({ message, line: parsed.blocks[1].line });
  }
  if (parsed.blocks.length === 0) {
    return { items: null, itemRecords: [], errors: parsed.errors, errorRecords: parsed.errorRecords };
  }
  const value = parsed.blocks[0].value;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.items)) {
    const message = 'open-items YAML must be a mapping with an items array';
    return { items: null, itemRecords: [], errors: [...parsed.errors, message], errorRecords: [...parsed.errorRecords, { message, line: parsed.blocks[0].line }] };
  }
  return {
    items: value.items,
    itemRecords: value.items.map((item) => ({ item, line: lineForRecordId(parsed.blocks[0], item?.id) })),
    errors: parsed.errors,
    errorRecords: parsed.errorRecords
  };
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

function validateOpenItem(item) {
  const errors = [];
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return ['Open Items entries must be mappings'];
  }
  if (!isNonEmptyString(item.id) || !receiptIdPattern.test(item.id)) {
    errors.push('id must be a lowercase kebab-case identifier');
  }
  if (!isNonEmptyString(item.summary)) errors.push('missing a summary');
  if (!isNonEmptyString(item.opened_by)) errors.push('missing opened_by evidence');
  if (!['open', 'closed'].includes(item.state)) errors.push('state must be open or closed');
  if (item.state === 'closed' && !isNonEmptyString(item.closed_by)) errors.push('missing closed_by evidence');
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
  validateReceipt,
  validateOpenItem
};
