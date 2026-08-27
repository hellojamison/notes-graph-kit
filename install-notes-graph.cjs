#!/usr/bin/env node

// Installs or upgrades the notes graph kit in a target repo.
//
// The helper scripts are fully config-driven (notes-graph.config.json plus
// PROJECT_NOTES_* env overrides), so this installer copies them verbatim.
// Placeholder substitution ("My Project", vault folder name) happens only in
// the kit-owned vault skeleton files.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const kitRoot = __dirname;
const kitVersion = JSON.parse(fs.readFileSync(path.join(kitRoot, 'package.json'), 'utf8')).version;

const PLACEHOLDER_APP = 'My Project';
const SKELETON_VAULT_DIR = 'Project Notes';
const DATED_NOTE_RE = /^\d{4}-\d{2}-\d{2}(?: .+)?\.md$/;
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;
const WIKILINK_DELIMITER_RE = /[\[\]|]/;

const MANAGED_SCRIPTS = [
  'scripts/project-notes.cjs',
  'scripts/search-project-notes.cjs',
  'scripts/validate-project-notes-graph.cjs',
  'scripts/lib/project-notes-graph.cjs',
  'scripts/lib/validate-project-notes-graph.cjs'
];

const VAULT_MIGRATIONS = [
  {
    version: '0.2.16',
    id: 'vault-0.2.16-schema-indexes'
  },
  {
    version: '0.3.0',
    id: 'vault-0.3.0-typed-templates'
  },
  {
    version: '0.4.0',
    id: 'vault-0.4.0-managed-sections'
  }
];

function usage() {
  return `Notes graph kit installer (kit version ${kitVersion})

Usage:
  node install-notes-graph.cjs --repo /path/to/repo --app "App Name" [--vault "Project Notes"] [--force] [--force-vault] [--dry-run]
  node install-notes-graph.cjs --repo /path/to/repo --upgrade [--dry-run] [--allow-downgrade]

Options:
  --repo      Exact target Git worktree root. Defaults to current working
              directory.
  --app       App/product name (required for install).
  --vault     Vault directory name. Defaults to "Project Notes".
  --upgrade   Re-copy kit-managed scripts and bump kitVersion in the target
              config. Never touches vault content.
  --allow-downgrade
              Permit --upgrade to replace a newer installed kit version.
  --force     Overwrite existing kit-managed scripts and config on install.
  --force-vault
              With --force, also overwrite existing vault skeleton files.
  --allow-non-git
              Permit an intentional install outside a Git worktree.
  --dry-run   Print planned writes without changing files.
`;
}

function parseArgs(argv) {
  const parsed = { _: [] };
  const booleanFlags = new Set([
    'force',
    'force-vault',
    'allow-non-git',
    'dry-run',
    'upgrade',
    'allow-downgrade',
    'help'
  ]);
  const valueFlags = new Set(['repo', 'app', 'vault']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      parsed._.push(arg);
      continue;
    }
    const equalsIndex = arg.indexOf('=');
    const key = arg.slice(2, equalsIndex === -1 ? undefined : equalsIndex);
    if (!booleanFlags.has(key) && !valueFlags.has(key)) {
      throw new Error(`Unknown option: --${key}`);
    }
    if (booleanFlags.has(key)) {
      if (equalsIndex !== -1) {
        throw new Error(`--${key} does not take a value`);
      }
      const next = argv[index + 1];
      if (next === 'true' || next === 'false') {
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
      throw new Error(`Missing value for --${key}`);
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function parseSemver(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const numeric = '(0|[1-9]\\d*)';
  const match = value.match(
    new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`)
  );
  if (!match) {
    return null;
  }
  const prerelease = match[4] ? match[4].split('.') : [];
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
    return null;
  }
  return {
    numbers: [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])],
    prerelease
  };
}

function compareSemver(left, right) {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);
  if (!leftVersion || !rightVersion) {
    return null;
  }
  for (let index = 0; index < leftVersion.numbers.length; index += 1) {
    if (leftVersion.numbers[index] !== rightVersion.numbers[index]) {
      return leftVersion.numbers[index] > rightVersion.numbers[index] ? 1 : -1;
    }
  }
  if (leftVersion.prerelease.length === 0 || rightVersion.prerelease.length === 0) {
    if (leftVersion.prerelease.length === rightVersion.prerelease.length) {
      return 0;
    }
    return leftVersion.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftVersion.prerelease[index];
    const rightPart = rightVersion.prerelease[index];
    if (leftPart == null || rightPart == null) {
      return leftPart == null ? -1 : 1;
    }
    if (leftPart === rightPart) {
      continue;
    }
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      if (leftPart.length !== rightPart.length) {
        return leftPart.length > rightPart.length ? 1 : -1;
      }
      return leftPart > rightPart ? 1 : -1;
    }
    if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    }
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

function applicableVaultMigrations(targetVersion) {
  if (!parseSemver(targetVersion)) {
    throw new Error(`Target migration version must be valid semantic versioning; found ${JSON.stringify(targetVersion)}`);
  }
  return VAULT_MIGRATIONS
    .filter((migration) => compareSemver(migration.version, targetVersion) <= 0)
    .map((migration) => ({ ...migration }));
}

function latestVaultMigrationVersion(targetVersion = kitVersion) {
  const applicable = applicableVaultMigrations(targetVersion);
  if (applicable.length === 0) {
    throw new Error(`No vault migration is applicable to kit version ${targetVersion}`);
  }
  return applicable[applicable.length - 1].version;
}

function vaultMigrationGuidance(targetVersion, repoRoot = '<target-repo>') {
  const migrationTarget = latestVaultMigrationVersion(targetVersion);
  return [
    'Vault content was not touched.',
    'kitVersion tracks managed scripts, not whether vault migrations were completed.',
    'Audit the vault against every applicable migration:',
    `  node ${path.join(kitRoot, 'migrate-notes-graph.cjs')} audit --repo ${JSON.stringify(repoRoot)} --to ${migrationTarget}`
  ];
}

function canonicalExistingDirectory(inputPath) {
  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Repo does not exist: ${resolved}`);
  }
  const canonical = fs.realpathSync(resolved);
  if (!fs.statSync(canonical).isDirectory()) {
    throw new Error(`Repo is not a directory: ${canonical}`);
  }
  return canonical;
}

function validateRepoRoot(inputPath, options = {}) {
  const repoRoot = canonicalExistingDirectory(inputPath || process.cwd());
  const filesystemRoot = path.parse(repoRoot).root;
  const homeRoot = fs.realpathSync(os.homedir());
  if (repoRoot === filesystemRoot) {
    throw new Error(`Refusing to install into filesystem root: ${repoRoot}`);
  }
  if (repoRoot === homeRoot) {
    throw new Error(`Refusing to install into the user home directory: ${repoRoot}`);
  }
  let gitRoot;
  try {
    gitRoot = execFileSync(
      'git',
      ['-C', repoRoot, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
  } catch {
    if (options.allowNonGit) {
      return repoRoot;
    }
    throw new Error(
      `${repoRoot} is not a Git worktree. Initialize Git or use --allow-non-git for an intentional non-Git install.`
    );
  }
  const canonicalGitRoot = fs.realpathSync(gitRoot);
  if (canonicalGitRoot !== repoRoot) {
    throw new Error(
      `--repo must be the exact Git worktree root (${canonicalGitRoot}), not ${repoRoot}`
    );
  }
  return repoRoot;
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

function detectScriptsDir(repoRoot) {
  const names = fs.readdirSync(repoRoot)
    .filter((name) => name === 'scripts' || name === 'Scripts');
  const directories = names.filter((name) => {
    const stat = fs.lstatSync(path.join(repoRoot, name));
    if (stat.isSymbolicLink()) {
      throw new Error(`Write target parent must not be a symlink: ${path.join(repoRoot, name)}`);
    }
    return stat.isDirectory();
  });
  if (directories.length > 1) {
    throw new Error('Both scripts/ and Scripts/ exist; choose one before installing the notes graph kit');
  }
  return directories[0] || 'scripts';
}

function notesNpmScripts(scriptsDir = 'scripts') {
  return {
    notes: `node ${scriptsDir}/project-notes.cjs`,
    'notes:route': `node ${scriptsDir}/project-notes.cjs route`,
    'notes:new': `node ${scriptsDir}/project-notes.cjs new`,
    'notes:closeout': `node ${scriptsDir}/project-notes.cjs closeout`,
    'notes:search': `node ${scriptsDir}/search-project-notes.cjs`,
    'notes:validate': `node ${scriptsDir}/validate-project-notes-graph.cjs`
  };
}

function buildConfig(appName, vaultDir, appFileBase, options = {}) {
  const appliedMigrations = options.appliedMigrations
    || applicableVaultMigrations(kitVersion).map((migration) => migration.id);
  return {
    appName,
    vaultDir,
    scriptName: 'project-notes',
    appRel: `Apps/${appFileBase}.md`,
    kitVersion,
    vaultMigrationState: {
      schemaVersion: 1,
      applied: [...appliedMigrations]
    },
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

function buildScriptWrites(scriptsDir = 'scripts') {
  return MANAGED_SCRIPTS.map((sourceRel) => ({
    rel: `${scriptsDir}/${sourceRel.slice('scripts/'.length)}`,
    content: fs.readFileSync(path.join(kitRoot, sourceRel), 'utf8'),
    kind: 'script'
  }));
}

function mergePackageJson(repoRoot, scriptsDir = detectScriptsDir(repoRoot)) {
  const packagePath = path.join(repoRoot, 'package.json');
  assertRegularFileIfExists(packagePath, 'package.json');
  const exists = pathExists(packagePath);
  const pkg = exists
    ? JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    : { name: path.basename(repoRoot), private: true };
  pkg.scripts = pkg.scripts || {};
  pkg.dependencies = pkg.dependencies || {};
  const preservedScripts = [];
  let changed = !exists;
  for (const [name, command] of Object.entries(notesNpmScripts(scriptsDir))) {
    if (pkg.scripts[name] !== command) {
      if (pkg.scripts[name] && pkg.scripts[name] !== command) {
        // Preserve a repo's customized notes command; only fill gaps.
        preservedScripts.push({ name, current: pkg.scripts[name], expected: command });
        continue;
      }
      pkg.scripts[name] = command;
      changed = true;
    }
  }
  if (!pkg.dependencies['js-yaml'] && (pkg.devDependencies || {})['js-yaml']) {
    pkg.dependencies['js-yaml'] = pkg.devDependencies['js-yaml'];
    delete pkg.devDependencies['js-yaml'];
    if (Object.keys(pkg.devDependencies).length === 0) {
      delete pkg.devDependencies;
    }
    changed = true;
  } else if (!pkg.dependencies['js-yaml']) {
    pkg.dependencies['js-yaml'] = '^4.1.0';
    changed = true;
  }
  return {
    write: changed
    ? { rel: 'package.json', content: `${JSON.stringify(pkg, null, 2)}\n`, kind: 'package' }
      : null,
    preservedScripts
  };
}

function mergePackageLock(repoRoot) {
  const lockPath = path.join(repoRoot, 'package-lock.json');
  if (!pathExists(lockPath)) {
    return null;
  }
  assertRegularFileIfExists(lockPath, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const packagePath = path.join(repoRoot, 'package.json');
  const packageJson = pathExists(packagePath)
    ? JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    : {};
  const jsYamlRange = packageJson.dependencies?.['js-yaml']
    || packageJson.devDependencies?.['js-yaml']
    || '^4.1.0';
  const sourceLock = JSON.parse(
    fs.readFileSync(path.join(kitRoot, 'package-lock.json'), 'utf8')
  );
  let changed = false;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].dependencies = lock.packages[''].dependencies || {};
    if (!lock.packages[''].dependencies['js-yaml']) {
      lock.packages[''].dependencies['js-yaml'] = jsYamlRange;
      changed = true;
    }
    if (lock.packages[''].devDependencies?.['js-yaml']) {
      delete lock.packages[''].devDependencies['js-yaml'];
      if (Object.keys(lock.packages[''].devDependencies).length === 0) {
        delete lock.packages[''].devDependencies;
      }
      changed = true;
    }
    for (const rel of ['node_modules/js-yaml', 'node_modules/argparse']) {
      if (!lock.packages[rel]) {
        lock.packages[rel] = sourceLock.packages[rel];
        changed = true;
      }
      if (lock.packages[rel]?.dev === true) {
        delete lock.packages[rel].dev;
        changed = true;
      }
    }
  }
  if (lock.dependencies?.['js-yaml']) {
    if (lock.dependencies['js-yaml'].dev === true) {
      delete lock.dependencies['js-yaml'].dev;
      changed = true;
    }
    if (lock.dependencies.argparse?.dev === true) {
      delete lock.dependencies.argparse.dev;
      changed = true;
    }
  }
  return changed
    ? {
        rel: 'package-lock.json',
        content: `${JSON.stringify(lock, null, 2)}\n`,
        kind: 'package'
      }
    : null;
}

function preservedScriptLines(preservedScripts) {
  return preservedScripts.map(({ name, current }) =>
    `  warn  package.json preserved custom ${name}: ${current}`
  );
}

const AGENTS_SECTION_START = '<!-- notes-graph-kit:start -->';
const AGENTS_SECTION_END = '<!-- notes-graph-kit:end -->';

function agentsSnippet(appName, vaultDir, appFileBase) {
  const raw = fs.readFileSync(path.join(kitRoot, 'AGENTS-snippet.md'), 'utf8');
  const blockMatch = raw.match(/```md\n([\s\S]*?)```/);
  const block = blockMatch ? blockMatch[1] : raw;
  const headingSentinel = '\u0000NOTES_GRAPH_AGENTS_HEADING\u0000';
  const rendered = replaceAppPlaceholders(block, appName, appFileBase)
    .replace(/^## Project Notes Graph[ \t]*$/m, headingSentinel)
    .split(SKELETON_VAULT_DIR).join(vaultDir);
  const restored = rendered.replace(headingSentinel, '## Project Notes Graph');
  if (restored.includes(AGENTS_SECTION_START) && restored.includes(AGENTS_SECTION_END)) {
    return restored;
  }
  return `${AGENTS_SECTION_START}\n${restored.trimEnd()}\n${AGENTS_SECTION_END}\n`;
}

function scanAgentsContent(content) {
  let fence = null;
  const starts = [];
  const ends = [];
  let hasLegacyHeading = false;
  const lines = String(content || '').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (fence) {
      const closePattern = new RegExp(
        `^ {0,3}\\${fence.character}{${fence.length},}[ \\t]*$`
      );
      if (closePattern.test(line)) {
        fence = null;
      }
      return;
    }
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      fence = { character: marker[0], length: marker.length };
      return;
    }
    if (/^ {0,3}<!-- notes-graph-kit:start -->[ \t]*$/.test(line)) {
      starts.push(index);
    } else if (/^ {0,3}<!-- notes-graph-kit:end -->[ \t]*$/.test(line)) {
      ends.push(index);
    } else if (/^ {0,3}##[ \t]+Project Notes Graph[ \t]*$/.test(line)) {
      hasLegacyHeading = true;
    }
  });
  return { starts, ends, hasLegacyHeading, unclosedFence: fence != null };
}

function buildAgentsBlock(repoRoot, appName, vaultDir, appFileBase) {
  const agentsPath = path.join(repoRoot, 'AGENTS.md');
  const section = agentsSnippet(appName, vaultDir, appFileBase).trimEnd();
  const result = { rel: 'AGENTS.md', kind: 'agents' };

  assertRegularFileIfExists(agentsPath, 'AGENTS.md');
  if (pathExists(agentsPath)) {
    const content = fs.readFileSync(agentsPath, 'utf8');
    const scan = scanAgentsContent(content);
    const hasCompleteMarkers = scan.starts.length === 1
      && scan.ends.length === 1
      && scan.starts[0] < scan.ends[0];
    const hasAnyMarkers = scan.starts.length > 0 || scan.ends.length > 0;
    if (hasAnyMarkers && !hasCompleteMarkers) {
      throw new Error('AGENTS.md has incomplete or duplicate notes-graph-kit managed markers');
    }
    if (hasCompleteMarkers || scan.hasLegacyHeading) {
      result.action = 'skip';
      return result;
    }
    if (scan.unclosedFence) {
      throw new Error('AGENTS.md has an unclosed fenced code block; cannot safely append');
    }
    const separator = content.endsWith('\n') ? '\n' : '\n\n';
    result.content = `${content}${separator}${section}\n`;
    result.action = 'append';
    result.write = { rel: result.rel, content: result.content, kind: result.kind };
    return result;
  }

  const title = path.basename(repoRoot);
  result.content = `# ${title}\n\n${section}\n`;
  result.action = 'create';
  result.write = { rel: result.rel, content: result.content, kind: result.kind };
  return result;
}

function pathExists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function assertRegularFileIfExists(filePath, label = filePath) {
  if (!pathExists(filePath)) {
    return;
  }
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${label} must be a regular file: ${filePath}`);
  }
}

function targetPathForWrite(repoRoot, rel) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel)) {
    throw new Error(`Invalid write target: ${rel}`);
  }
  const targetPath = path.resolve(repoRoot, rel);
  const relative = path.relative(repoRoot, targetPath);
  if (
    relative === ''
    || relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error(`Write target escapes repository: ${rel}`);
  }
  return targetPath;
}

function preflightWriteTargets(repoRoot, writes) {
  const targets = new Set();
  for (const write of writes) {
    const targetPath = targetPathForWrite(repoRoot, write.rel);
    const targetKey = process.platform === 'win32' || process.platform === 'darwin'
      ? targetPath.toLowerCase()
      : targetPath;
    if (targets.has(targetKey)) {
      throw new Error(`Duplicate write target: ${write.rel}`);
    }
    targets.add(targetKey);

    const relativeParent = path.relative(repoRoot, path.dirname(targetPath));
    let current = repoRoot;
    for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      if (!pathExists(current)) {
        continue;
      }
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`Write target parent must not be a symlink: ${current}`);
      }
      if (!stat.isDirectory()) {
        throw new Error(`Write target parent is not a directory: ${current}`);
      }
      fs.accessSync(current, fs.constants.W_OK);
    }
    if (pathExists(targetPath)) {
      const targetStat = fs.lstatSync(targetPath);
      if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
        throw new Error(`Write target must be a regular file: ${targetPath}`);
      }
    }
  }
}

function planWrites(repoRoot, writes, { force, forceVault }) {
  const results = { written: [], skipped: [] };
  const planned = [];
  for (const write of writes) {
    const targetPath = targetPathForWrite(repoRoot, write.rel);
    const exists = pathExists(targetPath);
    if (exists) {
      if (write.kind === 'vault' && !(force && forceVault)) {
        results.skipped.push(write.rel);
        continue;
      }
      if (write.kind === 'script') {
        if (!force) {
          throw new Error(`${write.rel} already exists in ${repoRoot}. Use --force to overwrite managed helper scripts.`);
        }
      }
      if (write.kind === 'config') {
        if (!force) {
          throw new Error(`${write.rel} already exists in ${repoRoot}. Use --upgrade to refresh scripts or --force to reinstall.`);
        }
      }
    }
    results.written.push(write.rel);
    planned.push(write);
  }
  preflightWriteTargets(repoRoot, planned);
  return { ...results, planned };
}

function createParentDirectories(repoRoot, targetPath, createdDirectories) {
  const relativeParent = path.relative(repoRoot, path.dirname(targetPath));
  let current = repoRoot;
  for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!pathExists(current)) {
      fs.mkdirSync(current);
      createdDirectories.push(current);
    }
  }
}

function executeWriteTransaction(repoRoot, writes, options = {}) {
  const dryRun = Boolean(options.dryRun);
  preflightWriteTargets(repoRoot, writes);
  if (dryRun || writes.length === 0) {
    return;
  }

  const transactionRoot = fs.mkdtempSync(path.join(repoRoot, '.notes-graph-kit-transaction-'));
  const staged = [];
  const operations = [];
  const createdDirectories = [];
  const hook = typeof options.beforeOperation === 'function'
    ? options.beforeOperation
    : () => {};
  let failure = null;
  let rollbackFailed = false;
  let cleanupWarning = null;
  try {
    writes.forEach((write, index) => {
      const targetPath = targetPathForWrite(repoRoot, write.rel);
      const stagedPath = write.delete ? null : path.join(transactionRoot, `${index}.new`);
      if (!write.delete) {
        fs.writeFileSync(stagedPath, write.content);
      }
      if (!write.delete && Number.isInteger(write.mode)) {
        fs.chmodSync(stagedPath, write.mode & 0o7777);
      } else if (!write.delete && pathExists(targetPath)) {
        fs.chmodSync(stagedPath, fs.lstatSync(targetPath).mode & 0o7777);
      }
      staged.push({ write, stagedPath, backupPath: path.join(transactionRoot, `${index}.bak`) });
    });

    preflightWriteTargets(repoRoot, writes);
    hook({ phase: 'before-commit', rel: null, index: -1 });
    staged.forEach(({ write, stagedPath, backupPath }, index) => {
      const targetPath = targetPathForWrite(repoRoot, write.rel);
      hook({ phase: 'before-write', rel: write.rel, index });
      createParentDirectories(repoRoot, targetPath, createdDirectories);
      const operation = {
        targetPath,
        backupPath,
        hadOriginal: false,
        installed: false
      };
      operations.push(operation);
      if (pathExists(targetPath)) {
        fs.renameSync(targetPath, backupPath);
        operation.hadOriginal = true;
        hook({ phase: 'after-backup', rel: write.rel, index });
      }
      if (!write.delete) {
        fs.renameSync(stagedPath, targetPath);
        operation.installed = true;
        hook({ phase: 'after-write', rel: write.rel, index });
      } else {
        hook({ phase: 'after-delete', rel: write.rel, index });
      }
    });
    hook({ phase: 'after-commit', rel: null, index: writes.length });
  } catch (error) {
    failure = error;
    const rollbackErrors = [];
    for (const operation of [...operations].reverse()) {
      if (operation.installed && pathExists(operation.targetPath)) {
        try {
          fs.unlinkSync(operation.targetPath);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError.message);
        }
      }
      if (operation.hadOriginal && pathExists(operation.backupPath)) {
        try {
          fs.renameSync(operation.backupPath, operation.targetPath);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError.message);
        }
      }
    }
    for (const directory of [...createdDirectories].reverse()) {
      try {
        if (pathExists(directory)) {
          fs.rmdirSync(directory);
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError.message);
      }
    }
    if (rollbackErrors.length > 0) {
      rollbackFailed = true;
      failure = new Error(
        `${error.message}; rollback also failed: ${rollbackErrors.join('; ')}; backups preserved at ${transactionRoot}`
      );
    }
  } finally {
    if (!rollbackFailed) {
      try {
        fs.rmSync(transactionRoot, { recursive: true, force: true });
      } catch (cleanupError) {
        if (failure) {
          failure = new Error(`${failure.message}; transaction cleanup failed: ${cleanupError.message}`);
        } else {
          cleanupWarning = `transaction cleanup failed; retained ${transactionRoot}: ${cleanupError.message}`;
        }
      }
    }
  }
  if (failure) {
    throw failure;
  }
  return { cleanupWarning };
}

function applyAgentsBlock(repoRoot, appName, vaultDir, appFileBase, { dryRun = false } = {}) {
  const result = buildAgentsBlock(repoRoot, appName, vaultDir, appFileBase);
  if (result.write) {
    const transaction = executeWriteTransaction(repoRoot, [result.write], { dryRun });
    result.cleanupWarning = transaction?.cleanupWarning || null;
  }
  return result;
}

function assertNoProtectedExistingWrites(repoRoot, writes, { force }) {
  planWrites(repoRoot, writes, { force, forceVault: false });
}

function install(args) {
  const repoRoot = validateRepoRoot(args.repo || process.cwd(), {
    allowNonGit: Boolean(args['allow-non-git'])
  });
  const appName = validateAppName(args.app);
  const vaultDir = validateVaultDir(args.vault || SKELETON_VAULT_DIR);
  const appFileBase = fileBaseForApp(appName);
  const dryRun = Boolean(args['dry-run']);
  const force = Boolean(args.force);
  const forceVault = Boolean(args['force-vault']);
  const scriptsDir = detectScriptsDir(repoRoot);
  const vaultWrites = buildVaultWrites(appName, vaultDir, appFileBase);
  const hasPreservedVaultCollision = !(force && forceVault)
    && vaultWrites.some((write) => pathExists(targetPathForWrite(repoRoot, write.rel)));
  const config = buildConfig(appName, vaultDir, appFileBase, {
    appliedMigrations: hasPreservedVaultCollision
      ? []
      : applicableVaultMigrations(kitVersion).map((migration) => migration.id)
  });

  const writes = [
    ...buildScriptWrites(scriptsDir),
    {
      rel: 'notes-graph.config.json',
      content: `${JSON.stringify(config, null, 2)}\n`,
      kind: 'config'
    },
    ...vaultWrites
  ];
  const packageMerge = mergePackageJson(repoRoot, scriptsDir);
  if (packageMerge.write) {
    writes.push(packageMerge.write);
  }
  const packageLockWrite = mergePackageLock(repoRoot);
  if (packageLockWrite) {
    writes.push(packageLockWrite);
  }
  const agentsResult = buildAgentsBlock(repoRoot, appName, vaultDir, appFileBase);
  if (agentsResult.write) {
    writes.push(agentsResult.write);
  }

  const results = planWrites(repoRoot, writes, { force, forceVault });
  const transaction = executeWriteTransaction(repoRoot, results.planned, { dryRun });
  const lines = [
    `${dryRun ? '[dry-run] ' : ''}Installed notes graph kit ${kitVersion} into ${repoRoot}`,
    ...results.written.filter((rel) => rel !== 'AGENTS.md').map((rel) => `  write ${rel}`),
    ...results.skipped.map((rel) => `  skip  ${rel} (exists)`),
    ...preservedScriptLines(packageMerge.preservedScripts),
    ...(transaction?.cleanupWarning ? [`  warn  ${transaction.cleanupWarning}`] : []),
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
  if (packageMerge.preservedScripts.length > 0) {
    lines.push('', 'package.json has custom notes:* scripts; verify they call the refreshed kit or update them manually.');
  }
  return `${lines.join('\n')}\n`;
}

function upgrade(args) {
  const repoRoot = validateRepoRoot(args.repo || process.cwd(), {
    allowNonGit: Boolean(args['allow-non-git'])
  });
  const configPath = path.join(repoRoot, 'notes-graph.config.json');
  assertRegularFileIfExists(configPath, 'notes-graph.config.json');
  if (!pathExists(configPath)) {
    throw new Error(`No notes-graph.config.json in ${repoRoot}; run an install instead.`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const hasPreviousVersion = Object.prototype.hasOwnProperty.call(config, 'kitVersion');
  if (hasPreviousVersion && !parseSemver(config.kitVersion)) {
    throw new Error(
      `Installed kitVersion must be valid semantic versioning; found ${JSON.stringify(config.kitVersion)}`
    );
  }
  const previousVersion = hasPreviousVersion ? config.kitVersion : 'unversioned';
  const dryRun = Boolean(args['dry-run']);
  if (
    hasPreviousVersion
    && !args['allow-downgrade']
    && compareSemver(previousVersion, kitVersion) > 0
  ) {
    throw new Error(
      `Refusing to downgrade notes graph kit ${previousVersion} -> ${kitVersion}. Use --allow-downgrade to proceed intentionally.`
    );
  }

  const scriptsDir = detectScriptsDir(repoRoot);
  const writes = buildScriptWrites(scriptsDir);
  config.kitVersion = kitVersion;
  writes.push({
    rel: 'notes-graph.config.json',
    content: `${JSON.stringify(config, null, 2)}\n`,
    kind: 'config'
  });
  const packageMerge = mergePackageJson(repoRoot, scriptsDir);
  if (packageMerge.write) {
    writes.push(packageMerge.write);
  }
  const packageLockWrite = mergePackageLock(repoRoot);
  if (packageLockWrite) {
    writes.push(packageLockWrite);
  }

  const results = planWrites(repoRoot, writes, { force: true, forceVault: false });
  const transaction = executeWriteTransaction(repoRoot, results.planned, { dryRun });
  const lines = [
    `${dryRun ? '[dry-run] ' : ''}Upgraded notes graph kit ${previousVersion} -> ${kitVersion} in ${repoRoot}`,
    ...results.written.map((rel) => `  write ${rel}`),
    ...preservedScriptLines(packageMerge.preservedScripts),
    ...(transaction?.cleanupWarning ? [`  warn  ${transaction.cleanupWarning}`] : []),
    '',
    ...vaultMigrationGuidance(kitVersion, repoRoot)
  ];
  if (packageMerge.preservedScripts.length > 0) {
    lines.push('', 'package.json has custom notes:* scripts; verify they call the refreshed kit or update them manually.');
  }
  return `${lines.join('\n')}\n`;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!parseSemver(kitVersion)) {
    throw new Error(`Kit package version must be valid semantic versioning; found ${JSON.stringify(kitVersion)}`);
  }
  if (args.help) {
    return usage();
  }
  if (args._.length > 0) {
    throw new Error(`Unexpected positional argument(s): ${args._.join(' ')}`);
  }
  if (args['allow-downgrade'] && !args.upgrade) {
    throw new Error('--allow-downgrade requires --upgrade');
  }
  if (args['force-vault'] && !args.force) {
    throw new Error('--force-vault requires --force');
  }
  if (args.upgrade) {
    const incompatible = ['app', 'vault', 'force', 'force-vault']
      .filter((key) => Object.prototype.hasOwnProperty.call(args, key));
    if (incompatible.length > 0) {
      throw new Error(`--upgrade cannot be combined with ${incompatible.map((key) => `--${key}`).join(', ')}`);
    }
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
  buildVaultWrites,
  buildScriptWrites,
  mergePackageJson,
  mergePackageLock,
  detectScriptsDir,
  notesNpmScripts,
  agentsSnippet,
  scanAgentsContent,
  compareSemver,
  parseSemver,
  applicableVaultMigrations,
  latestVaultMigrationVersion,
  vaultMigrationGuidance,
  validateRepoRoot,
  buildAgentsBlock,
  applyAgentsBlock,
  planWrites,
  preflightWriteTargets,
  executeWriteTransaction,
  validateVaultDir,
  validateAppName,
  fileBaseForApp,
  replaceAppPlaceholders,
  isInstallSkeletonRel,
  targetPathForWrite,
  pathExists,
  AGENTS_SECTION_START,
  AGENTS_SECTION_END,
  VAULT_MIGRATIONS,
  kitVersion,
  assertNoProtectedExistingWrites
};
