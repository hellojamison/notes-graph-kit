const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const yaml = require('js-yaml');

const installer = require('../install-notes-graph.cjs');
const {
  allowedStatuses,
  allowedTypes,
  dumpFrontmatter,
  splitFrontmatter
} = require('../scripts/lib/project-notes-graph.cjs');
const {
  validateProjectNotesGraph
} = require('../scripts/lib/validate-project-notes-graph.cjs');
const { MIGRATIONS } = require('./catalog.cjs');
const {
  canonicalDate,
  isSafeRelativePath,
  readUtf8IfFile,
  renderFrontmatter,
  toPosix
} = require('./utils.cjs');

const DEFAULT_BACKUP_REL = '.notes-graph-kit/vault-migration-backups';
const MANIFEST_NAME = 'manifest.json';

class MigrationInputError extends Error {}

function hashBuffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashText(value) {
  return hashBuffer(Buffer.from(value, 'utf8'));
}

function stableCompare(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareMigrationIds(left, right) {
  const leftIndex = MIGRATIONS.findIndex(({ id }) => id === left);
  const rightIndex = MIGRATIONS.findIndex(({ id }) => id === right);
  if (leftIndex !== -1 && rightIndex !== -1) {
    return leftIndex - rightIndex;
  }
  return stableCompare(left, right);
}

function stableItems(items) {
  return [...items].sort((left, right) =>
    stableCompare(left.rel, right.rel) || stableCompare(left.id, right.id)
  );
}

function ensureRegularFileOrMissing(filePath, label = filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new MigrationInputError(`${label} must be a regular file: ${filePath}`);
  }
  return true;
}

function isGitWorktree(repoRoot) {
  try {
    const top = execFileSync(
      'git',
      ['-C', repoRoot, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    return fs.realpathSync(top) === repoRoot;
  } catch {
    return false;
  }
}

function readConfig(repoRoot) {
  const configPath = path.join(repoRoot, 'notes-graph.config.json');
  if (!ensureRegularFileOrMissing(configPath, 'notes-graph.config.json')) {
    return null;
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('root must be an object');
    }
    return config;
  } catch (error) {
    throw new MigrationInputError(`Invalid notes-graph.config.json: ${error.message}`);
  }
}

function supportedTargetVersion(value) {
  const target = value || installer.latestVaultMigrationVersion();
  if (!installer.parseSemver(target)) {
    throw new MigrationInputError(`--to must be valid semantic versioning; found ${JSON.stringify(target)}`);
  }
  if (installer.compareSemver(target, installer.kitVersion) > 0) {
    throw new MigrationInputError(
      `--to ${target} is newer than the running kit ${installer.kitVersion}`
    );
  }
  const supported = new Set(MIGRATIONS.map(({ version }) => version));
  if (!supported.has(target)) {
    throw new MigrationInputError(
      `Unsupported migration target ${target}; supported versions: ${[...supported].join(', ')}`
    );
  }
  return target;
}

function resolveContext(options) {
  const repoRoot = installer.validateRepoRoot(options.repo || process.cwd(), {
    allowNonGit: Boolean(options.allowNonGit)
  });
  const git = isGitWorktree(repoRoot);
  const installedConfig = readConfig(repoRoot);
  if (!installedConfig && (!options.app || !options.vault)) {
    throw new MigrationInputError(
      'An unmanaged vault requires both --app and --vault'
    );
  }
  if (installedConfig && (options.app || options.vault)) {
    throw new MigrationInputError(
      '--app and --vault are only valid when notes-graph.config.json is absent'
    );
  }
  const appName = installer.validateAppName(installedConfig?.appName || options.app);
  const vaultDir = installer.validateVaultDir(installedConfig?.vaultDir || options.vault);
  const appFileBase = installedConfig?.appRel
    ? path.posix.basename(installedConfig.appRel, '.md')
    : installer.fileBaseForApp(appName);
  const appRel = installedConfig?.appRel || `Apps/${appFileBase}.md`;
  if (!isSafeRelativePath(appRel) || !appRel.endsWith('.md')) {
    throw new MigrationInputError(`Invalid configured appRel: ${JSON.stringify(appRel)}`);
  }
  const vaultRoot = path.join(repoRoot, vaultDir);
  if (!fs.existsSync(vaultRoot)) {
    throw new MigrationInputError(`Vault does not exist: ${vaultRoot}`);
  }
  const vaultStat = fs.lstatSync(vaultRoot);
  if (vaultStat.isSymbolicLink() || !vaultStat.isDirectory()) {
    throw new MigrationInputError(`Vault root must be a real directory: ${vaultRoot}`);
  }
  return {
    repoRoot,
    vaultRoot,
    vaultDir,
    appName,
    appFileBase,
    appRel,
    installedConfig,
    git,
    targetVersion: supportedTargetVersion(options.to)
  };
}

function loadMapping(mapPath, context) {
  if (!mapPath) {
    return [];
  }
  const absolute = path.resolve(context.repoRoot, mapPath);
  if (!ensureRegularFileOrMissing(absolute, '--map')) {
    throw new MigrationInputError(`Mapping file does not exist: ${absolute}`);
  }
  let parsed;
  try {
    parsed = yaml.load(fs.readFileSync(absolute, 'utf8'), { schema: yaml.JSON_SCHEMA });
  } catch (error) {
    throw new MigrationInputError(`Invalid mapping YAML: ${error.message}`);
  }
  if (!parsed || parsed.schema_version !== 1 || !Array.isArray(parsed.entries)) {
    throw new MigrationInputError('Mapping must contain schema_version: 1 and an entries array');
  }
  const seen = new Set();
  return parsed.entries.map((entry, index) => {
    const label = `mapping entries[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new MigrationInputError(`${label} must be a mapping`);
    }
    for (const field of ['path', 'title', 'type', 'status', 'date', 'tags']) {
      if (entry[field] == null) {
        throw new MigrationInputError(`${label} is missing ${field}`);
      }
    }
    if (!isSafeRelativePath(entry.path) || !entry.path.endsWith('.md')) {
      throw new MigrationInputError(`${label}.path must be a safe vault-relative Markdown path`);
    }
    if (
      typeof entry.title !== 'string' || !entry.title.trim()
      || typeof entry.type !== 'string' || !allowedTypes.has(entry.type)
      || typeof entry.status !== 'string' || !allowedStatuses.has(entry.status)
      || !canonicalDate(entry.date)
      || !Array.isArray(entry.tags) || entry.tags.length === 0
      || entry.tags.some((tag) => typeof tag !== 'string' || !tag.trim())
    ) {
      throw new MigrationInputError(
        `${label} requires a non-empty title/tags, allowed type/status, and a YYYY-MM-DD date`
      );
    }
    const rel = path.posix.normalize(entry.path);
    if (seen.has(rel)) {
      throw new MigrationInputError(`Duplicate mapping path: ${rel}`);
    }
    seen.add(rel);
    return { ...entry, path: rel, source: toPosix(path.relative(context.repoRoot, absolute)) };
  });
}

function walkFiles(root, current = root) {
  const files = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const filePath = path.join(current, entry.name);
    const rel = toPosix(path.relative(root, filePath));
    if (entry.isSymbolicLink()) {
      throw new MigrationInputError(`Migration does not follow symlinks: ${filePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...walkFiles(root, filePath));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files.sort(stableCompare);
}

function virtualVaultFiles(context, overlay = new Map()) {
  const files = new Map();
  for (const rel of walkFiles(context.vaultRoot)) {
    if (!rel.endsWith('.md') && !rel.endsWith('.base')) {
      continue;
    }
    const repoRel = `${context.vaultDir}/${rel}`;
    files.set(rel, overlay.has(repoRel)
      ? overlay.get(repoRel)
      : fs.readFileSync(path.join(context.vaultRoot, ...rel.split('/')), 'utf8'));
  }
  for (const [repoRel, content] of overlay) {
    const prefix = `${context.vaultDir}/`;
    if (
      repoRel.startsWith(prefix)
      && (repoRel.endsWith('.md') || repoRel.endsWith('.base'))
    ) {
      files.set(repoRel.slice(prefix.length), content);
    }
  }
  return files;
}

function makePlanner(context, options) {
  const items = [];
  const overlay = new Map();
  const writes = new Map();
  const deferredMigrations = new Map();
  const accepted = new Set(options.accept || []);
  const mappings = loadMapping(options.map, context);

  function readRepo(rel) {
    if (!isSafeRelativePath(rel)) {
      throw new MigrationInputError(`Unsafe repository-relative path: ${rel}`);
    }
    if (overlay.has(rel)) {
      return overlay.get(rel);
    }
    return readUtf8IfFile(path.join(context.repoRoot, ...rel.split('/')));
  }

  function readOriginalRepo(rel) {
    if (!isSafeRelativePath(rel)) {
      throw new MigrationInputError(`Unsafe repository-relative path: ${rel}`);
    }
    return readUtf8IfFile(path.join(context.repoRoot, ...rel.split('/')));
  }

  function addItem(item) {
    items.push({
      id: item.id,
      migration: item.migration,
      category: item.category,
      rel: item.rel,
      state: item.state,
      action: item.action || 'none',
      reason: item.reason || '',
      evidence: [...(item.evidence || [])].sort(stableCompare),
      destructive: Boolean(item.destructive),
      optInRequired: Boolean(item.optInRequired)
    });
  }

  function planCandidate(item) {
    const existing = readRepo(item.rel);
    if (item.candidate === existing) {
      addItem({ ...item, state: 'compliant', action: 'none' });
      return;
    }
    if (item.optInRequired && !accepted.has(item.id)) {
      addItem({ ...item, state: 'conflict' });
      return;
    }
    addItem({ ...item, state: 'planned' });
    overlay.set(item.rel, item.candidate);
    const previous = writes.get(item.rel);
    const originalPath = installer.targetPathForWrite(context.repoRoot, item.rel);
    const originalExists = previous?.expectedExists ?? fs.existsSync(originalPath);
    let originalSha256 = previous?.expectedSha256 ?? null;
    if (!previous && originalExists) {
      const stat = fs.lstatSync(originalPath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new MigrationInputError(
          `Migration target must be a regular file: ${originalPath}`
        );
      }
      originalSha256 = hashBuffer(fs.readFileSync(originalPath));
    }
    writes.set(item.rel, {
      rel: item.rel,
      content: item.candidate,
      kind: item.category,
      migrations: new Set([...(previous?.migrations || []), item.migration]),
      expectedExists: originalExists,
      expectedSha256: originalSha256
    });
  }

  const planner = {
    ...context,
    installer,
    mappings,
    readRepo,
    readOriginalRepo,
    readVault(rel) {
      return readRepo(`${context.vaultDir}/${rel}`);
    },
    readOriginalVault(rel) {
      return readOriginalRepo(`${context.vaultDir}/${rel}`);
    },
    isKnownHistoricalVaultFile(rel) {
      const original = readOriginalRepo(`${context.vaultDir}/${rel}`);
      if (original == null) {
        return false;
      }
      for (const version of ['0.2.15', '0.2.16', '0.3.0']) {
        const fixturePath = path.join(
          __dirname,
          'fixtures',
          version,
          'Project Notes',
          ...rel.split('/')
        );
        if (!fs.existsSync(fixturePath)) {
          continue;
        }
        const fixture = installer.replaceAppPlaceholders(
          fs.readFileSync(fixturePath, 'utf8'),
          context.appName,
          context.appFileBase
        );
        if (fixture === original) {
          return true;
        }
      }
      return false;
    },
    readSourceVault(rel) {
      const source = fs.readFileSync(
        path.join(installer.kitVersion ? path.dirname(require.resolve('../install-notes-graph.cjs')) : '', 'Project Notes', ...rel.split('/')),
        'utf8'
      );
      return installer.replaceAppPlaceholders(source, context.appName, context.appFileBase);
    },
    repoRelForVault(rel) {
      return `${context.vaultDir}/${rel}`;
    },
    frontmatter(text) {
      return splitFrontmatter(text).frontmatter || {};
    },
    body(text) {
      return splitFrontmatter(text).body;
    },
    withBody(text, body) {
      const parsed = splitFrontmatter(text);
      return parsed.frontmatter ? renderFrontmatter(parsed.frontmatter, body) : body;
    },
    propose: planCandidate,
    proposeMerge(item) {
      if (item.result?.conflict) {
        addItem({
          ...item,
          state: 'conflict',
          action: 'manual',
          reason: `${item.reason}: ${item.result.conflict}`,
          optInRequired: false
        });
        return;
      }
      planCandidate({
        ...item,
        candidate: item.result.content,
        evidence: [...(item.evidence || []), ...(item.result.evidence || [])]
      });
    },
    compliant(item) {
      addItem({ ...item, state: 'compliant' });
    },
    preserved(item) {
      addItem({ ...item, state: 'preserved' });
    },
    manual(item) {
      addItem({ ...item, state: 'manual' });
    },
    conflict(item) {
      addItem({ ...item, state: 'conflict' });
    },
    deferMigrationUntil(migration, targetMigration) {
      const targets = deferredMigrations.get(migration) || new Set();
      targets.add(targetMigration);
      deferredMigrations.set(migration, targets);
    },
    addInfrastructure(item) {
      planCandidate(item);
    },
    items,
    overlay,
    writes,
    deferredMigrations,
    accepted
  };
  return planner;
}

function planInfrastructure(planner, context) {
  const infrastructureMigration = applicableMigrations(context.targetVersion).at(-1).id;
  for (const write of installer.buildVaultWrites(
    context.appName,
    context.vaultDir,
    context.appFileBase
  )) {
    if (planner.readRepo(write.rel) != null) {
      continue;
    }
    planner.addInfrastructure({
      id: `${infrastructureMigration}:infrastructure:${write.rel}`,
      migration: infrastructureMigration,
      category: 'infrastructure',
      rel: write.rel,
      candidate: write.content,
      action: 'create',
      reason: 'missing graph infrastructure is safe to create',
      evidence: ['current frozen skeleton source'],
      destructive: false,
      optInRequired: false
    });
  }

  const scriptsDir = installer.detectScriptsDir(context.repoRoot);
  for (const write of installer.buildScriptWrites(scriptsDir)) {
    const existing = planner.readRepo(write.rel);
    planner.propose({
      id: `${infrastructureMigration}:script:${write.rel}`,
      migration: infrastructureMigration,
      category: 'script',
      rel: write.rel,
      candidate: write.content,
      action: existing == null ? 'create' : 'replace-managed',
      reason: 'install the current config-driven notes helper',
      evidence: ['current kit helper'],
      destructive: existing != null && !context.installedConfig,
      optInRequired: existing != null && !context.installedConfig
    });
  }

  const packageMerge = installer.mergePackageJson(context.repoRoot, scriptsDir);
  if (packageMerge.write) {
    planner.propose({
      id: `${infrastructureMigration}:package:package.json`,
      migration: infrastructureMigration,
      category: 'package',
      rel: 'package.json',
      candidate: packageMerge.write.content,
      action: 'merge',
      reason: 'install notes commands and runtime js-yaml dependency',
      evidence: packageMerge.preservedScripts.map(({ name }) => `preserve custom ${name}`),
      destructive: false,
      optInRequired: false
    });
  } else {
    planner.compliant({
      id: `${infrastructureMigration}:package:package.json`,
      migration: infrastructureMigration,
      category: 'package',
      rel: 'package.json',
      state: 'compliant',
      action: 'none',
      reason: 'package integration already matches',
      evidence: []
    });
  }
  for (const preserved of packageMerge.preservedScripts) {
    planner.preserved({
      id: `${infrastructureMigration}:package-script:${preserved.name}`,
      migration: infrastructureMigration,
      category: 'package',
      rel: 'package.json',
      action: 'preserve',
      reason: `custom ${preserved.name} command is preserved`,
      evidence: [preserved.current]
    });
  }
  const packageLockWrite = installer.mergePackageLock(context.repoRoot);
  if (packageLockWrite) {
    planner.propose({
      id: `${infrastructureMigration}:package:package-lock.json`,
      migration: infrastructureMigration,
      category: 'package',
      rel: 'package-lock.json',
      candidate: packageLockWrite.content,
      action: 'merge',
      reason: 'keep js-yaml available to runtime-only npm installs',
      evidence: ['remove development-only lock metadata'],
      destructive: false,
      optInRequired: false
    });
  }
}

function reportPreservedLegacyNotes(planner, context) {
  const represented = new Set(planner.items.map(({ rel }) => rel));
  const migration = applicableMigrations(context.targetVersion).at(-1).id;
  for (const vaultRel of walkFiles(context.vaultRoot)) {
    if (!vaultRel.endsWith('.md')) {
      continue;
    }
    const repoRel = `${context.vaultDir}/${vaultRel}`;
    if (represented.has(repoRel)) {
      continue;
    }
    planner.preserved({
      id: `${migration}:legacy:${hashText(vaultRel).slice(0, 16)}`,
      migration,
      category: 'legacy',
      rel: repoRel,
      action: 'preserve',
      reason: 'ordinary legacy note is outside managed migration paths',
      evidence: ['preserved byte-for-byte'],
      destructive: false,
      optInRequired: false
    });
  }
}

function applicableMigrations(targetVersion) {
  return MIGRATIONS.filter(
    ({ version }) => installer.compareSemver(version, targetVersion) <= 0
  );
}

function migrationStateFromItems(context, planner) {
  const items = planner.items;
  const existing = context.installedConfig?.vaultMigrationState;
  const applied = new Set(
    existing?.schemaVersion === 1 && Array.isArray(existing.applied)
      ? existing.applied.filter((id) => typeof id === 'string')
      : []
  );
  const applicable = applicableMigrations(context.targetVersion);
  for (const migration of applicable) {
    applied.delete(migration.id);
  }
  let predecessorBlocked = false;
  for (const migration of applicable) {
    const relevant = items.filter((item) => item.migration === migration.id);
    const deferredTargets = planner.deferredMigrations.get(migration.id) || new Set();
    const deferredBlocked = [...deferredTargets].some((targetId) =>
      items.some((item) =>
        item.migration === targetId
        && (item.state === 'conflict' || item.state === 'manual')
      )
    );
    const blocked = predecessorBlocked
      || deferredBlocked
      || relevant.some((item) => item.state === 'conflict' || item.state === 'manual');
    if (!blocked) {
      applied.add(migration.id);
    } else {
      predecessorBlocked = true;
    }
  }
  return {
    schemaVersion: 1,
    applied: [...applied].sort(compareMigrationIds)
  };
}

function prospectiveConfig(context, state) {
  const base = context.installedConfig
    ? JSON.parse(JSON.stringify(context.installedConfig))
    : installer.buildConfig(context.appName, context.vaultDir, context.appFileBase, {
        appliedMigrations: []
      });
  base.appName = context.appName;
  base.vaultDir = context.vaultDir;
  base.appRel = context.appRel;
  base.kitVersion = installer.kitVersion;
  base.vaultMigrationState = state;
  return base;
}

function addConfigWrite(planner, context) {
  const migrationId = applicableMigrations(context.targetVersion).at(-1).id;
  const state = migrationStateFromItems(context, planner);
  const config = prospectiveConfig(context, state);
  planner.propose({
    id: `${migrationId}:config:notes-graph.config.json`,
    migration: migrationId,
    category: 'config',
    rel: 'notes-graph.config.json',
    candidate: `${JSON.stringify(config, null, 2)}\n`,
    action: context.installedConfig ? 'merge' : 'create',
    reason: 'record current kit metadata and independent vault migration state',
    evidence: state.applied,
    destructive: false,
    optInRequired: false
  });
  return config;
}

function validationReport(context, planner, config, baseline = false) {
  const files = virtualVaultFiles(context, baseline ? new Map() : planner.overlay);
  return validateProjectNotesGraph({
    vaultRoot: context.vaultRoot,
    config: baseline
      ? (context.installedConfig || prospectiveConfig(context, { schemaVersion: 1, applied: [] }))
      : config,
    files
  });
}

function reportSummary(items) {
  return {
    compliant: items.filter(({ state }) => state === 'compliant').length,
    planned: items.filter(({ state }) => state === 'planned').length,
    conflict: items.filter(({ state }) => state === 'conflict').length,
    manual: items.filter(({ state }) => state === 'manual').length,
    preserved: items.filter(({ state }) => state === 'preserved').length
  };
}

function finalizeReport(context, planner, mode) {
  const items = stableItems(planner.items);
  const summary = reportSummary(items);
  const writes = [...planner.writes.values()]
    .sort((left, right) => stableCompare(left.rel, right.rel))
    .map(({ rel, content, migrations }) => ({
      rel,
      sha256: hashText(content),
      migrations: [...migrations].sort(stableCompare)
    }));
  const state = JSON.parse(planner.readRepo('notes-graph.config.json') || '{}').vaultMigrationState;
  const currentApplied = context.installedConfig?.vaultMigrationState?.schemaVersion === 1
    && Array.isArray(context.installedConfig.vaultMigrationState.applied)
    ? [...context.installedConfig.vaultMigrationState.applied].sort(compareMigrationIds)
    : [];
  return {
    repoRoot: context.repoRoot,
    vaultRoot: context.vaultRoot,
    installedKitVersion: context.installedConfig?.kitVersion || null,
    targetVersion: context.targetVersion,
    mode,
    summary,
    items,
    writes,
    applied: false,
    currentApplied,
    prospectiveApplied: state?.applied || [],
    backupId: null
  };
}

function planMigration(options) {
  const context = resolveContext(options);
  const planner = makePlanner(context, options);
  planInfrastructure(planner, context);
  for (const definition of applicableMigrations(context.targetVersion)) {
    const migration = require(definition.module);
    migration.apply(planner);
  }
  reportPreservedLegacyNotes(planner, context);
  const config = addConfigWrite(planner, context);

  const baseline = validationReport(context, planner, config, true);
  const prospective = validationReport(context, planner, config, false);
  const baselineErrors = new Set(baseline.errors);
  const newErrors = prospective.errors.filter((error) => !baselineErrors.has(error));
  for (const error of newErrors) {
    planner.conflict({
      id: `validation:${hashText(error).slice(0, 16)}`,
      migration: applicableMigrations(context.targetVersion).at(-1).id,
      category: 'validation',
      rel: context.vaultDir,
      action: 'manual',
      reason: `prospective migration introduces validation error: ${error}`,
      evidence: [],
      destructive: false,
      optInRequired: false
    });
  }
  if (newErrors.length > 0) {
    const configId = `${applicableMigrations(context.targetVersion).at(-1).id}:config:notes-graph.config.json`;
    const priorIndex = planner.items.findIndex(({ id }) => id === configId);
    if (priorIndex !== -1) {
      planner.items.splice(priorIndex, 1);
    }
    addConfigWrite(planner, context);
  }
  const unknownAccepts = [...planner.accepted].filter(
    (id) => !planner.items.some((item) => item.id === id && item.optInRequired)
  );
  if (unknownAccepts.length > 0) {
    throw new MigrationInputError(
      `Unknown or non-opt-in --accept item ID(s): ${unknownAccepts.sort(stableCompare).join(', ')}`
    );
  }
  return {
    context,
    planner,
    report: finalizeReport(context, planner, options.mode || 'audit'),
    baseline,
    prospective
  };
}

function backupBase(context, options) {
  if (!context.git && !options.backupDir) {
    throw new MigrationInputError('Non-Git apply/rollback requires --backup-dir');
  }
  const base = options.backupDir
    ? path.resolve(context.repoRoot, options.backupDir)
    : path.join(context.repoRoot, DEFAULT_BACKUP_REL);
  if (base === context.repoRoot || base === context.vaultRoot) {
    throw new MigrationInputError('--backup-dir must not be the repository or vault root');
  }
  if (fs.existsSync(base) && !fs.statSync(base).isDirectory()) {
    throw new MigrationInputError(`Backup path must be a directory: ${base}`);
  }
  return base;
}

function backupIdNow() {
  return `${new Date().toISOString().replace(/[-:.]/g, '')}-${crypto.randomBytes(4).toString('hex')}`;
}

function assertExpectedPreimage(repoRoot, write) {
  const target = installer.targetPathForWrite(repoRoot, write.rel);
  const exists = fs.existsSync(target);
  if (exists !== write.expectedExists) {
    throw new MigrationInputError(
      `Refusing write because ${write.rel} changed after migration planning`
    );
  }
  if (!exists) {
    return;
  }
  const stat = fs.lstatSync(target);
  if (
    stat.isSymbolicLink()
    || !stat.isFile()
    || hashBuffer(fs.readFileSync(target)) !== write.expectedSha256
  ) {
    throw new MigrationInputError(
      `Refusing write because ${write.rel} changed after migration planning`
    );
  }
}

function writeDurableBackup(context, planner, options) {
  const hook = typeof options.beforeBackupOperation === 'function'
    ? options.beforeBackupOperation
    : () => {};
  const base = backupBase(context, options);
  hook({ phase: 'before-backup-root', rel: null, index: -1 });
  const createdBackupDirectories = [];
  let backupParent = base;
  while (!fs.existsSync(backupParent)) {
    createdBackupDirectories.push(backupParent);
    backupParent = path.dirname(backupParent);
  }
  fs.mkdirSync(base, { recursive: true });
  let id = backupIdNow();
  while (
    fs.existsSync(path.join(base, id))
    || fs.existsSync(path.join(base, `.tmp-${id}`))
  ) {
    id = backupIdNow();
  }
  const temporary = path.join(base, `.tmp-${id}`);
  const finalPath = path.join(base, id);
  let committed = false;
  fs.mkdirSync(path.join(temporary, 'files'), { recursive: true });
  const entries = [];
  const createdDirectories = new Set();
  let index = 0;
  try {
    for (const write of [...planner.writes.values()].sort((a, b) => stableCompare(a.rel, b.rel))) {
      hook({ phase: 'before-backup-file', rel: write.rel, index });
      assertExpectedPreimage(context.repoRoot, write);
      const target = installer.targetPathForWrite(context.repoRoot, write.rel);
      let parent = path.dirname(target);
      while (parent !== context.repoRoot && !fs.existsSync(parent)) {
        createdDirectories.add(toPosix(path.relative(context.repoRoot, parent)));
        parent = path.dirname(parent);
      }
      const existed = fs.existsSync(target);
      let beforeHash = null;
      let mode = null;
      let backupFile = null;
      if (existed) {
        const stat = fs.lstatSync(target);
        if (stat.isSymbolicLink() || !stat.isFile()) {
          throw new Error(`Migration target must be a regular file: ${target}`);
        }
        const bytes = fs.readFileSync(target);
        beforeHash = hashBuffer(bytes);
        mode = stat.mode & 0o7777;
        backupFile = `files/${index}.bin`;
        fs.writeFileSync(path.join(temporary, backupFile), bytes);
      }
      entries.push({
        rel: write.rel,
        originalExists: existed,
        beforeSha256: beforeHash,
        afterSha256: hashText(write.content),
        originalMode: mode,
        backupFile,
        migrationIds: [...write.migrations].sort(stableCompare)
      });
      hook({ phase: 'after-backup-file', rel: write.rel, index });
      index += 1;
    }
    const manifest = {
      schemaVersion: 1,
      backupId: id,
      repoRoot: context.repoRoot,
      vaultRoot: context.vaultRoot,
      createdAt: new Date().toISOString(),
      entries,
      createdDirectories: [...createdDirectories].sort((left, right) => {
        const depth = (value) => value.split('/').length;
        return depth(right) - depth(left) || stableCompare(right, left);
      }),
      configState: context.installedConfig?.vaultMigrationState || null
    };
    hook({ phase: 'before-backup-manifest', rel: MANIFEST_NAME, index });
    fs.writeFileSync(
      path.join(temporary, MANIFEST_NAME),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    fs.renameSync(temporary, finalPath);
    committed = true;
    hook({ phase: 'after-backup-commit', rel: MANIFEST_NAME, index });
    return { id, path: finalPath, manifest, createdBackupDirectories };
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    if (committed) {
      fs.rmSync(finalPath, { recursive: true, force: true });
    }
    for (const directory of createdBackupDirectories) {
      try {
        fs.rmdirSync(directory);
      } catch {
        break;
      }
    }
    throw error;
  }
}

function removeFailedBackup(backup) {
  if (!backup) {
    return;
  }
  fs.rmSync(backup.path, { recursive: true, force: true });
  for (const directory of backup.createdBackupDirectories || []) {
    try {
      fs.rmdirSync(directory);
    } catch {
      break;
    }
  }
}

function gitExcludePath(repoRoot) {
  return execFileSync(
    'git',
    ['-C', repoRoot, 'rev-parse', '--git-path', 'info/exclude'],
    { encoding: 'utf8' }
  ).trim();
}

function ensureLocalBackupExclude(context) {
  if (!context.git) {
    return { changed: false };
  }
  const excludePath = path.resolve(context.repoRoot, gitExcludePath(context.repoRoot));
  const line = `${DEFAULT_BACKUP_REL}/`;
  const existed = fs.existsSync(excludePath);
  const current = existed ? fs.readFileSync(excludePath, 'utf8') : '';
  if (current.split(/\r?\n/).includes(line)) {
    return { changed: false };
  }
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  const separator = current && !current.endsWith('\n') ? '\n' : '';
  const temporary = `${excludePath}.notes-graph-${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${current}${separator}${line}\n`);
  fs.renameSync(temporary, excludePath);
  return {
    changed: true,
    excludePath,
    existed,
    previous: current
  };
}

function restoreLocalBackupExclude(change) {
  if (!change?.changed) {
    return;
  }
  if (change.existed) {
    fs.writeFileSync(change.excludePath, change.previous);
  } else if (fs.existsSync(change.excludePath)) {
    fs.unlinkSync(change.excludePath);
  }
}

function applyMigration(options) {
  const planned = planMigration({ ...options, mode: 'apply' });
  if (!options.allSafe) {
    throw new MigrationInputError('apply requires --all-safe');
  }
  if (!planned.context.git && !options.backupDir) {
    throw new MigrationInputError('Non-Git apply/rollback requires --backup-dir');
  }
  if (planned.report.items.some(
    (item) => item.category === 'validation' && item.state === 'conflict'
  )) {
    return planned;
  }
  if (options.dryRun || planned.planner.writes.size === 0) {
    return planned;
  }
  const excludeChange = ensureLocalBackupExclude(planned.context);
  let backup;
  try {
    backup = writeDurableBackup(planned.context, planned.planner, options);
    const plannedWrites = [...planned.planner.writes.values()];
    const externalHook = typeof options.beforeOperation === 'function'
      ? options.beforeOperation
      : () => {};
    installer.executeWriteTransaction(
      planned.context.repoRoot,
      plannedWrites.map(({ rel, content }) => ({
        rel,
        content,
        kind: 'migration'
      })),
      {
        beforeOperation(event) {
          externalHook(event);
          if (event.phase === 'before-commit') {
            for (const write of plannedWrites) {
              assertExpectedPreimage(planned.context.repoRoot, write);
            }
          } else if (event.phase === 'before-write') {
            const write = plannedWrites.find(({ rel }) => rel === event.rel);
            assertExpectedPreimage(planned.context.repoRoot, write);
          }
        }
      }
    );
  } catch (error) {
    if (backup) {
      removeFailedBackup(backup);
    }
    restoreLocalBackupExclude(excludeChange);
    throw error;
  }
  planned.report.backupId = backup.id;
  planned.report.applied = true;
  planned.report.items = planned.report.items.map((item) =>
    item.state === 'planned' ? { ...item, state: 'compliant' } : item
  );
  planned.report.summary = reportSummary(planned.report.items);
  return planned;
}

function readManifest(context, options) {
  if (!options.backup) {
    throw new MigrationInputError('rollback requires --backup <backup-id>');
  }
  if (!/^[A-Za-z0-9._-]+$/.test(options.backup)) {
    throw new MigrationInputError('Invalid --backup ID');
  }
  const base = backupBase(context, options);
  const backupPath = path.join(base, options.backup);
  const manifestPath = path.join(backupPath, MANIFEST_NAME);
  if (!ensureRegularFileOrMissing(manifestPath, 'backup manifest')) {
    throw new MigrationInputError(`Backup does not exist: ${options.backup}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new MigrationInputError(`Invalid backup manifest: ${error.message}`);
  }
  if (manifest.schemaVersion !== 1 || manifest.backupId !== options.backup) {
    throw new MigrationInputError('Unsupported or mismatched backup manifest');
  }
  if (fs.realpathSync(manifest.repoRoot) !== context.repoRoot) {
    throw new MigrationInputError('Backup belongs to a different repository');
  }
  return { backupPath, manifest };
}

function rollbackMigration(options) {
  const repoRoot = installer.validateRepoRoot(options.repo || process.cwd(), {
    allowNonGit: Boolean(options.allowNonGit)
  });
  const context = {
    repoRoot,
    git: isGitWorktree(repoRoot),
    installedConfig: null,
    targetVersion: supportedTargetVersion(options.to)
  };
  const { backupPath, manifest } = readManifest(context, options);
  context.vaultRoot = manifest.vaultRoot;
  const writes = [];
  for (const entry of manifest.entries) {
    if (!isSafeRelativePath(entry.rel)) {
      throw new MigrationInputError(`Unsafe path in backup manifest: ${entry.rel}`);
    }
    const target = installer.targetPathForWrite(context.repoRoot, entry.rel);
    const exists = fs.existsSync(target);
    const targetIsRegular = exists
      && !fs.lstatSync(target).isSymbolicLink()
      && fs.lstatSync(target).isFile();
    if (!targetIsRegular || hashBuffer(fs.readFileSync(target)) !== entry.afterSha256) {
      throw new MigrationInputError(
        `Refusing rollback because ${entry.rel} differs from its post-migration hash`
      );
    }
    if (entry.originalExists) {
      if (
        !isSafeRelativePath(entry.backupFile)
        || !entry.backupFile.startsWith('files/')
      ) {
        throw new MigrationInputError(`Unsafe backup payload path for ${entry.rel}`);
      }
      const backupFile = path.join(backupPath, entry.backupFile);
      if (!ensureRegularFileOrMissing(backupFile, 'backup payload')) {
        throw new MigrationInputError(`Missing backup payload for ${entry.rel}`);
      }
      const bytes = fs.readFileSync(backupFile);
      if (hashBuffer(bytes) !== entry.beforeSha256) {
        throw new MigrationInputError(`Backup payload hash mismatch for ${entry.rel}`);
      }
      writes.push({
        rel: entry.rel,
        content: bytes,
        mode: entry.originalMode,
        kind: 'rollback',
        expectedExists: true,
        expectedSha256: entry.afterSha256
      });
    } else {
      writes.push({
        rel: entry.rel,
        delete: true,
        kind: 'rollback',
        expectedExists: true,
        expectedSha256: entry.afterSha256
      });
    }
  }
  const recordedTargets = new Set(manifest.entries.map(({ rel }) => rel));
  for (const rel of manifest.createdDirectories || []) {
    if (!isSafeRelativePath(rel)) {
      throw new MigrationInputError(`Unsafe created directory in backup manifest: ${rel}`);
    }
    const directory = path.join(context.repoRoot, ...rel.split('/'));
    if (!fs.existsSync(directory)) {
      throw new MigrationInputError(
        `Refusing rollback because migration-created directory is missing: ${rel}`
      );
    }
    for (const childRel of walkFiles(directory)) {
      const repoChildRel = toPosix(path.join(rel, childRel));
      if (!recordedTargets.has(repoChildRel)) {
        throw new MigrationInputError(
          `Refusing rollback because ${repoChildRel} was added after migration`
        );
      }
    }
  }
  context.installedConfig = readConfig(repoRoot);
  if (!options.dryRun) {
    const externalHook = typeof options.beforeOperation === 'function'
      ? options.beforeOperation
      : () => {};
    installer.executeWriteTransaction(context.repoRoot, writes, {
      beforeOperation(event) {
        externalHook(event);
        if (event.phase === 'before-commit') {
          for (const write of writes) {
            assertExpectedPreimage(context.repoRoot, write);
          }
        } else if (event.phase === 'before-write') {
          const write = writes.find(({ rel }) => rel === event.rel);
          assertExpectedPreimage(context.repoRoot, write);
        }
      }
    });
    for (const rel of manifest.createdDirectories || []) {
      const directory = path.join(context.repoRoot, ...rel.split('/'));
      if (fs.existsSync(directory)) {
        fs.rmdirSync(directory);
      }
    }
  }
  return {
    repoRoot: context.repoRoot,
    vaultRoot: context.vaultRoot,
    installedKitVersion: context.installedConfig?.kitVersion || null,
    targetVersion: context.targetVersion,
    mode: 'rollback',
    summary: {
      compliant: options.dryRun ? 0 : writes.length,
      planned: options.dryRun ? writes.length : 0,
      conflict: 0,
      manual: 0,
      preserved: 0
    },
    items: writes.map((write) => ({
      id: `rollback:${options.backup}:${write.rel}`,
      migration: 'rollback',
      category: 'rollback',
      rel: write.rel,
      state: options.dryRun ? 'planned' : 'compliant',
      action: write.delete ? 'remove-created' : 'restore',
      reason: 'restore durable migration backup',
      evidence: [options.backup],
      destructive: Boolean(write.delete),
      optInRequired: false
    })),
    writes: writes.map(({ rel }) => ({ rel })).sort((a, b) => stableCompare(a.rel, b.rel)),
    applied: !options.dryRun,
    currentApplied: context.installedConfig?.vaultMigrationState?.schemaVersion === 1
      && Array.isArray(context.installedConfig.vaultMigrationState.applied)
      ? [...context.installedConfig.vaultMigrationState.applied].sort(compareMigrationIds)
      : [],
    prospectiveApplied: manifest.configState?.schemaVersion === 1
      && Array.isArray(manifest.configState.applied)
      ? [...manifest.configState.applied].sort(compareMigrationIds)
      : [],
    backupId: options.backup
  };
}

module.exports = {
  DEFAULT_BACKUP_REL,
  MigrationInputError,
  applyMigration,
  hashBuffer,
  loadMapping,
  planMigration,
  resolveContext,
  rollbackMigration,
  stableItems
};
