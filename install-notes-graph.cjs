#!/usr/bin/env node

// Installs or upgrades the notes graph kit in a target repo.
//
// The helper scripts are fully config-driven (notes-graph.config.json plus
// PROJECT_NOTES_* env overrides), so this installer copies them verbatim.
// Placeholder substitution ("My Project", vault folder name) happens only in
// the kit-owned vault skeleton files.

const fs = require('node:fs');
const path = require('node:path');

const kitRoot = __dirname;
const kitVersion = JSON.parse(fs.readFileSync(path.join(kitRoot, 'package.json'), 'utf8')).version;

const PLACEHOLDER_APP = 'My Project';
const SKELETON_VAULT_DIR = 'Project Notes';
const DATED_NOTE_RE = /^\d{4}-\d{2}-\d{2}(?: .+)?\.md$/;
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;
const WIKILINK_DELIMITER_RE = /[\[\]|]/;

const MANAGED_SCRIPTS = [
  'scripts/project-notes.cjs',
  'scripts/validate-project-notes-graph.cjs',
  'scripts/lib/project-notes-graph.cjs'
];

const NOTES_NPM_SCRIPTS = {
  notes: 'node scripts/project-notes.cjs',
  'notes:route': 'node scripts/project-notes.cjs route',
  'notes:new': 'node scripts/project-notes.cjs new',
  'notes:closeout': 'node scripts/project-notes.cjs closeout',
  'notes:validate': 'node scripts/validate-project-notes-graph.cjs'
};

function usage() {
  return `Notes graph kit installer (kit version ${kitVersion})

Usage:
  node install-notes-graph.cjs --repo /path/to/repo --app "App Name" [--vault "Project Notes"] [--force] [--dry-run]
  node install-notes-graph.cjs --repo /path/to/repo --upgrade [--dry-run]

Options:
  --repo      Target repository root. Defaults to current working directory.
  --app       App/product name (required for install).
  --vault     Vault directory name. Defaults to "Project Notes".
  --upgrade   Re-copy kit-managed scripts and bump kitVersion in the target
              config. Never touches vault content.
  --force     Overwrite existing kit-managed files on install.
  --dry-run   Print planned writes without changing files.
`;
}

function parseArgs(argv) {
  const parsed = { _: [] };
  const booleanFlags = new Set(['force', 'dry-run', 'upgrade', 'help']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      parsed._.push(arg);
      continue;
    }
    const equalsIndex = arg.indexOf('=');
    if (equalsIndex !== -1) {
      parsed[arg.slice(2, equalsIndex)] = arg.slice(equalsIndex + 1);
      continue;
    }
    const key = arg.slice(2);
    if (booleanFlags.has(key)) {
      parsed[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function fileBaseForApp(appName) {
  const sanitized = String(appName)
    .replace(/[\\/:*?"<>|[\]#^\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new Error(`App name "${appName}" does not produce a usable file name`);
  }
  return sanitized;
}

function validateAppName(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Missing required --app "App Name"');
  }
  const appName = value.trim();
  if (CONTROL_CHAR_RE.test(appName)) {
    throw new Error('--app must be a single-line app name without control characters');
  }
  if (WIKILINK_DELIMITER_RE.test(appName)) {
    throw new Error('--app must not contain [, ], or | because those characters break Obsidian wikilinks');
  }
  fileBaseForApp(appName);
  return appName;
}

function yamlDoubleQuoted(value) {
  return JSON.stringify(String(value));
}

function replaceAppPlaceholders(content, appName, appFileBase) {
  const appLink = `[[Apps/${appFileBase}|${appName}]]`;
  const sentinels = {
    quotedAppLink: '\u0000NOTES_GRAPH_QUOTED_APP_LINK\u0000',
    appLink: '\u0000NOTES_GRAPH_APP_LINK\u0000',
    appPath: '\u0000NOTES_GRAPH_APP_PATH\u0000',
    quotedAppName: '\u0000NOTES_GRAPH_QUOTED_APP_NAME\u0000',
    releaseTitle: '\u0000NOTES_GRAPH_RELEASE_TITLE\u0000',
    appName: '\u0000NOTES_GRAPH_APP_NAME\u0000'
  };

  return content
    .split(`"[[Apps/${PLACEHOLDER_APP}|${PLACEHOLDER_APP}]]"`).join(sentinels.quotedAppLink)
    .split(`[[Apps/${PLACEHOLDER_APP}|${PLACEHOLDER_APP}]]`).join(sentinels.appLink)
    .split(`Apps/${PLACEHOLDER_APP}.md`).join(sentinels.appPath)
    .split(`"${PLACEHOLDER_APP}"`).join(sentinels.quotedAppName)
    .split(`title: ${PLACEHOLDER_APP} Version`).join(sentinels.releaseTitle)
    .split(PLACEHOLDER_APP).join(sentinels.appName)
    .split(sentinels.quotedAppLink).join(yamlDoubleQuoted(appLink))
    .split(sentinels.appLink).join(appLink)
    .split(sentinels.appPath).join(`Apps/${appFileBase}.md`)
    .split(sentinels.quotedAppName).join(yamlDoubleQuoted(appName))
    .split(sentinels.releaseTitle).join(`title: ${yamlDoubleQuoted(`${appName} Version`)}`)
    .split(sentinels.appName).join(appName);
}

function validateVaultDir(value) {
  if (typeof value !== 'string') {
    throw new Error('--vault must be a directory name');
  }
  const vaultDir = value.trim();
  if (!vaultDir) {
    throw new Error('--vault must not be empty');
  }
  if (
    path.isAbsolute(vaultDir)
    || vaultDir === '.'
    || vaultDir === '..'
    || vaultDir.includes('/')
    || vaultDir.includes('\\')
    || vaultDir.split(path.sep).includes('..')
    || /[\r\n]/.test(vaultDir)
  ) {
    throw new Error('--vault must be a simple directory name, not a path');
  }
  return vaultDir;
}

function walk(dirPath) {
  const entries = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      entries.push(...walk(entryPath));
    } else {
      entries.push(entryPath);
    }
  }
  return entries;
}

function isInstallSkeletonRel(rel) {
  const basename = path.posix.basename(rel);
  if (DATED_NOTE_RE.test(basename) && (rel === basename || rel.startsWith('Evidence/'))) {
    return false;
  }
  return true;
}

function buildConfig(appName, vaultDir, appFileBase) {
  return {
    appName,
    vaultDir,
    scriptName: 'project-notes',
    appRel: `Apps/${appFileBase}.md`,
    kitVersion,
    routes: [
      {
        id: 'notes-graph-maintenance',
        processRel: 'Processes/Notes Graph Maintenance.md',
        aliases: ['notes', 'obsidian', 'graph', 'vault', 'notes graph']
      }
    ]
  };
}

function buildVaultWrites(appName, vaultDir, appFileBase) {
  const skeletonRoot = path.join(kitRoot, SKELETON_VAULT_DIR);
  const writes = [];
  for (const filePath of walk(skeletonRoot)) {
    const rel = path.relative(skeletonRoot, filePath).split(path.sep).join('/');
    if (!isInstallSkeletonRel(rel)) {
      continue;
    }
    const targetRel = rel === `Apps/${PLACEHOLDER_APP}.md`
      ? `Apps/${appFileBase}.md`
      : rel;
    const content = replaceAppPlaceholders(fs.readFileSync(filePath, 'utf8'), appName, appFileBase);
    writes.push({ rel: `${vaultDir}/${targetRel}`, content, kind: 'vault' });
  }
  return writes;
}

function buildScriptWrites() {
  return MANAGED_SCRIPTS.map((rel) => ({
    rel,
    content: fs.readFileSync(path.join(kitRoot, rel), 'utf8'),
    kind: 'script'
  }));
}

function mergePackageJson(repoRoot) {
  const packagePath = path.join(repoRoot, 'package.json');
  const exists = fs.existsSync(packagePath);
  const pkg = exists
    ? JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    : { name: path.basename(repoRoot), private: true };
  pkg.scripts = pkg.scripts || {};
  pkg.dependencies = pkg.dependencies || {};
  let changed = !exists;
  for (const [name, command] of Object.entries(NOTES_NPM_SCRIPTS)) {
    if (pkg.scripts[name] !== command) {
      if (pkg.scripts[name] && pkg.scripts[name] !== command) {
        // Preserve a repo's customized notes command; only fill gaps.
        continue;
      }
      pkg.scripts[name] = command;
      changed = true;
    }
  }
  if (!pkg.dependencies['js-yaml'] && !(pkg.devDependencies || {})['js-yaml']) {
    pkg.dependencies['js-yaml'] = '^4.1.0';
    changed = true;
  }
  return changed
    ? { rel: 'package.json', content: `${JSON.stringify(pkg, null, 2)}\n`, kind: 'package' }
    : null;
}

const AGENTS_SECTION_HEADER = '## Project Notes Graph';

function agentsSnippet(appName, vaultDir, appFileBase) {
  const raw = fs.readFileSync(path.join(kitRoot, 'AGENTS-snippet.md'), 'utf8');
  const blockMatch = raw.match(/```md\n([\s\S]*?)```/);
  const block = blockMatch ? blockMatch[1] : raw;
  return replaceAppPlaceholders(block, appName, appFileBase)
    .split(SKELETON_VAULT_DIR).join(vaultDir);
}

function applyAgentsBlock(repoRoot, appName, vaultDir, appFileBase, { dryRun }) {
  const agentsPath = path.join(repoRoot, 'AGENTS.md');
  const section = agentsSnippet(appName, vaultDir, appFileBase).trimEnd();
  const result = { rel: 'AGENTS.md', kind: 'agents' };

  if (fs.existsSync(agentsPath)) {
    const content = fs.readFileSync(agentsPath, 'utf8');
    if (content.includes(AGENTS_SECTION_HEADER)) {
      result.action = 'skip';
      return result;
    }
    const separator = content.endsWith('\n') ? '\n' : '\n\n';
    result.content = `${content}${separator}${section}\n`;
    result.action = 'append';
    if (!dryRun) {
      fs.writeFileSync(agentsPath, result.content);
    }
    return result;
  }

  const title = path.basename(repoRoot);
  result.content = `# ${title}\n\n${section}\n`;
  result.action = 'create';
  if (!dryRun) {
    fs.writeFileSync(agentsPath, result.content);
  }
  return result;
}

function applyWrites(repoRoot, writes, { force, dryRun }) {
  const results = { written: [], skipped: [] };
  for (const write of writes) {
    const targetPath = path.join(repoRoot, write.rel);
    const exists = fs.existsSync(targetPath);
    if (exists && !force) {
      if (write.kind === 'script') {
        throw new Error(`${write.rel} already exists in ${repoRoot}. Use --force to overwrite managed helper scripts.`);
      }
      if (write.kind === 'config') {
        throw new Error(`${write.rel} already exists in ${repoRoot}. Use --upgrade to refresh scripts or --force to reinstall.`);
      }
      if (write.kind === 'package') {
        results.written.push(write.rel);
        if (!dryRun) {
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          fs.writeFileSync(targetPath, write.content);
        }
        continue;
      }
      results.skipped.push(write.rel);
      continue;
    }
    results.written.push(write.rel);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, write.content);
    }
  }
  return results;
}

function assertNoProtectedExistingWrites(repoRoot, writes, { force }) {
  if (force) {
    return;
  }
  const existingScripts = writes
    .filter((write) => write.kind === 'script' && fs.existsSync(path.join(repoRoot, write.rel)))
    .map((write) => write.rel);
  if (existingScripts.length > 0) {
    const verb = existingScripts.length === 1 ? 'exists' : 'exist';
    throw new Error(
      `${existingScripts.join(', ')} already ${verb} in ${repoRoot}. Use --force to overwrite managed helper scripts.`
    );
  }
}

function install(args) {
  const repoRoot = path.resolve(args.repo || process.cwd());
  if (!fs.existsSync(repoRoot)) {
    throw new Error(`Repo does not exist: ${repoRoot}`);
  }
  const appName = validateAppName(args.app);
  const vaultDir = validateVaultDir(args.vault || SKELETON_VAULT_DIR);
  const appFileBase = fileBaseForApp(appName);
  const dryRun = Boolean(args['dry-run']);
  const force = Boolean(args.force);

  const writes = [
    ...buildScriptWrites(),
    {
      rel: 'notes-graph.config.json',
      content: `${JSON.stringify(buildConfig(appName, vaultDir, appFileBase), null, 2)}\n`,
      kind: 'config'
    },
    ...buildVaultWrites(appName, vaultDir, appFileBase)
  ];
  const configExists = fs.existsSync(path.join(repoRoot, 'notes-graph.config.json'));
  if (configExists && !force) {
    throw new Error(
      `notes-graph.config.json already exists in ${repoRoot}. Use --upgrade to refresh scripts or --force to reinstall.`
    );
  }
  const packageWrite = mergePackageJson(repoRoot);
  if (packageWrite) {
    writes.push(packageWrite);
  }

  assertNoProtectedExistingWrites(repoRoot, writes, { force });
  const results = applyWrites(repoRoot, writes, { force, dryRun });
  const agentsResult = applyAgentsBlock(repoRoot, appName, vaultDir, appFileBase, { dryRun });
  const lines = [
    `${dryRun ? '[dry-run] ' : ''}Installed notes graph kit ${kitVersion} into ${repoRoot}`,
    ...results.written.map((rel) => `  write ${rel}`),
    ...results.skipped.map((rel) => `  skip  ${rel} (exists)`),
    agentsResult.action === 'skip'
      ? '  skip  AGENTS.md (Project Notes Graph section exists)'
      : `  ${dryRun ? 'write' : agentsResult.action} AGENTS.md`,
    '',
    'Next steps:',
    '  npm install',
    `  npm run notes:route -- "notes graph"`,
    '  npm run notes:validate'
  ];
  if (agentsResult.action === 'skip') {
    lines.push('', 'AGENTS.md already had a Project Notes Graph section; snippet not changed.');
  }
  return `${lines.join('\n')}\n`;
}

function upgrade(args) {
  const repoRoot = path.resolve(args.repo || process.cwd());
  const configPath = path.join(repoRoot, 'notes-graph.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`No notes-graph.config.json in ${repoRoot}; run an install instead.`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const previousVersion = config.kitVersion || 'unversioned';
  const dryRun = Boolean(args['dry-run']);

  const writes = buildScriptWrites();
  config.kitVersion = kitVersion;
  writes.push({
    rel: 'notes-graph.config.json',
    content: `${JSON.stringify(config, null, 2)}\n`,
    kind: 'config'
  });
  const packageWrite = mergePackageJson(repoRoot);
  if (packageWrite) {
    writes.push(packageWrite);
  }

  const results = applyWrites(repoRoot, writes, { force: true, dryRun });
  const lines = [
    `${dryRun ? '[dry-run] ' : ''}Upgraded notes graph kit ${previousVersion} -> ${kitVersion} in ${repoRoot}`,
    ...results.written.map((rel) => `  write ${rel}`),
    '',
    'Vault content was not touched. Run npm run notes:validate to confirm.'
  ];
  return `${lines.join('\n')}\n`;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    return usage();
  }
  return args.upgrade ? upgrade(args) : install(args);
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
  main,
  parseArgs,
  buildConfig,
  agentsSnippet,
  applyAgentsBlock,
  validateVaultDir,
  validateAppName,
  replaceAppPlaceholders,
  isInstallSkeletonRel,
  assertNoProtectedExistingWrites
};
