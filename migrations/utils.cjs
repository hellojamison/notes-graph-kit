const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const {
  dumpFrontmatter,
  splitFrontmatter
} = require('../scripts/lib/project-notes-graph.cjs');

const SCAFFOLD_START = '<!-- notes-graph-kit:scaffold:start -->';
const SCAFFOLD_END = '<!-- notes-graph-kit:scaffold:end -->';

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.trim() !== value || !value) {
    return false;
  }
  const normalized = value.replaceAll('\\', '/');
  return !path.posix.isAbsolute(normalized)
    && normalized !== '.'
    && normalized !== '..'
    && !normalized.startsWith('../')
    && !normalized.includes('/../')
    && !normalized.includes('\0');
}

function canonicalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function renderFrontmatter(frontmatter, body) {
  return `---\n${dumpFrontmatter(frontmatter)}\n---\n${body.startsWith('\n') ? '' : '\n'}${body}`;
}

function mergeFrontmatter(text, required, options = {}) {
  let parsed;
  let addedFrontmatter = false;
  try {
    parsed = splitFrontmatter(text);
  } catch (error) {
    return { conflict: `note has invalid frontmatter: ${error.message}` };
  }
  if (!parsed.frontmatter) {
    if (!options.allowMissing || text.startsWith('---\n')) {
      return { conflict: 'note has no parseable frontmatter' };
    }
    parsed = { ...parsed, frontmatter: {} };
    addedFrontmatter = true;
  }
  const next = { ...parsed.frontmatter };
  const evidence = addedFrontmatter ? ['add frontmatter'] : [];
  for (const [key, value] of Object.entries(required)) {
    if (
      options.replaceKeys?.has(key)
      && JSON.stringify(next[key]) !== JSON.stringify(value)
    ) {
      next[key] = value;
      evidence.push(`normalize ${key}`);
      continue;
    }
    if (options.mergeArrays?.has(key) && Array.isArray(value)) {
      const current = Array.isArray(next[key])
        ? next[key]
        : next[key] == null || next[key] === ''
          ? []
          : [next[key]];
      const additions = value.filter(
        (entry) => !current.some((currentEntry) =>
          JSON.stringify(currentEntry) === JSON.stringify(entry)
        )
      );
      if (additions.length > 0 || !Array.isArray(next[key])) {
        next[key] = [...current, ...additions];
        evidence.push(`${Array.isArray(parsed.frontmatter[key]) ? 'extend' : 'add'} ${key}`);
      }
      continue;
    }
    if (next[key] == null || next[key] === '') {
      next[key] = value;
      evidence.push(`add ${key}`);
      continue;
    }
    if (options.requireEqual?.has(key) && JSON.stringify(next[key]) !== JSON.stringify(value)) {
      return {
        conflict: `${key} is ${JSON.stringify(next[key])}; expected ${JSON.stringify(value)}`
      };
    }
  }
  const content = evidence.length === 0
    ? text
    : addedFrontmatter
      ? `---\n${dumpFrontmatter(next)}\n---\n${parsed.body}`
      : renderFrontmatter(next, parsed.body);
  return { content, evidence };
}

function headingSection(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^## ${escaped}[ \\t]*$`, 'm'));
  if (!match) {
    return null;
  }
  const start = match.index;
  const rest = text.slice(start + match[0].length);
  const next = rest.match(/^## [^\n]+$/m);
  const end = next ? start + match[0].length + next.index : text.length;
  return { start, end, content: text.slice(start, end).trimEnd() };
}

function mergeHeadingSection(existing, desired, heading, options = {}) {
  const desiredSection = headingSection(desired, heading);
  if (!desiredSection) {
    throw new Error(`Migration source is missing ## ${heading}`);
  }
  const currentSection = headingSection(existing, heading);
  if (currentSection?.content === desiredSection.content) {
    return { content: existing, evidence: [`## ${heading} already matches`] };
  }
  if (currentSection && !options.replaceExisting) {
    return { conflict: `customized ## ${heading} section requires review` };
  }
  if (currentSection) {
    return {
      content: `${existing.slice(0, currentSection.start)}${desiredSection.content}\n\n${existing.slice(currentSection.end).replace(/^\n+/, '')}`,
      evidence: [`replace managed ## ${heading}`]
    };
  }
  const insertion = options.beforeHeading
    ? headingSection(existing, options.beforeHeading)?.start
    : null;
  if (insertion != null) {
    return {
      content: `${existing.slice(0, insertion).trimEnd()}\n\n${desiredSection.content}\n\n${existing.slice(insertion)}`,
      evidence: [`add ## ${heading}`]
    };
  }
  return {
    content: `${existing.trimEnd()}\n\n${desiredSection.content}\n`,
    evidence: [`append ## ${heading}`]
  };
}

function mergeManagedSection(existing, desired, startMarker, endMarker) {
  const desiredBlock = markedBlock(desired, startMarker, endMarker);
  if (desiredBlock.status !== 'found') {
    throw new Error(`Migration source is missing one ${startMarker} marker pair`);
  }
  const currentBlock = markedBlock(existing, startMarker, endMarker);
  if (currentBlock.status === 'invalid') {
    return { conflict: `content has incomplete or duplicate ${startMarker} markers` };
  }
  if (currentBlock.status === 'found') {
    if (currentBlock.content === desiredBlock.content) {
      return { content: existing, evidence: [`${startMarker} already matches`] };
    }
    return {
      content: `${existing.slice(0, currentBlock.start)}${desiredBlock.content}${existing.slice(currentBlock.end)}`,
      evidence: [`refresh ${startMarker} block`]
    };
  }

  const desiredInner = desiredBlock.content
    .slice(startMarker.length, desiredBlock.content.length - endMarker.length)
    .replace(/^\r?\n/, '')
    .replace(/\r?\n$/, '');
  const firstMatch = existing.indexOf(desiredInner);
  const secondMatch = firstMatch === -1
    ? -1
    : existing.indexOf(desiredInner, firstMatch + desiredInner.length);
  if (firstMatch !== -1 && secondMatch === -1) {
    const marked = `${startMarker}\n${desiredInner}\n${endMarker}`;
    return {
      content: `${existing.slice(0, firstMatch)}${marked}${existing.slice(firstMatch + desiredInner.length)}`,
      evidence: [`mark existing ${startMarker} content`]
    };
  }

  return {
    content: `${existing}${existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n'}${desiredBlock.content}\n`,
    evidence: [`append ${startMarker} block; preserve unmarked prose`]
  };
}

function markedBlock(text, startMarker, endMarker) {
  const starts = [...text.matchAll(new RegExp(escapeRegExp(startMarker), 'g'))];
  const ends = [...text.matchAll(new RegExp(escapeRegExp(endMarker), 'g'))];
  if (starts.length === 0 && ends.length === 0) {
    return { status: 'missing' };
  }
  if (starts.length !== 1 || ends.length !== 1 || starts[0].index >= ends[0].index) {
    return { status: 'invalid' };
  }
  const start = starts[0].index;
  const end = ends[0].index + endMarker.length;
  return { status: 'found', start, end, content: text.slice(start, end) };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scaffoldBlockFromTemplate(text) {
  const block = markedBlock(text, SCAFFOLD_START, SCAFFOLD_END);
  if (block.status !== 'found') {
    throw new Error('Current template source is missing one scaffold marker pair');
  }
  return block.content;
}

function scaffoldFromBlock(block, label) {
  const inner = block
    .slice(SCAFFOLD_START.length, block.length - SCAFFOLD_END.length)
    .trim();
  const fence = inner.match(/^```yaml[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/);
  if (!fence) {
    return { conflict: `${label} scaffold markers must enclose one YAML fence` };
  }
  try {
    const scaffold = yaml.load(fence[1]);
    if (!scaffold || typeof scaffold !== 'object' || Array.isArray(scaffold)) {
      return { conflict: `${label} scaffold YAML must be a mapping` };
    }
    return { scaffold };
  } catch (error) {
    return { conflict: `${label} scaffold YAML is invalid: ${error.message}` };
  }
}

function mergeScaffold(currentScaffold, desiredScaffold) {
  const requiredKeys = ['title', 'schema_version', 'type', 'status', 'date', 'tags'];
  const next = { ...desiredScaffold, ...currentScaffold };
  for (const key of requiredKeys) {
    next[key] = desiredScaffold[key];
  }
  return next;
}

function renderScaffoldBlock(scaffold) {
  return `${SCAFFOLD_START}\n\`\`\`yaml\n${dumpFrontmatter(scaffold)}\n\`\`\`\n${SCAFFOLD_END}`;
}

function mergeTemplate(existing, desired, expectedType) {
  if (existing === desired) {
    return { content: existing, evidence: ['current template source already matches'] };
  }
  const currentParsed = splitFrontmatter(existing);
  const desiredParsed = splitFrontmatter(desired);
  if (!currentParsed.frontmatter) {
    return { conflict: 'template has no parseable frontmatter' };
  }
  if (!desiredParsed.frontmatter) {
    throw new Error('Current template source has no parseable frontmatter');
  }

  const desiredBlock = scaffoldBlockFromTemplate(desired);
  const desiredScaffoldResult = scaffoldFromBlock(desiredBlock, 'current template');
  if (desiredScaffoldResult.conflict) {
    throw new Error(desiredScaffoldResult.conflict);
  }
  const desiredScaffold = desiredScaffoldResult.scaffold;
  const markers = markedBlock(existing, SCAFFOLD_START, SCAFFOLD_END);
  if (markers.status === 'invalid') {
    return { conflict: 'template has incomplete or duplicate scaffold markers' };
  }

  let body = currentParsed.body;
  const evidence = [];
  if (markers.status === 'found') {
    const bodyBlock = markedBlock(body, SCAFFOLD_START, SCAFFOLD_END);
    if (bodyBlock.status !== 'found') {
      return { conflict: 'scaffold markers are outside the template body' };
    }
    const currentScaffoldResult = scaffoldFromBlock(bodyBlock.content, 'existing template');
    if (currentScaffoldResult.conflict) {
      return currentScaffoldResult;
    }
    const mergedBlock = renderScaffoldBlock(
      mergeScaffold(currentScaffoldResult.scaffold, desiredScaffold)
    );
    if (bodyBlock.content !== mergedBlock) {
      body = `${body.slice(0, bodyBlock.start)}${mergedBlock}${body.slice(bodyBlock.end)}`;
      evidence.push('refresh marked scaffold');
    }
  } else {
    const yamlFences = [...body.matchAll(/```yaml[ \t]*\n([\s\S]*?)\n```/g)];
    const typedFences = yamlFences.filter((match) => {
      try {
        const raw = match[1].replace(/^---[ \t]*\n/, '').replace(/\n---[ \t]*$/, '');
        return yaml.load(raw)?.type === expectedType;
      } catch {
        return false;
      }
    });
    if (typedFences.length > 1) {
      return { conflict: `template has multiple unmarked ${expectedType} YAML scaffolds` };
    }
    if (typedFences.length === 1) {
      const match = typedFences[0];
      const currentScaffold = yaml.load(
        match[1].replace(/^---[ \t]*\n/, '').replace(/\n---[ \t]*$/, '')
      );
      const mergedBlock = renderScaffoldBlock(mergeScaffold(currentScaffold, desiredScaffold));
      body = `${body.slice(0, match.index)}${mergedBlock}${body.slice(match.index + match[0].length)}`;
      evidence.push('mark and refresh legacy YAML scaffold');
    } else {
      const h1 = body.match(/^# [^\n]+$/m);
      const insertion = h1 ? h1.index : 0;
      body = `${body.slice(0, insertion)}${desiredBlock}\n\n${body.slice(insertion)}`;
      evidence.push('insert marked scaffold');
    }
  }

  const managedKeys = new Set([
    'title', 'schema_version', 'type', 'status', 'date', 'tags', 'app',
    'source_of_truth', 'last_verified', 'confidence', 'related_apps',
    'related_processes', 'related_runbooks', 'related_decisions',
    'related_incidents', 'related_evidence'
  ]);
  const nextFrontmatter = { ...desiredParsed.frontmatter };
  for (const [key, value] of Object.entries(currentParsed.frontmatter)) {
    if (!managedKeys.has(key)) {
      nextFrontmatter[key] = value;
    }
  }
  if (JSON.stringify(currentParsed.frontmatter) !== JSON.stringify(nextFrontmatter)) {
    evidence.push('set outer template metadata');
  }
  const content = renderFrontmatter(nextFrontmatter, body);
  return { content: content === existing ? existing : content, evidence };
}

function hasTemplateExclusion(base) {
  const target = 'file.inFolder("Templates")';
  function visit(value, underNot = false) {
    if (Array.isArray(value)) {
      return value.some((entry) => visit(entry, underNot));
    }
    if (value && typeof value === 'object') {
      return Object.entries(value).some(([key, entry]) => visit(entry, underNot || key === 'not'));
    }
    return underNot && value === target;
  }
  return visit(base);
}

function mergeBaseTemplateExclusion(text) {
  let base;
  try {
    base = yaml.load(text);
  } catch (error) {
    return { conflict: `invalid Base YAML: ${error.message}` };
  }
  if (!base || typeof base !== 'object' || Array.isArray(base)) {
    return { conflict: 'Base YAML is not a mapping' };
  }
  if (hasTemplateExclusion(base)) {
    return { content: text, evidence: ['Templates exclusion already present'] };
  }
  if (base.filters == null) {
    base.filters = { not: ['file.inFolder("Templates")'] };
  } else if (base.filters.and && Array.isArray(base.filters.and)) {
    base.filters.and.push({ not: ['file.inFolder("Templates")'] });
  } else {
    base.filters = {
      and: [
        base.filters,
        { not: ['file.inFolder("Templates")'] }
      ]
    };
  }
  return {
    content: yaml.dump(base, { lineWidth: 120, noRefs: true, quotingType: "'", forceQuotes: false }),
    evidence: ['compose global Templates exclusion']
  };
}

function readUtf8IfFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Migration target must be a regular file: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

module.exports = {
  SCAFFOLD_START,
  SCAFFOLD_END,
  canonicalDate,
  escapeRegExp,
  hasTemplateExclusion,
  headingSection,
  isSafeRelativePath,
  markedBlock,
  mergeBaseTemplateExclusion,
  mergeFrontmatter,
  mergeHeadingSection,
  mergeManagedSection,
  mergeTemplate,
  readUtf8IfFile,
  renderFrontmatter,
  scaffoldBlockFromTemplate,
  toPosix
};
