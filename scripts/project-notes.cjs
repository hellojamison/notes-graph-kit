#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  getVaultRoot,
  getRepoRoot,
  buildRoute,
  currentDateParts,
  getConfig,
  loadVaultGraph,
  loadFrontmatter,
  dumpFrontmatter,
  splitFrontmatter,
  linkForRel,
  getNoteTitle,
  noteKeyForRel,
  normalizeInput,
  validateRouteDefinitions,
  markdownLinesOutsideFences,
  extractWikilinkTargets,
  resolveTargetDetailed,
  isTemplate
} = require('./lib/project-notes-graph.cjs');
const {
  extractOpenItemsBlock,
  openItemEndMarker,
  openItemStartMarker,
  receiptIdPattern
} = require('./lib/project-notes-receipts.cjs');

const scaffoldStartMarker = '<!-- notes-graph-kit:scaffold:start -->';
const scaffoldEndMarker = '<!-- notes-graph-kit:scaffold:end -->';

const noteTypeDefinitions = {
  task: {
    template: 'Task Note Template.md',
    folder: 'Evidence',
    status: 'active',
    datePrefix: true,
    summarySection: 'Goal',
    requiresProcess: true
  },
  evidence: {
    template: 'Evidence Template.md',
    folder: 'Evidence',
    status: 'open',
    datePrefix: true,
    summarySection: 'Scope',
    requiresProcess: true
  },
  app: {
    template: 'App Template.md',
    folder: 'Apps',
    status: 'current',
    datePrefix: false,
    summarySection: 'Scope',
    requiresProcess: false
  },
  process: {
    template: 'Process Template.md',
    folder: 'Processes',
    status: 'draft',
    datePrefix: false,
    summarySection: 'Current Truth',
    requiresProcess: false
  },
  runbook: {
    template: 'Runbook Template.md',
    folder: 'Runbooks',
    status: 'draft',
    datePrefix: false,
    summarySection: 'Steps',
    requiresProcess: false
  },
  decision: {
    template: 'Decision Record Template.md',
    folder: 'Decisions',
    status: 'draft',
    datePrefix: false,
    summarySection: 'Context',
    requiresProcess: false
  },
  incident: {
    template: 'Incident Note Template.md',
    folder: 'Incidents',
    status: 'active',
    datePrefix: false,
    summarySection: 'Symptom',
    requiresProcess: false
  },
  release: {
    template: 'Release Note Template.md',
    folder: 'Releases',
    status: 'draft',
    datePrefix: false,
    summarySection: 'Build',
    requiresProcess: false
  },
  status: {
    template: 'Status Note Template.md',
    folder: 'Status',
    status: 'current',
    datePrefix: false,
    summarySection: 'Current Phase',
    requiresProcess: true
  }
};

function printHelp() {
  return `Project notes helper

Usage:
  node scripts/project-notes.cjs route "matisse dark mode buttons" [--json]
  node scripts/project-notes.cjs new --title "Note title" [--process theme-qa] [--summary "..."] [--topic "..."] [--type task|evidence|app|process|runbook|decision|incident|release|status] [--runbook "..."]
  node scripts/project-notes.cjs closeout --note "Project Notes/Evidence/2026-07-03 Task title.md" --working "..." --verified "..." --not-verified "..." [--verdict "..." --decision "Decisions/Current Verdict.md"] [--certify] [--status "Status/Theme QA Status.md" --phase "..." --certified "..." --settled "..." --open-item "id: summary" --close-item id[,id]]
`;
}

const commandOptions = {
  route: {
    booleanFlags: new Set(['json', 'help']),
    valueFlags: new Set(),
    allowPositionals: true
  },
  new: {
    booleanFlags: new Set(['help']),
    valueFlags: new Set(['title', 'process', 'summary', 'topic', 'type', 'runbook']),
    allowPositionals: false
  },
  closeout: {
    booleanFlags: new Set(['help', 'certify']),
    valueFlags: new Set([
      'note', 'working', 'verified', 'not-verified', 'verdict', 'decision',
      'status', 'phase', 'certified', 'open', 'open-item', 'close-item', 'settled'
    ]),
    allowPositionals: false
  }
};

function parseArgs(argv, command = 'route') {
  const spec = commandOptions[command];
  if (!spec) {
    throw new Error(`Unknown command: ${command}`);
  }
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      parsed._.push(arg);
      continue;
    }
    const equalsIndex = arg.indexOf('=');
    const key = arg.slice(2, equalsIndex === -1 ? undefined : equalsIndex);
    if (!spec.booleanFlags.has(key) && !spec.valueFlags.has(key)) {
      throw new Error(`Unknown option for ${command}: --${key}`);
    }
    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
      throw new Error(`Duplicate option: --${key}`);
    }
    if (spec.booleanFlags.has(key)) {
      if (equalsIndex !== -1) {
        throw new Error(`--${key} does not take a value`);
      }
      parsed[key] = true;
      continue;
    }
    if (equalsIndex !== -1) {
      parsed[key] = arg.slice(equalsIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(
        `--${key} requires a value; use --${key}=<value> when the value begins with --`
      );
    }
    parsed[key] = next;
    index += 1;
  }
  if (!spec.allowPositionals && parsed._.length > 0) {
    throw new Error(`Unexpected positional argument(s) for ${command}: ${parsed._.join(' ')}`);
  }
  return parsed;
}

function requireArg(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required --${name}`);
  }
  return value.trim();
}

function sanitizeFileTitle(title) {
  const sanitized = String(title || '')
    .replace(/[\\/:*?"<>|[\]#^\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized || 'Untitled Notes Task';
}

function notePathForType(vaultRoot, dateStamp, title, definition) {
  const titlePart = sanitizeFileTitle(title);
  const baseName = definition.datePrefix ? `${dateStamp} ${titlePart}` : titlePart;
  const dirPath = path.join(vaultRoot, definition.folder);
  const directPath = path.join(dirPath, `${baseName}.md`);
  if (!definition.datePrefix) {
    if (fs.existsSync(directPath)) {
      throw new Error(`Note already exists: ${path.relative(vaultRoot, directPath)}`);
    }
    return directPath;
  }
  for (let counter = 1; counter < 1000; counter += 1) {
    const suffix = counter === 1 ? '' : ` ${counter}`;
    const candidate = path.join(dirPath, `${baseName}${suffix}.md`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Could not find an available note path for "${title}"`);
}

function insertIntoSection(body, sectionName, content) {
  if (!content) {
    return body;
  }
  const heading = `## ${sectionName}`;
  const index = body.indexOf(heading);
  if (index === -1) {
    return body;
  }
  const lineEnd = body.indexOf('\n', index);
  if (lineEnd === -1) {
    return `${body}\n\n${content}\n`;
  }
  return `${body.slice(0, lineEnd + 1)}\n${content}\n${body.slice(lineEnd + 1)}`;
}

function templateForType(vaultRoot, definition) {
  const templatePath = path.join(vaultRoot, 'Templates', definition.template);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Missing note template: ${templatePath}`);
  }
  return fs.readFileSync(templatePath, 'utf8');
}

function endOfLine(text, start) {
  const newline = text.indexOf('\n', start);
  return newline === -1 ? text.length : newline + 1;
}

function validateScaffoldFrontmatter(frontmatter, type, templateName) {
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new Error(`${templateName}: scaffold YAML must be a mapping`);
  }
  if (frontmatter.schema_version !== 1 && frontmatter.schema_version !== '1') {
    throw new Error(`${templateName}: scaffold schema_version must be 1`);
  }
  if (frontmatter.type !== type) {
    throw new Error(`${templateName}: scaffold type must be ${type}`);
  }
  for (const field of ['title', 'status', 'date']) {
    if (typeof frontmatter[field] !== 'string' || !frontmatter[field].trim()) {
      throw new Error(`${templateName}: scaffold ${field} must be a non-empty string`);
    }
  }
  if (
    !Array.isArray(frontmatter.tags)
    || frontmatter.tags.length === 0
    || frontmatter.tags.some((tag) => typeof tag !== 'string' || !tag.trim())
  ) {
    throw new Error(`${templateName}: scaffold tags must be a non-empty array of strings`);
  }
}

function parseMarkedScaffold(template, type, templateName) {
  let parsedTemplate;
  try {
    parsedTemplate = splitFrontmatter(template);
  } catch (error) {
    throw new Error(`${templateName}: invalid template or scaffold YAML: ${error.message}`);
  }
  const { frontmatter: templateFrontmatter, body } = parsedTemplate;
  if (!templateFrontmatter) {
    throw new Error(`${templateName}: template is missing frontmatter`);
  }
  const outsideLines = markdownLinesOutsideFences(body);
  const starts = outsideLines.filter(({ line }) => line.trim() === scaffoldStartMarker);
  const ends = outsideLines.filter(({ line }) => line.trim() === scaffoldEndMarker);
  if (starts.length !== 1 || ends.length !== 1 || starts[0].start >= ends[0].start) {
    throw new Error(`${templateName}: requires exactly one ordered scaffold marker pair`);
  }

  const startContent = endOfLine(body, starts[0].start);
  const markedContent = body.slice(startContent, ends[0].start).trim();
  const fenceMatch = markedContent.match(/^```yaml[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/);
  if (!fenceMatch) {
    throw new Error(`${templateName}: scaffold markers must enclose exactly one \`\`\`yaml fenced mapping`);
  }
  const scaffoldText = fenceMatch[1].trim();
  let scaffold;
  try {
    scaffold = loadFrontmatter(scaffoldText);
  } catch (error) {
    throw new Error(`${templateName}: invalid scaffold YAML: ${error.message}`);
  }
  validateScaffoldFrontmatter(scaffold, type, templateName);

  const bodyAfterMarker = endOfLine(body, ends[0].start);
  const strippedBody = `${body.slice(0, starts[0].start)}${body.slice(bodyAfterMarker)}`
    .trim();
  return { scaffold, body: strippedBody };
}

function replaceFirstH1(body, title) {
  const heading = markdownLinesOutsideFences(body)
    .find(({ line }) => /^ {0,3}#[ \t]+[^\n]+$/.test(line));
  if (!heading) {
    return `# ${title}\n\n${body.trimStart()}`;
  }
  const lineEnd = endOfLine(body, heading.start);
  const newline = lineEnd > body.length ? '' : '\n';
  return `${body.slice(0, heading.start)}# ${title}${newline}${body.slice(lineEnd)}`;
}

function buildNoteBody(vaultRoot, type, title, summary, definition) {
  const template = templateForType(vaultRoot, definition);
  const parsed = parseMarkedScaffold(template, type, definition.template);
  let nextBody = replaceFirstH1(parsed.body, title);
  nextBody = insertIntoSection(nextBody, definition.summarySection, summary);
  return { scaffold: parsed.scaffold, body: nextBody.trimEnd() };
}

function replaceOrAppendH2Section(body, sectionName, content) {
  const escapedName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingPattern = new RegExp(`^ {0,3}##[ \\t]+${escapedName}[ \\t]*$`);
  const outsideLines = markdownLinesOutsideFences(body);
  const heading = outsideLines.find((entry) => headingPattern.test(entry.line));
  const replacement = `## ${sectionName}\n\n${content}`;
  if (!heading) {
    return `${body.trimEnd()}\n\n${replacement}`;
  }
  const nextHeading = outsideLines.find((entry) =>
    entry.start > heading.start && /^ {0,3}##[ \t]+[^\n]+$/.test(entry.line)
  );
  const parts = [
    body.slice(0, heading.start).trimEnd(),
    replacement,
    nextHeading ? body.slice(nextHeading.start).trimEnd() : ''
  ].filter(Boolean);
  return parts.join('\n\n');
}

function hasH2OutsideFences(body, headingPattern) {
  return markdownLinesOutsideFences(body)
    .some(({ line }) => headingPattern.test(line));
}

function textWithAppendedLine(filePath, initialHeading, line) {
  let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : `${initialHeading}\n\n`;
  if (!text.endsWith('\n')) {
    text += '\n';
  }
  return `${text}${line}\n`;
}

function dailyLineMinutes(line) {
  const match = line.match(/^- (\d{2}):(\d{2})(?: [A-Z]{2,5})?: /);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? (hours * 60) + minutes : null;
}

function textWithChronologicalDailyLine(filePath, initialHeading, line) {
  let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : `${initialHeading}\n\n`;
  if (!text.endsWith('\n')) {
    text += '\n';
  }
  const lines = text.split('\n');
  const newMinutes = dailyLineMinutes(line);
  if (newMinutes == null) {
    throw new Error(`Invalid generated daily entry timestamp: ${line}`);
  }
  let insertion = lines.length - 1;
  for (let index = 0; index < lines.length; index += 1) {
    const existingMinutes = dailyLineMinutes(lines[index]);
    if (existingMinutes != null && existingMinutes > newMinutes) {
      insertion = index;
      break;
    }
  }
  lines.splice(insertion, 0, line);
  return lines.join('\n');
}

function atomicWriteFiles(writes) {
  const uniquePaths = new Set();
  const staged = [];
  const committed = [];
  for (const write of writes) {
    const targetPath = path.resolve(write.filePath);
    if (uniquePaths.has(targetPath)) {
      throw new Error(`Duplicate atomic write target: ${targetPath}`);
    }
    uniquePaths.add(targetPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const token = `${process.pid}-${randomUUID()}`;
    const tempPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${token}.tmp`);
    const backupPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${token}.bak`);
    const existed = fs.existsSync(targetPath);
    const mode = existed ? fs.statSync(targetPath).mode & 0o7777 : null;
    try {
      fs.writeFileSync(tempPath, write.content, mode == null ? undefined : { mode });
      if (mode != null) {
        fs.chmodSync(tempPath, mode);
      }
      staged.push({ targetPath, tempPath, backupPath, existed });
    } catch (error) {
      for (const item of staged) {
        fs.rmSync(item.tempPath, { force: true });
      }
      fs.rmSync(tempPath, { force: true });
      throw error;
    }
  }

  try {
    for (const item of staged) {
      if (item.existed) {
        fs.renameSync(item.targetPath, item.backupPath);
      }
      try {
        fs.renameSync(item.tempPath, item.targetPath);
      } catch (error) {
        if (item.existed && fs.existsSync(item.backupPath)) {
          fs.renameSync(item.backupPath, item.targetPath);
        }
        throw error;
      }
      committed.push(item);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const item of [...committed].reverse()) {
      try {
        fs.rmSync(item.targetPath, { force: true });
        if (item.existed && fs.existsSync(item.backupPath)) {
          fs.renameSync(item.backupPath, item.targetPath);
        }
      } catch (rollbackError) {
        rollbackErrors.push(`${item.targetPath}: ${rollbackError.message}`);
      }
    }
    for (const item of staged) {
      fs.rmSync(item.tempPath, { force: true });
      if (item.existed && fs.existsSync(item.backupPath) && !fs.existsSync(item.targetPath)) {
        try {
          fs.renameSync(item.backupPath, item.targetPath);
        } catch (rollbackError) {
          rollbackErrors.push(`${item.targetPath}: ${rollbackError.message}`);
        }
      }
    }
    if (rollbackErrors.length > 0) {
      throw new Error(`${error.message}; rollback also failed: ${rollbackErrors.join('; ')}`);
    }
    throw error;
  }

  for (const item of staged) {
    fs.rmSync(item.backupPath, { force: true });
  }
}

function dailyInitialText(date, appLink) {
  const frontmatter = {
    title: date,
    schema_version: 1,
    daily_format: 2,
    type: 'daily',
    status: 'active',
    date,
    tags: ['notes/daily'],
    related_apps: [appLink]
  };
  return `---\n${dumpFrontmatter(frontmatter)}\n---\n\n# ${date}`;
}

function routeToJson(route) {
  const noteSummary = (rel) => {
    const note = route.graph.noteByRel.get(rel);
    return { rel, title: getNoteTitle(note, rel) };
  };
  return {
    process: noteSummary(route.processRel),
    statuses: route.statusRels.map(noteSummary),
    runbooks: route.runbookRels.map(noteSummary),
    decisions: route.decisionRels.map(noteSummary),
    evidence: route.evidenceRels.map(noteSummary)
  };
}

function formatRoute(route, options = {}) {
  const config = getConfig(options.env || process.env);
  const appName = config.appName || 'My Project';
  const processTitle = getNoteTitle(route.processNote, route.processRel);
  const statusTitles = route.statusRels.map((rel) => getNoteTitle(route.graph.noteByRel.get(rel), rel));
  const runbookTitles = route.runbookRels.map((rel) => getNoteTitle(route.graph.noteByRel.get(rel), rel));
  const decisionTitles = route.decisionRels.map((rel) => getNoteTitle(route.graph.noteByRel.get(rel), rel));
  const evidenceTitles = route.evidenceRels.map((rel) => getNoteTitle(route.graph.noteByRel.get(rel), rel));
  const chain = [
    'Start Here',
    appName,
    processTitle,
    ...statusTitles,
    ...runbookTitles,
    ...decisionTitles,
    ...evidenceTitles.slice(0, 1)
  ];
  const lines = [
    chain.join(' -> '),
    '',
    `Process: ${linkForRel(route.processRel, processTitle)}`
  ];
  if (route.statusRels.length > 0) {
    lines.push('Status:');
    for (const rel of route.statusRels) {
      lines.push(`- ${linkForRel(rel, getNoteTitle(route.graph.noteByRel.get(rel), rel))}`);
    }
  }
  if (route.runbookRels.length > 0) {
    lines.push('Runbooks:');
    for (const rel of route.runbookRels) {
      lines.push(`- ${linkForRel(rel, getNoteTitle(route.graph.noteByRel.get(rel), rel))}`);
    }
  }
  if (route.decisionRels.length > 0) {
    lines.push('Decisions:');
    for (const rel of route.decisionRels) {
      lines.push(`- ${linkForRel(rel, getNoteTitle(route.graph.noteByRel.get(rel), rel))}`);
    }
  }
  if (route.evidenceRels.length > 0) {
    lines.push('Evidence:');
    for (const rel of route.evidenceRels) {
      lines.push(`- ${linkForRel(rel, getNoteTitle(route.graph.noteByRel.get(rel), rel))}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function printRoute(args, options = {}) {
  const query = args._.join(' ').trim();
  if (!query) {
    throw new Error('Missing route query');
  }
  const route = buildRoute(query, options);
  if (route.error) {
    throw new Error(route.error);
  }
  return args.json ? `${JSON.stringify(routeToJson(route), null, 2)}\n` : formatRoute(route, options);
}

function frontmatterLinksForRels(route, rels) {
  return rels.map((rel) => linkForRel(rel, getNoteTitle(route.graph.noteByRel.get(rel), rel)));
}

function optionalArg(args, name) {
  if (!Object.prototype.hasOwnProperty.call(args, name)) {
    return null;
  }
  return requireArg(args, name);
}

function processTargets(frontmatter, graph) {
  return (Array.isArray(frontmatter?.related_processes) ? frontmatter.related_processes : [])
    .flatMap((value) => typeof value === 'string' ? extractWikilinkTargets(value) : [])
    .map((target) => resolveTargetDetailed(target, graph.index))
    .map((resolution) => resolution.status === 'resolved' ? resolution.rel : null)
    .filter(Boolean);
}

function statusAlreadyClaimsProcess(graph, processRel) {
  return graph.notes.find((note) =>
    !isTemplate(note.rel)
    && note.frontmatter?.type === 'status'
    && processTargets(note.frontmatter, graph).includes(processRel)
  );
}

function configPathForEnv(env) {
  return path.resolve(
    env.PROJECT_NOTES_CONFIG || path.join(getRepoRoot(env), 'notes-graph.config.json')
  );
}

function prospectiveProcessConfig(config, graph, title, noteRel) {
  const normalizedTitle = normalizeInput(title);
  if (!normalizedTitle) {
    throw new Error('Process title must contain letters or numbers');
  }
  const duplicateTitle = graph.notes.find((note) =>
    !isTemplate(note.rel)
    && note.frontmatter?.type === 'process'
    && normalizeInput(getNoteTitle(note, note.rel)) === normalizedTitle
  );
  if (duplicateTitle) {
    throw new Error(`Process title already exists: ${duplicateTitle.rel}`);
  }
  if (graph.noteByRel.has(noteRel)) {
    throw new Error(`Process path already exists: ${noteRel}`);
  }

  if (config.routes != null && !Array.isArray(config.routes)) {
    throw new Error('notes-graph.config.json: routes must be an array');
  }
  const routes = Array.isArray(config.routes) ? config.routes : [];
  const routeId = normalizedTitle.replace(/ /g, '-');
  const duplicateId = routes.find((route) =>
    typeof route?.id === 'string' && normalizeInput(route.id) === normalizeInput(routeId)
  );
  if (duplicateId) {
    throw new Error(`Process route id collides with route "${duplicateId.id}": ${routeId}`);
  }
  const duplicateAlias = routes.find((route) =>
    Array.isArray(route?.aliases)
    && route.aliases.some((alias) =>
      typeof alias === 'string' && normalizeInput(alias) === normalizedTitle
    )
  );
  if (duplicateAlias) {
    throw new Error(`Process route alias collides with route "${duplicateAlias.id}": ${title}`);
  }

  const nextRoutes = [
    ...routes,
    {
      id: routeId,
      processRel: noteRel,
      aliases: [title]
    }
  ];
  const prospectiveNote = {
    rel: noteRel,
    frontmatter: {
      title,
      type: 'process'
    }
  };
  const prospectiveNotes = [...graph.notes, prospectiveNote];
  const byPath = new Map(graph.index.byPath);
  const byBasename = new Map(
    [...graph.index.byBasename].map(([key, candidates]) => [key, [...candidates]])
  );
  const noteKey = noteKeyForRel(noteRel);
  byPath.set(noteKey.toLowerCase(), noteRel);
  const basenameKey = path.basename(noteKey).toLowerCase();
  const basenameCandidates = byBasename.get(basenameKey) || [];
  basenameCandidates.push(noteRel);
  basenameCandidates.sort();
  byBasename.set(basenameKey, basenameCandidates);
  const prospectiveGraph = {
    ...graph,
    notes: prospectiveNotes,
    noteByRel: new Map(graph.noteByRel).set(noteRel, prospectiveNote),
    frontmatterByRel: new Map(graph.frontmatterByRel).set(noteRel, prospectiveNote.frontmatter),
    index: { byPath, byBasename }
  };
  const routeErrors = validateRouteDefinitions(
    nextRoutes,
    prospectiveGraph,
    { requireExistingProcessTargets: true }
  );
  if (routeErrors.length > 0) {
    throw new Error(`Cannot add process route: ${routeErrors.join('; ')}`);
  }
  return { ...config, routes: nextRoutes };
}

function createNewNote(args, options = {}) {
  const env = options.env || process.env;
  const vaultRoot = getVaultRoot({ env, vaultRoot: options.vaultRoot });
  const config = getConfig(env);
  const appName = options.appName || config.appName || 'My Project';
  const appRel = config.appRel || `Apps/${appName}.md`;
  const appLink = linkForRel(appRel, appName);
  const title = requireArg(args, 'title');
  const type = args.type || 'task';
  const definition = noteTypeDefinitions[type];
  if (!definition) {
    throw new Error(`--type must be one of ${Object.keys(noteTypeDefinitions).join(', ')}`);
  }
  const processInput = definition.requiresProcess
    ? requireArg(args, 'process')
    : optionalArg(args, 'process');
  const runbookInput = optionalArg(args, 'runbook');
  if (runbookInput && !processInput) {
    throw new Error('--runbook requires --process');
  }
  const graph = loadVaultGraph({ env, vaultRoot });
  const route = processInput
    ? buildRoute(processInput, { env, vaultRoot, graph, runbook: runbookInput })
    : null;
  if (route?.error) {
    throw new Error(route.error);
  }
  if (runbookInput && route.runbookRels.length === 0) {
    throw new Error(`No runbook matched "${runbookInput}"`);
  }
  if (type === 'status') {
    const existingStatus = statusAlreadyClaimsProcess(graph, route.processRel);
    if (existingStatus) {
      throw new Error(`Process already has a Status note: ${existingStatus.rel}`);
    }
  }

  const now = options.now || new Date();
  const { date } = currentDateParts(now);
  const notePath = notePathForType(vaultRoot, date, title, definition);
  const noteRel = path.relative(vaultRoot, notePath).split(path.sep).join('/');
  const processTitle = route ? getNoteTitle(route.processNote, route.processRel) : null;
  const processLink = route ? linkForRel(route.processRel, processTitle) : null;
  const runbookLinks = route ? frontmatterLinksForRels(route, route.runbookRels) : [];
  const decisionLinks = route ? frontmatterLinksForRels(route, route.decisionRels) : [];
  const { scaffold, body } = buildNoteBody(vaultRoot, type, title, args.summary || '', definition);
  const frontmatter = {
    ...scaffold,
    title,
    schema_version: 1,
    type,
    status: definition.status,
    ...(type === 'evidence' ? {
      evidence_format: 2,
      topic: optionalArg(args, 'topic') || title,
      verification: 'unverified'
    } : {}),
    date,
    app: appName,
    source_of_truth: type === 'status',
    ...(type === 'status' ? { last_verified: date } : {}),
    confidence: 'medium',
    created_by: 'project-notes-cli',
    related_apps: [appLink],
    related_processes: processLink ? [processLink] : [],
    related_runbooks: runbookLinks,
    related_decisions: decisionLinks,
    ...(type === 'evidence' ? { verdict_decision: null, follow_up: null } : {})
  };
  const statusLinks = route ? frontmatterLinksForRels(route, route.statusRels) : [];
  const graphLinks = [
    `- Status: ${statusLinks.join(', ') || 'None selected'}`,
    `- Decisions: ${decisionLinks.join(', ') || 'None selected'}`
  ].join('\n');
  const noteText = `---\n${dumpFrontmatter(frontmatter)}\n---\n\n${replaceOrAppendH2Section(body, 'Graph Links', graphLinks)}\n`;

  const writes = [{ filePath: notePath, content: noteText }];

  let nextConfig = null;
  if (type === 'process') {
    nextConfig = prospectiveProcessConfig(config, graph, title, noteRel);
    writes.push({
      filePath: configPathForEnv(env),
      content: `${JSON.stringify(nextConfig, null, 2)}\n`
    });
  }
  atomicWriteFiles(writes);

  return {
    notePath,
    noteRel,
    dailyPath: null,
    route: route ? routeToJson(route) : null,
    config: nextConfig
  };
}

function resolveNotePath(input, vaultRoot) {
  const candidates = [];
  if (path.isAbsolute(input)) {
    candidates.push(input);
  } else {
    candidates.push(path.resolve(process.cwd(), input));
    candidates.push(path.join(vaultRoot, input));
    candidates.push(path.join(path.dirname(vaultRoot), input));
  }
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found || candidates[0];
}

function realPath(filePath) {
  return fs.realpathSync.native ? fs.realpathSync.native(filePath) : fs.realpathSync(filePath);
}

function isPathWithin(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === ''
    || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function replaceOrAppendH2SectionWithHistory(body, sectionName, entry) {
  const escapedName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingPattern = new RegExp(`^ {0,3}##[ \\t]+${escapedName}[ \\t]*$`);
  const outsideLines = markdownLinesOutsideFences(body);
  const heading = outsideLines.find((item) => headingPattern.test(item.line));
  if (!heading) {
    return `${body.trimEnd()}\n\n## ${sectionName}\n\n${entry}`;
  }
  const lineEnd = endOfLine(body, heading.start);
  return `${body.slice(0, lineEnd)}\n${entry}\n\n${body.slice(lineEnd).trimStart()}`.trimEnd();
}

function statusUpdateArgs(args) {
  const requiredFields = ['status', 'phase', 'certified', 'settled'];
  const optionalFields = ['open', 'open-item', 'close-item'];
  const present = [...requiredFields, ...optionalFields]
    .filter((field) => Object.prototype.hasOwnProperty.call(args, field));
  if (present.length === 0) {
    return null;
  }
  const missing = requiredFields.filter((field) => !Object.prototype.hasOwnProperty.call(args, field));
  if (missing.length > 0) {
    throw new Error(`Status update requires ${requiredFields.map((field) => `--${field}`).join(', ')}`);
  }
  if (args.open != null && (args['open-item'] != null || args['close-item'] != null)) {
    throw new Error('Use either legacy --open or structured --open-item/--close-item, not both');
  }
  return {
    ...Object.fromEntries(requiredFields.map((field) => [field, requireArg(args, field)])),
    open: optionalArg(args, 'open'),
    openItem: optionalArg(args, 'open-item'),
    closeItem: optionalArg(args, 'close-item')
  };
}

function parseOpenItem(value) {
  if (!value) {
    return null;
  }
  const separator = value.indexOf(':');
  if (separator === -1) {
    throw new Error('--open-item must use "id: summary"');
  }
  const id = value.slice(0, separator).trim();
  const summary = value.slice(separator + 1).trim();
  if (!receiptIdPattern.test(id) || !summary) {
    throw new Error('--open-item id must be lowercase kebab-case and include a summary');
  }
  return { id, summary };
}

function parseCloseItems(value) {
  if (!value) {
    return [];
  }
  const ids = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (ids.length === 0 || ids.some((id) => !receiptIdPattern.test(id))) {
    throw new Error('--close-item must be one or more lowercase kebab-case IDs separated by commas');
  }
  return [...new Set(ids)];
}

function renderOpenItemsBlock(items) {
  const yamlText = dumpFrontmatter({ items }).trimEnd();
  return `${openItemStartMarker}\n\`\`\`yaml\n${yamlText}\n\`\`\`\n${openItemEndMarker}`;
}

function replaceOpenItemsBlock(body, items) {
  const start = body.indexOf(openItemStartMarker);
  const end = body.indexOf(openItemEndMarker, start + openItemStartMarker.length);
  if (start === -1 || end === -1) {
    return replaceOrAppendH2Section(body, 'Open Items', renderOpenItemsBlock(items));
  }
  const afterEnd = end + openItemEndMarker.length;
  return `${body.slice(0, start)}${renderOpenItemsBlock(items)}${body.slice(afterEnd)}`;
}

function resolveDecisionInput(input, vaultRoot, graph) {
  const decisionPath = resolveNotePath(input, vaultRoot);
  if (!fs.existsSync(decisionPath)) {
    throw new Error(`Missing Decision note: ${input}`);
  }
  const realVaultRoot = realPath(vaultRoot);
  const realDecisionPath = realPath(decisionPath);
  if (!isPathWithin(realVaultRoot, realDecisionPath)) {
    throw new Error(`Decision note is outside vault: ${input}`);
  }
  const decisionRel = path.relative(realVaultRoot, realDecisionPath).split(path.sep).join('/');
  const decision = graph.noteByRel.get(decisionRel);
  if (!decision?.frontmatter || decision.frontmatter.type !== 'decision') {
    throw new Error(`Not a Decision note: ${input}`);
  }
  return linkForRel(decisionRel, getNoteTitle(decision, decisionRel));
}

function updateStructuredOpenItems(statusBody, statusRel, statusUpdate, noteRel, title, date) {
  const parsed = extractOpenItemsBlock(statusBody);
  if (parsed.errors.length > 0 || !parsed.items) {
    throw new Error(`Invalid structured Open Items in ${statusRel}: ${parsed.errors.join('; ') || 'missing open-items block'}`);
  }
  const items = parsed.items.map((item) => ({ ...item }));
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !receiptIdPattern.test(item.id) || typeof item.summary !== 'string' || !item.summary.trim()) {
      throw new Error(`Invalid structured Open Item in ${statusRel}`);
    }
    if (ids.has(item.id)) {
      throw new Error(`Duplicate Open Item ID in ${statusRel}: ${item.id}`);
    }
    ids.add(item.id);
  }
  const opened = parseOpenItem(statusUpdate.openItem);
  if (opened) {
    if (ids.has(opened.id)) {
      throw new Error(`Open Item already exists in ${statusRel}: ${opened.id}`);
    }
    items.push({
      id: opened.id,
      summary: opened.summary,
      state: 'open',
      opened_by: linkForRel(noteRel, title)
    });
    ids.add(opened.id);
  }
  const closingIds = parseCloseItems(statusUpdate.closeItem);
  for (const id of closingIds) {
    if (!ids.has(id)) {
      throw new Error(`Open Item does not exist in ${statusRel}: ${id}`);
    }
  }
  const updatedItems = items.map((item) => closingIds.includes(item.id)
    ? { ...item, state: 'closed', closed_by: linkForRel(noteRel, title) }
    : item
  );
  let body = replaceOpenItemsBlock(statusBody, updatedItems);
  for (const id of closingIds) {
    body = replaceOrAppendH2SectionWithHistory(
      body,
      'Recently Closed Open Items',
      `- ${date}: \`${id}\` — closed by ${linkForRel(noteRel, title)}`
    );
  }
  return body;
}

function resolveStatusUpdate(statusInput, vaultRoot, graph, closedFrontmatter) {
  const statusPath = resolveNotePath(statusInput, vaultRoot);
  if (!fs.existsSync(statusPath)) {
    throw new Error(`Missing Status note: ${statusInput}`);
  }
  const realVaultRoot = realPath(vaultRoot);
  const realStatusPath = realPath(statusPath);
  if (!isPathWithin(realVaultRoot, realStatusPath)) {
    throw new Error(`Status note is outside vault: ${statusInput}`);
  }
  const statusRel = path.relative(realVaultRoot, realStatusPath).split(path.sep).join('/');
  const original = fs.readFileSync(realStatusPath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(original);
  if (!frontmatter || frontmatter.type !== 'status') {
    throw new Error(`Not a Status note: ${statusInput}`);
  }
  const statusProcesses = processTargets(frontmatter, graph);
  if (statusProcesses.length !== 1) {
    throw new Error(`Status note must link exactly one process: ${statusInput}`);
  }
  const closedProcesses = processTargets(closedFrontmatter, graph);
  if (closedProcesses.length > 0 && !closedProcesses.includes(statusProcesses[0])) {
    throw new Error(`Status note process does not match closed note: ${statusInput}`);
  }
  return { realStatusPath, statusRel, frontmatter, body };
}

function closeoutNote(args, options = {}) {
  const env = options.env || process.env;
  const vaultRoot = getVaultRoot({ env, vaultRoot: options.vaultRoot });
  const config = getConfig(env);
  const appName = options.appName || config.appName || 'My Project';
  const appRel = config.appRel || `Apps/${appName}.md`;
  const appLink = linkForRel(appRel, appName);
  const noteInput = requireArg(args, 'note');
  const working = requireArg(args, 'working');
  const verified = requireArg(args, 'verified');
  const notVerified = requireArg(args, 'not-verified');
  const statusUpdate = statusUpdateArgs(args);
  const notePath = resolveNotePath(noteInput, vaultRoot);
  if (!fs.existsSync(notePath)) {
    throw new Error(`Missing note: ${noteInput}`);
  }
  const realVaultRoot = realPath(vaultRoot);
  const realNotePath = realPath(notePath);
  if (!isPathWithin(realVaultRoot, realNotePath)) {
    throw new Error(`Note is outside vault: ${noteInput}`);
  }
  const noteRel = path.relative(realVaultRoot, realNotePath).split(path.sep).join('/');
  const original = fs.readFileSync(realNotePath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(original);
  if (!frontmatter) {
    throw new Error(`Note is missing frontmatter: ${noteInput}`);
  }
  if (hasH2OutsideFences(body, /^ {0,3}##[ \t]+Closeout(?:[ \t]+.*)?[ \t]*$/)) {
    throw new Error(`Note already contains a closeout: ${noteInput}`);
  }
  const evidenceFormat = frontmatter.type === 'evidence'
    && (frontmatter.evidence_format === 2 || frontmatter.evidence_format === '2');
  const verdict = evidenceFormat ? requireArg(args, 'verdict') : optionalArg(args, 'verdict');
  const needsGraph = Boolean(statusUpdate || args.decision || evidenceFormat);
  const graph = needsGraph ? loadVaultGraph({ env, vaultRoot }) : null;
  if (evidenceFormat && !args.decision) {
    throw new Error('Structured evidence closeout requires --decision pointing to the current Decision note');
  }
  const verdictDecision = args.decision
    ? resolveDecisionInput(requireArg(args, 'decision'), vaultRoot, graph)
    : null;
  const now = options.now || new Date();
  const { date, time, timeZoneName } = currentDateParts(now);
  const status = evidenceFormat ? 'done' : args.certify ? 'verified' : 'done';
  const nextFrontmatter = {
    ...frontmatter,
    status,
    last_verified: date,
    ...(evidenceFormat ? {
      verification: args.certify ? 'verified' : 'unverified',
      verdict_decision: verdictDecision
    } : {})
  };
  const title = frontmatter.title || path.basename(realNotePath, '.md');
  const closeout = [
    '',
    '',
    `## Closeout ${date} ${time} ${timeZoneName}`,
    '',
    `- Working: ${working}`,
    `- Verified: ${verified}`,
    `- Not verified: ${notVerified}`
  ].join('\n');
  const nextBody = evidenceFormat
    ? replaceOrAppendH2Section(body, 'Current Verdict', `${verdict}\n\nDecision: ${verdictDecision}`)
    : body;
  const nextText = `---\n${dumpFrontmatter(nextFrontmatter)}\n---\n${nextBody.trimEnd()}${closeout}\n`;

  const statusNote = statusUpdate
    ? resolveStatusUpdate(statusUpdate.status, vaultRoot, graph, frontmatter)
    : null;
  const nextStatusText = statusNote
    ? (() => {
        const phaseCloseout = `- ${date}: ${linkForRel(noteRel, title)} — ${statusUpdate.phase}`;
        const structuredStatus = statusNote.frontmatter.status_format === 2
          || statusNote.frontmatter.status_format === '2';
        if (structuredStatus && !verdictDecision) {
          throw new Error('Structured Status updates require --decision pointing to the settled Decision note');
        }
        if (structuredStatus && statusUpdate.open) {
          throw new Error('Structured Status notes use --open-item and --close-item, not --open');
        }
        if (!structuredStatus && !statusUpdate.open) {
          throw new Error('Legacy Status updates require --open');
        }
        let statusBody = replaceOrAppendH2Section(statusNote.body, 'Current Phase', statusUpdate.phase);
        statusBody = replaceOrAppendH2Section(statusBody, 'Certified', `- ${statusUpdate.certified}`);
        statusBody = structuredStatus
          ? updateStructuredOpenItems(statusBody, statusNote.statusRel, statusUpdate, noteRel, title, date)
          : replaceOrAppendH2Section(statusBody, 'Open', `- ${statusUpdate.open}`);
        statusBody = replaceOrAppendH2Section(
          statusBody,
          'Settled Verdicts',
          structuredStatus ? `- ${verdictDecision}: ${statusUpdate.settled}` : `- ${statusUpdate.settled}`
        );
        statusBody = replaceOrAppendH2SectionWithHistory(statusBody, 'Recent Phase Closeouts', phaseCloseout);
        const statusFrontmatter = {
          ...statusNote.frontmatter,
          status: 'current',
          source_of_truth: true,
          last_verified: date,
          last_updated: date
        };
        return `---\n${dumpFrontmatter(statusFrontmatter)}\n---\n${statusBody.trimEnd()}\n`;
      })()
    : null;

  const dailyPath = path.join(vaultRoot, `${date}.md`);
  const dailyText = textWithChronologicalDailyLine(
    dailyPath,
    dailyInitialText(date, appLink),
    `- ${time} ${timeZoneName}: ${verdict || working} — ${linkForRel(noteRel, title)}`
  );
  const writes = [
    { filePath: realNotePath, content: nextText },
    { filePath: dailyPath, content: dailyText }
  ];
  if (statusNote) {
    writes.push({ filePath: statusNote.realStatusPath, content: nextStatusText });
  }
  atomicWriteFiles(writes);

  return { notePath: realNotePath, noteRel, dailyPath, status, statusRel: statusNote?.statusRel || null };
}

function main(argv = process.argv.slice(2), options = {}) {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return printHelp();
  }
  if (!Object.prototype.hasOwnProperty.call(commandOptions, command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  const args = parseArgs(rest, command);
  if (args.help) {
    return printHelp();
  }
  if (command === 'route') {
    return printRoute(args, options);
  }
  if (command === 'new') {
    const result = createNewNote(args, options);
    const configOutput = result.config ? 'Updated notes-graph.config.json\n' : '';
    return `Created ${result.noteRel}\n${configOutput}`;
  }
  if (command === 'closeout') {
    const result = closeoutNote(args, options);
    const statusOutput = result.statusRel ? `Updated ${result.statusRel}\n` : '';
    return `Closed ${result.noteRel}\n${statusOutput}Updated ${noteKeyForRel(path.basename(result.dailyPath))}.md\n`;
  }
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
  printRoute,
  createNewNote,
  closeoutNote,
  main,
  sanitizeFileTitle,
  replaceOrAppendH2Section,
  hasH2OutsideFences,
  noteTypeDefinitions,
  parseMarkedScaffold,
  atomicWriteFiles
};
