#!/usr/bin/env node

const {
  MigrationInputError,
  applyMigration,
  planMigration,
  rollbackMigration
} = require('./migrations/index.cjs');
const { kitVersion } = require('./install-notes-graph.cjs');

function usage() {
  return `Notes graph vault migrator (kit version ${kitVersion})

Usage:
  node migrate-notes-graph.cjs audit --repo /path/to/repo [--app "App" --vault "Existing Notes"] [--map migration.yml] [--to ${kitVersion}] [--json]
  node migrate-notes-graph.cjs apply --repo /path/to/repo [--app "App" --vault "Existing Notes"] [--map migration.yml] --all-safe [--accept <item-id> ...] [--dry-run] [--json]
  node migrate-notes-graph.cjs rollback --repo /path/to/repo --backup <backup-id> [--backup-dir /path] [--dry-run] [--json]

Options:
  --repo             Exact Git worktree root. Defaults to the current directory.
  --app              Required with --vault when adopting an unmanaged vault.
  --vault            Existing vault directory name for unmanaged adoption.
  --map              YAML mapping for explicit in-place legacy-note promotion.
  --to               Supported target version at or below this kit (default ${kitVersion}).
  --all-safe         Required by apply; selects every deterministic safe action.
  --accept           Repeatable exact opt-in item ID from audit.
  --dry-run          Preview only; creates no target files or backup.
  --json             Emit the stable machine-readable report.
  --allow-non-git    Permit an intentional non-Git repository root.
  --backup-dir       Durable backup parent; required for non-Git apply/rollback.
  --backup           Backup ID to restore with rollback.
`;
}

function parseArgs(argv) {
  const booleanOptions = new Set([
    'all-safe', 'dry-run', 'json', 'allow-non-git', 'help'
  ]);
  const valueOptions = new Set([
    'repo', 'app', 'vault', 'map', 'to', 'accept', 'backup-dir', 'backup'
  ]);
  const result = { accept: [], _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      result._.push(arg);
      continue;
    }
    const equals = arg.indexOf('=');
    const key = arg.slice(2, equals === -1 ? undefined : equals);
    if (!booleanOptions.has(key) && !valueOptions.has(key)) {
      throw new MigrationInputError(`Unknown option: --${key}`);
    }
    if (booleanOptions.has(key)) {
      if (equals !== -1) {
        throw new MigrationInputError(`--${key} does not take a value`);
      }
      result[key] = true;
      continue;
    }
    const value = equals === -1 ? argv[index + 1] : arg.slice(equals + 1);
    if (!value || (equals === -1 && value.startsWith('--'))) {
      throw new MigrationInputError(
        `Missing value for --${key}; use --${key}=VALUE when a value begins with --`
      );
    }
    if (key === 'accept') {
      result.accept.push(value);
    } else {
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        throw new MigrationInputError(`Duplicate option: --${key}`);
      }
      result[key] = value;
    }
    if (equals === -1) {
      index += 1;
    }
  }
  return result;
}

function normalizedOptions(args, mode) {
  return {
    mode,
    repo: args.repo,
    app: args.app,
    vault: args.vault,
    map: args.map,
    to: args.to,
    allSafe: Boolean(args['all-safe']),
    accept: args.accept,
    dryRun: Boolean(args['dry-run']),
    json: Boolean(args.json),
    allowNonGit: Boolean(args['allow-non-git']),
    backupDir: args['backup-dir'],
    backup: args.backup
  };
}

function assertCommandOptions(args, mode) {
  const common = new Set(['repo', 'to', 'dry-run', 'json', 'allow-non-git', 'help', '_', 'accept']);
  const allowed = mode === 'rollback'
    ? new Set([...common, 'backup', 'backup-dir'])
    : new Set([...common, 'app', 'vault', 'map', 'all-safe', 'backup-dir']);
  const incompatible = Object.keys(args).filter((key) =>
    key !== 'accept'
    && args[key] != null
    && !(Array.isArray(args[key]) && args[key].length === 0)
    && !allowed.has(key)
  );
  if (incompatible.length > 0) {
    throw new MigrationInputError(
      `${mode} cannot be combined with ${incompatible.map((key) => `--${key}`).join(', ')}`
    );
  }
  if (mode !== 'apply' && args['all-safe']) {
    throw new MigrationInputError('--all-safe is valid only with apply');
  }
  if (mode === 'rollback' && args.accept.length > 0) {
    throw new MigrationInputError('--accept is not valid with rollback');
  }
  if (mode !== 'rollback' && args.backup) {
    throw new MigrationInputError('--backup is valid only with rollback');
  }
}

function lineForItem(item) {
  const optIn = item.optInRequired ? ' [accept required]' : '';
  return `  ${item.id}\n    ${item.rel}: ${item.action} — ${item.reason}${optIn}`;
}

function formatHuman(report) {
  const groups = [
    ['Safe automatic', report.items.filter(({ state }) => state === 'planned')],
    ['Explicit opt-in', report.items.filter((item) =>
      item.state === 'conflict' && item.optInRequired
    )],
    ['Manual conflicts', report.items.filter((item) =>
      item.state === 'manual' || (item.state === 'conflict' && !item.optInRequired)
    )],
    ['Preserved legacy', report.items.filter(({ state }) => state === 'preserved')]
  ];
  const lines = [
    `Notes graph migration ${report.mode}: ${report.repoRoot}`,
    `Vault: ${report.vaultRoot}`,
    `Installed kit: ${report.installedKitVersion || 'unmanaged'}; target: ${report.targetVersion}`,
    `Summary: ${report.summary.compliant} compliant, ${report.summary.planned} planned, ${report.summary.conflict} conflict, ${report.summary.manual} manual, ${report.summary.preserved} preserved`
  ];
  for (const [label, items] of groups) {
    lines.push('', `${label} (${items.length})`);
    lines.push(...(items.length > 0 ? items.map(lineForItem) : ['  none']));
  }
  if (report.backupId) {
    lines.push('', `Backup: ${report.backupId}`);
  }
  return `${lines.join('\n')}\n`;
}

function exitCodeFor(mode, result, dryRun) {
  const report = result.report || result;
  if (mode === 'rollback') {
    return dryRun && report.summary.planned > 0 ? 1 : 0;
  }
  if (report.summary.conflict > 0 || report.summary.manual > 0) {
    return 1;
  }
  if (mode === 'audit' || dryRun) {
    return report.summary.planned > 0 ? 1 : 0;
  }
  return 0;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    return { output: usage(), exitCode: 0 };
  }
  const mode = args._.shift();
  if (!['audit', 'apply', 'rollback'].includes(mode) || args._.length > 0) {
    throw new MigrationInputError(
      'Expected exactly one command: audit, apply, or rollback'
    );
  }
  assertCommandOptions(args, mode);
  const options = normalizedOptions(args, mode);
  let result;
  if (mode === 'audit') {
    result = planMigration(options);
  } else if (mode === 'apply') {
    result = applyMigration(options);
  } else {
    result = rollbackMigration(options);
  }
  const report = result.report || result;
  return {
    output: args.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatHuman(report),
    exitCode: exitCodeFor(mode, result, options.dryRun)
  };
}

if (require.main === module) {
  try {
    const result = main();
    process.stdout.write(result.output);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error instanceof MigrationInputError ? 2 : 2;
  }
}

module.exports = {
  assertCommandOptions,
  exitCodeFor,
  formatHuman,
  main,
  parseArgs,
  usage
};
