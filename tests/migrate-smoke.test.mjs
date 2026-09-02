import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migratorPath = path.join(kitRoot, 'migrate-notes-graph.cjs');
const installerPath = path.join(kitRoot, 'install-notes-graph.cjs');
const requireFromTest = createRequire(import.meta.url);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function initRepo(prefix = 'notes-graph-migrate-') {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  execFileSync('git', ['-C', repoRoot, 'init', '--quiet']);
  return repoRoot;
}

function runMigration(args) {
  return spawnSync('node', [migratorPath, ...args], { encoding: 'utf8' });
}

function jsonReport(result) {
  assert.doesNotThrow(() => JSON.parse(result.stdout), result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function snapshotUserTree(repoRoot) {
  const entries = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      const rel = path.relative(repoRoot, filePath).split(path.sep).join('/');
      if (
        rel === '.git' || rel.startsWith('.git/')
        || rel === '.notes-graph-kit' || rel.startsWith('.notes-graph-kit/')
      ) {
        continue;
      }
      const stat = fs.lstatSync(filePath);
      if (entry.isDirectory()) {
        entries.push(`d:${rel}:${stat.mode & 0o7777}`);
        visit(filePath);
      } else if (entry.isSymbolicLink()) {
        entries.push(`l:${rel}:${fs.readlinkSync(filePath)}`);
      } else {
        entries.push(`f:${rel}:${stat.mode & 0o7777}:${sha256(fs.readFileSync(filePath))}`);
      }
    }
  }
  visit(repoRoot);
  return entries.sort();
}

test('frozen historical fixtures match their checked-in SHA-256 manifests', () => {
  for (const version of ['0.2.15', '0.2.16', '0.3.0']) {
    const fixtureRoot = path.join(kitRoot, 'migrations', 'fixtures', version);
    const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'));
    assert.equal(manifest.kitVersion, version);
    for (const [rel, expected] of Object.entries(manifest.files)) {
      assert.equal(sha256(fs.readFileSync(path.join(fixtureRoot, rel))), expected, `${version}:${rel}`);
    }
  }
});

test('a fresh 0.4.0 install is semantically migration-compliant without writes', () => {
  const repoRoot = initRepo();
  try {
    const install = spawnSync('node', [
      installerPath,
      '--repo', repoRoot,
      '--app', 'Fresh App',
      '--vault', 'Fresh Notes'
    ], { encoding: 'utf8' });
    assert.equal(install.status, 0, install.stderr);
    const agents = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
    assert.match(agents, /^## Project Notes Graph$/m);
    assert.doesNotMatch(agents, /^## Fresh Notes Graph$/m);
    const before = snapshotUserTree(repoRoot);
    const audit = runMigration(['audit', '--repo', repoRoot, '--json']);
    assert.equal(audit.status, 0, audit.stderr);
    const report = jsonReport(audit);
    assert.equal(report.summary.planned, 0);
    assert.equal(report.summary.conflict, 0);
    assert.equal(report.summary.manual, 0);
    assert.deepEqual(report.writes, []);
    assert.deepEqual(snapshotUserTree(repoRoot), before);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('unmanaged audit is read-only and apply is idempotent and rollback-capable', () => {
  const repoRoot = initRepo();
  try {
    const vaultRoot = path.join(repoRoot, 'Existing Notes');
    fs.mkdirSync(vaultRoot);
    const legacyPath = path.join(vaultRoot, 'Legacy.md');
    fs.writeFileSync(legacyPath, '# Arbitrary legacy note\n\nKeep [[unknown syntax here.\n');
    fs.chmodSync(legacyPath, 0o751);
    const legacyBytes = fs.readFileSync(legacyPath);
    const beforeAudit = snapshotUserTree(repoRoot);

    const audit = runMigration([
      'audit', '--repo', repoRoot, '--app', 'Adopt App',
      '--vault', 'Existing Notes', '--json'
    ]);
    assert.equal(audit.status, 1, audit.stderr);
    const auditReport = jsonReport(audit);
    assert.ok(auditReport.summary.planned > 0);
    assert.equal(auditReport.applied, false);
    assert.deepEqual(auditReport.currentApplied, []);
    assert.deepEqual(auditReport.prospectiveApplied, [
      'vault-0.2.16-schema-indexes',
      'vault-0.3.0-typed-templates',
      'vault-0.4.0-managed-sections',
      'vault-0.13.0-status-notes',
      'vault-0.14.0-current-evidence'
    ]);
    assert.ok(auditReport.items.some((item) =>
      item.rel === 'Existing Notes/Legacy.md'
      && item.category === 'legacy'
      && item.state === 'preserved'
    ));
    assert.deepEqual(snapshotUserTree(repoRoot), beforeAudit);
    assert.equal(fs.existsSync(path.join(repoRoot, '.notes-graph-kit')), false);
    assert.deepEqual(
      auditReport.items.map(({ rel, id }) => `${rel}\0${id}`),
      [...auditReport.items]
        .sort((left, right) =>
          left.rel < right.rel ? -1 : left.rel > right.rel ? 1
            : left.id < right.id ? -1 : left.id > right.id ? 1 : 0
        )
        .map(({ rel, id }) => `${rel}\0${id}`)
    );

    const apply = runMigration([
      'apply', '--repo', repoRoot, '--app', 'Adopt App',
      '--vault', 'Existing Notes', '--all-safe', '--json'
    ]);
    assert.equal(apply.status, 0, apply.stderr);
    const applyReport = jsonReport(apply);
    assert.match(applyReport.backupId, /^[A-Za-z0-9._-]+$/);
    assert.equal(applyReport.applied, true);
    assert.equal(applyReport.summary.planned, 0);
    assert.deepEqual(fs.readFileSync(legacyPath), legacyBytes);
    assert.equal(fs.statSync(legacyPath).mode & 0o777, 0o751);
    const config = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'notes-graph.config.json'), 'utf8')
    );
    assert.deepEqual(config.vaultMigrationState, {
      schemaVersion: 1,
      applied: [
        'vault-0.2.16-schema-indexes',
        'vault-0.3.0-typed-templates',
        'vault-0.4.0-managed-sections',
        'vault-0.13.0-status-notes',
        'vault-0.14.0-current-evidence'
      ]
    });
    const backupRoot = path.join(
      repoRoot,
      '.notes-graph-kit',
      'vault-migration-backups',
      applyReport.backupId
    );
    assert.ok(fs.existsSync(path.join(backupRoot, 'manifest.json')));
    const excludePath = execFileSync(
      'git',
      ['-C', repoRoot, 'rev-parse', '--git-path', 'info/exclude'],
      { encoding: 'utf8' }
    ).trim();
    assert.match(
      fs.readFileSync(path.resolve(repoRoot, excludePath), 'utf8'),
      /^\.notes-graph-kit\/vault-migration-backups\/$/m
    );

    const secondAudit = runMigration(['audit', '--repo', repoRoot, '--json']);
    assert.equal(secondAudit.status, 0, secondAudit.stderr);
    const secondReport = jsonReport(secondAudit);
    assert.equal(secondReport.summary.planned, 0);
    assert.deepEqual(secondReport.writes, []);

    const rollback = runMigration([
      'rollback', '--repo', repoRoot, '--backup', applyReport.backupId, '--json'
    ]);
    assert.equal(rollback.status, 0, rollback.stderr);
    const rollbackReport = jsonReport(rollback);
    assert.equal(rollbackReport.applied, true);
    assert.deepEqual(rollbackReport.currentApplied, [
      'vault-0.2.16-schema-indexes',
      'vault-0.3.0-typed-templates',
      'vault-0.4.0-managed-sections',
      'vault-0.13.0-status-notes',
      'vault-0.14.0-current-evidence'
    ]);
    assert.deepEqual(rollbackReport.prospectiveApplied, []);
    assert.deepEqual(fs.readFileSync(legacyPath), legacyBytes);
    assert.equal(fs.statSync(legacyPath).mode & 0o777, 0o751);
    assert.equal(fs.existsSync(path.join(repoRoot, 'notes-graph.config.json')), false);
    assert.deepEqual(snapshotUserTree(repoRoot), beforeAudit);

    const repeated = runMigration([
      'rollback', '--repo', repoRoot, '--backup', applyReport.backupId, '--json'
    ]);
    assert.equal(repeated.status, 2);
    assert.match(repeated.stderr, /differs from its post-migration hash/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('mapping promotion preserves body and unspecified metadata and adds the app relationship', () => {
  const repoRoot = initRepo();
  try {
    const vaultRoot = path.join(repoRoot, 'Existing Notes');
    fs.mkdirSync(vaultRoot);
    const notePath = path.join(vaultRoot, 'Legacy.md');
    const originalBody = '# Legacy\n\nBody remains exactly here.\n';
    fs.writeFileSync(notePath, originalBody);
    const mapPath = path.join(repoRoot, 'migration.yml');
    fs.writeFileSync(mapPath, [
      'schema_version: 1',
      'entries:',
      '  - path: Legacy.md',
      '    title: Legacy',
      '    type: evidence',
      '    status: active',
      '    date: "2026-07-28"',
      '    tags:',
      '      - notes/evidence',
      ''
    ].join('\n'));

    const result = runMigration([
      'apply', '--repo', repoRoot, '--app', 'Mapped App',
      '--vault', 'Existing Notes', '--map', mapPath, '--all-safe', '--json'
    ]);
    assert.equal(result.status, 0, result.stderr);
    const text = fs.readFileSync(notePath, 'utf8');
    const end = text.indexOf('\n---\n', 4);
    const frontmatter = yaml.load(text.slice(4, end), { schema: yaml.JSON_SCHEMA });
    assert.equal(frontmatter.type, 'evidence');
    assert.equal(frontmatter.app, 'Mapped App');
    assert.deepEqual(frontmatter.related_apps, ['[[Apps/Mapped App|Mapped App]]']);
    assert.equal(text.slice(end + 5), originalBody);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('a custom note colliding with a managed seed path requires its exact acceptance', () => {
  const repoRoot = initRepo();
  try {
    const vaultRoot = path.join(repoRoot, 'Existing Notes');
    const seedPath = path.join(vaultRoot, 'Evidence', 'Notes Graph Adoption.md');
    fs.mkdirSync(path.dirname(seedPath), { recursive: true });
    const customSeed = [
      '---',
      'title: Local Adoption Record',
      'type: evidence',
      'status: active',
      'owner: local-team',
      '---',
      '',
      '# Local Adoption Record',
      '',
      'Custom body stays here.',
      ''
    ].join('\n');
    fs.writeFileSync(seedPath, customSeed);

    const audit = runMigration([
      'audit', '--repo', repoRoot, '--app', 'Collision App',
      '--vault', 'Existing Notes', '--json'
    ]);
    assert.equal(audit.status, 1, audit.stderr);
    const report = jsonReport(audit);
    const collision = report.items.find((item) =>
      item.rel === 'Existing Notes/Evidence/Notes Graph Adoption.md'
      && item.state === 'conflict'
      && item.optInRequired
    );
    assert.ok(collision, JSON.stringify(report.items, null, 2));

    const safe = runMigration([
      'apply', '--repo', repoRoot, '--app', 'Collision App',
      '--vault', 'Existing Notes', '--all-safe', '--json'
    ]);
    assert.equal(safe.status, 1, safe.stderr);
    assert.equal(fs.readFileSync(seedPath, 'utf8'), customSeed);
    const safeConfig = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'notes-graph.config.json'), 'utf8')
    );
    assert.deepEqual(safeConfig.vaultMigrationState.applied, []);

    const accepted = runMigration([
      'apply', '--repo', repoRoot, '--all-safe',
      '--accept', collision.id, '--json'
    ]);
    assert.equal(accepted.status, 0, accepted.stderr);
    const migrated = fs.readFileSync(seedPath, 'utf8');
    assert.match(migrated, /schema_version: 1/);
    assert.match(migrated, /owner: local-team/);
    assert.match(migrated, /Custom body stays here\./);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('dry-run and injected backup or target failures leave the target byte-identical', () => {
  const migrationApi = requireFromTest(path.join(kitRoot, 'migrations/index.cjs'));
  for (const failure of ['dry-run', 'backup', 'target']) {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-migrate-failure-'));
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-backup-'));
    try {
      fs.mkdirSync(path.join(repoRoot, 'Existing Notes'));
      fs.writeFileSync(path.join(repoRoot, 'Existing Notes', 'Legacy.md'), 'untouched\n');
      const before = snapshotUserTree(repoRoot);
      const options = {
        repo: repoRoot,
        app: 'Failure App',
        vault: 'Existing Notes',
        allowNonGit: true,
        backupDir,
        allSafe: true,
        dryRun: failure === 'dry-run'
      };
      if (failure === 'backup') {
        options.beforeBackupOperation = ({ phase }) => {
          if (phase === 'before-backup-manifest') {
            throw new Error('injected backup failure');
          }
        };
      }
      if (failure === 'target') {
        options.beforeOperation = ({ phase, index }) => {
          if (phase === 'after-write' && index === 2) {
            throw new Error('injected target failure');
          }
        };
      }
      if (failure === 'dry-run') {
        migrationApi.applyMigration(options);
      } else {
        assert.throws(
          () => migrationApi.applyMigration(options),
          new RegExp(`injected ${failure} failure`)
        );
      }
      assert.deepEqual(snapshotUserTree(repoRoot), before);
      assert.deepEqual(fs.readdirSync(backupDir), []);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
  }
});

test('apply and rollback refuse a target changed after planning and before commit', () => {
  const migrationApi = requireFromTest(path.join(kitRoot, 'migrations/index.cjs'));
  const repoRoot = initRepo();
  try {
    fs.mkdirSync(path.join(repoRoot, 'Existing Notes'));
    fs.writeFileSync(path.join(repoRoot, 'Existing Notes', 'Legacy.md'), 'legacy\n');
    fs.writeFileSync(path.join(repoRoot, 'package.json'), '{"private":true}\n');
    const packagePath = path.join(repoRoot, 'package.json');
    assert.throws(
      () => migrationApi.applyMigration({
        repo: repoRoot,
        app: 'Race Guard',
        vault: 'Existing Notes',
        allSafe: true,
        beforeOperation({ phase }) {
          if (phase === 'before-commit') {
            fs.appendFileSync(packagePath, 'concurrent edit\n');
          }
        }
      }),
      /package\.json changed after migration planning/
    );
    assert.equal(
      fs.readFileSync(packagePath, 'utf8'),
      '{"private":true}\nconcurrent edit\n'
    );
    assert.equal(fs.existsSync(path.join(repoRoot, 'notes-graph.config.json')), false);

    fs.writeFileSync(packagePath, '{"private":true}\n');
    const applied = migrationApi.applyMigration({
      repo: repoRoot,
      app: 'Race Guard',
      vault: 'Existing Notes',
      allSafe: true
    });
    const configPath = path.join(repoRoot, 'notes-graph.config.json');
    assert.throws(
      () => migrationApi.rollbackMigration({
        repo: repoRoot,
        backup: applied.report.backupId,
        beforeOperation({ phase }) {
          if (phase === 'before-commit') {
            fs.appendFileSync(configPath, 'concurrent edit\n');
          }
        }
      }),
      /notes-graph\.config\.json changed after migration planning/
    );
    assert.match(fs.readFileSync(configPath, 'utf8'), /concurrent edit\n$/);
    assert.ok(fs.existsSync(path.join(repoRoot, 'scripts', 'project-notes.cjs')));
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('rollback refuses every file when any post-migration target was edited', () => {
  const repoRoot = initRepo();
  try {
    fs.mkdirSync(path.join(repoRoot, 'Existing Notes'));
    fs.writeFileSync(path.join(repoRoot, 'Existing Notes', 'Legacy.md'), 'legacy\n');
    const apply = runMigration([
      'apply', '--repo', repoRoot, '--app', 'Edit Guard',
      '--vault', 'Existing Notes', '--all-safe', '--json'
    ]);
    assert.equal(apply.status, 0, apply.stderr);
    const report = jsonReport(apply);
    const configPath = path.join(repoRoot, 'notes-graph.config.json');
    fs.appendFileSync(configPath, '\nuser edit\n');
    const before = snapshotUserTree(repoRoot);

    const rollback = runMigration([
      'rollback', '--repo', repoRoot, '--backup', report.backupId
    ]);
    assert.equal(rollback.status, 2);
    assert.match(rollback.stderr, /notes-graph\.config\.json differs/);
    assert.deepEqual(snapshotUserTree(repoRoot), before);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('migration preserves Scripts casing and makes js-yaml available to production npm installs', () => {
  const repoRoot = initRepo();
  try {
    fs.mkdirSync(path.join(repoRoot, 'Existing Notes'));
    fs.mkdirSync(path.join(repoRoot, 'Scripts'));
    fs.writeFileSync(path.join(repoRoot, 'Existing Notes', 'Legacy.md'), 'legacy\n');
    fs.writeFileSync(path.join(repoRoot, 'package.json'), `${JSON.stringify({
      name: 'runtime-dependency-fixture',
      private: true,
      devDependencies: { 'js-yaml': '^4.1.0' }
    }, null, 2)}\n`);
    const lock = JSON.parse(fs.readFileSync(path.join(kitRoot, 'package-lock.json'), 'utf8'));
    lock.name = 'runtime-dependency-fixture';
    delete lock.packages[''].dependencies;
    lock.packages[''].devDependencies = { 'js-yaml': '^4.1.0' };
    lock.packages['node_modules/js-yaml'].dev = true;
    lock.packages['node_modules/argparse'].dev = true;
    fs.writeFileSync(path.join(repoRoot, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);

    const apply = runMigration([
      'apply', '--repo', repoRoot, '--app', 'Runtime App',
      '--vault', 'Existing Notes', '--all-safe', '--json'
    ]);
    assert.equal(apply.status, 0, apply.stderr);
    assert.ok(fs.readdirSync(repoRoot).includes('Scripts'));
    assert.ok(!fs.readdirSync(repoRoot).includes('scripts'));
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const migratedLock = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8')
    );
    assert.equal(pkg.dependencies['js-yaml'], '^4.1.0');
    assert.equal(pkg.devDependencies, undefined);
    assert.equal(migratedLock.packages[''].dependencies['js-yaml'], '^4.1.0');
    assert.equal(migratedLock.packages['node_modules/js-yaml'].dev, undefined);

    execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts'], {
      cwd: repoRoot,
      stdio: 'pipe'
    });
    execFileSync('node', ['-e', 'require("js-yaml")'], { cwd: repoRoot, stdio: 'pipe' });
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('known historical managed docs migrate cumulatively without acceptance', () => {
  for (const version of ['0.2.15', '0.2.16', '0.3.0']) {
    const repoRoot = initRepo();
    try {
      const fixture = path.join(kitRoot, 'migrations', 'fixtures', version);
      fs.cpSync(path.join(fixture, 'Project Notes'), path.join(repoRoot, 'Project Notes'), {
        recursive: true
      });
      fs.writeFileSync(path.join(repoRoot, 'notes-graph.config.json'), `${JSON.stringify({
        appName: 'My Project',
        vaultDir: 'Project Notes',
        appRel: 'Apps/My Project.md',
        kitVersion: version,
        routes: []
      }, null, 2)}\n`);

      const result = runMigration([
        'apply', '--repo', repoRoot, '--all-safe', '--json'
      ]);
      assert.equal(result.status, 0, `${version}\n${result.stderr}`);
      const report = jsonReport(result);
      assert.equal(report.summary.conflict, 0, version);
      assert.equal(report.summary.manual, 0, version);
      for (const rel of [
        '_Codex/Start Here.md',
        'Notes System.md',
        'Templates/_README.md'
      ]) {
        const text = fs.readFileSync(path.join(repoRoot, 'Project Notes', rel), 'utf8');
        assert.match(text, /notes-graph-kit:managed:/, `${version}:${rel}`);
      }
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  }
});

test('custom structures survive safe merges and ambiguous docs require exact acceptance', () => {
  const repoRoot = initRepo();
  try {
    const vaultRoot = path.join(repoRoot, 'Existing Notes');
    const legacyAgents = [
      '# Local policy',
      '',
      '## Project Notes Graph',
      '',
      'Unmarked local instructions stay untouched.',
      '',
      '## Other Policy',
      '',
      'This following section also stays untouched.',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(repoRoot, 'AGENTS.md'), legacyAgents);
    fs.mkdirSync(path.join(vaultRoot, 'Templates'), { recursive: true });
    fs.mkdirSync(path.join(vaultRoot, 'Bases'), { recursive: true });
    const customGuide = [
      '---',
      'title: Custom Notes Guide',
      'type: runbook',
      'status: active',
      'date: "2026-07-28"',
      'tags: [notes/runbook]',
      'related_apps: ["[[Apps/Custom App|Custom App]]"]',
      'owner: local-team',
      '---',
      '',
      '# Custom Notes Guide',
      '',
      'This prose must survive unchanged.',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(vaultRoot, 'Notes System.md'), customGuide);

    const sourceTemplate = fs.readFileSync(
      path.join(kitRoot, 'Project Notes', 'Templates', 'Runbook Template.md'),
      'utf8'
    );
    const customTemplate = sourceTemplate
      .replace('source_of_truth: false', 'source_of_truth: false\ncustom_scaffold_key: retained')
      .replace('## Steps', 'Custom body line.\n\n## Steps');
    fs.writeFileSync(
      path.join(vaultRoot, 'Templates', 'Runbook Template.md'),
      customTemplate
    );
    const customBase = {
      filters: { and: ['status != "archived"'] },
      formulas: { local_label: 'file.name + " custom"' },
      properties: {
        'formula.local_label': { displayName: 'Local Label' },
        local_only: { displayName: 'Local Only' }
      },
      views: [{
        type: 'table',
        name: 'Custom runbooks',
        filters: { and: ['type == "runbook"'] },
        order: ['file.name', 'formula.local_label']
      }],
      custom_root: { retained: true }
    };
    fs.writeFileSync(
      path.join(vaultRoot, 'Bases', 'Runbooks.base'),
      yaml.dump(customBase, { lineWidth: 120 })
    );

    const audit = runMigration([
      'audit', '--repo', repoRoot, '--app', 'Custom App',
      '--vault', 'Existing Notes', '--json'
    ]);
    assert.equal(audit.status, 1);
    const auditReport = jsonReport(audit);
    const guideConflict = auditReport.items.find((item) =>
      item.rel === 'Existing Notes/Notes System.md'
      && item.state === 'conflict'
      && item.optInRequired
    );
    assert.ok(guideConflict, JSON.stringify(auditReport.items, null, 2));
    const agentsConflict = auditReport.items.find((item) =>
      item.rel === 'AGENTS.md'
      && item.category === 'agents'
      && item.state === 'conflict'
      && item.optInRequired
    );
    assert.ok(agentsConflict, JSON.stringify(auditReport.items, null, 2));

    const safeApply = runMigration([
      'apply', '--repo', repoRoot, '--app', 'Custom App',
      '--vault', 'Existing Notes', '--all-safe', '--json'
    ]);
    assert.equal(safeApply.status, 1, safeApply.stderr);
    const safeReport = jsonReport(safeApply);
    assert.ok(
      safeReport.backupId,
      JSON.stringify(safeReport.items.filter((item) => item.state === 'conflict'), null, 2)
    );
    assert.equal(safeReport.applied, true);
    assert.equal(fs.readFileSync(path.join(vaultRoot, 'Notes System.md'), 'utf8'), customGuide);
    assert.equal(fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8'), legacyAgents);
    const safeConfig = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'notes-graph.config.json'), 'utf8')
    );
    assert.deepEqual(safeConfig.vaultMigrationState.applied, [
      'vault-0.2.16-schema-indexes'
    ]);
    const mergedTemplate = fs.readFileSync(
      path.join(vaultRoot, 'Templates', 'Runbook Template.md'),
      'utf8'
    );
    assert.match(mergedTemplate, /custom_scaffold_key: retained/);
    assert.match(mergedTemplate, /Custom body line\./);
    const mergedBase = yaml.load(
      fs.readFileSync(path.join(vaultRoot, 'Bases', 'Runbooks.base'), 'utf8')
    );
    assert.deepEqual(mergedBase.custom_root, { retained: true });
    assert.deepEqual(mergedBase.formulas, customBase.formulas);
    assert.deepEqual(mergedBase.views, customBase.views);
    assert.match(JSON.stringify(mergedBase.filters), /file\.inFolder/);

    const accepted = runMigration([
      'apply', '--repo', repoRoot, '--all-safe',
      '--accept', guideConflict.id,
      '--accept', agentsConflict.id,
      '--json'
    ]);
    assert.equal(accepted.status, 0, accepted.stderr);
    const acceptedGuide = fs.readFileSync(path.join(vaultRoot, 'Notes System.md'), 'utf8');
    assert.match(acceptedGuide, /This prose must survive unchanged\./);
    assert.match(acceptedGuide, /notes-graph-kit:managed:notes-system:start/);
    const acceptedAgents = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
    assert.match(acceptedAgents, /^# Local policy/m);
    assert.doesNotMatch(acceptedAgents, /Unmarked local instructions stay untouched/);
    assert.match(acceptedAgents, /## Other Policy\n\nThis following section also stays untouched\./);
    assert.match(acceptedAgents, /<!-- notes-graph-kit:start -->/);
    assert.equal(
      [...acceptedAgents.matchAll(/^## Project Notes Graph[ \t]*\r?$/gm)].length,
      1,
      acceptedAgents
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('invalid migration inputs fail with exit code 2 and no writes', () => {
  const repoRoot = initRepo();
  try {
    fs.mkdirSync(path.join(repoRoot, 'Existing Notes'));
    const before = snapshotUserTree(repoRoot);
    for (const args of [
      ['audit', '--repo', repoRoot],
      ['audit', '--repo', repoRoot, '--app', 'App', '--vault', 'Existing Notes', '--to', '0.3.1'],
      ['apply', '--repo', repoRoot, '--app', 'App', '--vault', 'Existing Notes'],
      ['audit', '--repo', repoRoot, '--app', 'App', '--vault', 'Existing Notes', '--map', '../escape.yml']
    ]) {
      const result = runMigration(args);
      assert.equal(result.status, 2, `${args.join(' ')}\n${result.stdout}${result.stderr}`);
      assert.deepEqual(snapshotUserTree(repoRoot), before);
    }
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
