import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromTest = createRequire(import.meta.url);
const migratorPath = path.join(kitRoot, 'migrate-notes-graph.cjs');
const start = '<!-- notes-graph-kit:start -->';
const end = '<!-- notes-graph-kit:end -->';

function fixture(agent = 'codex') {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-instructions-'));
  execFileSync('git', ['-C', repo, 'init', '--quiet']);
  execFileSync('node', [path.join(kitRoot, 'install-notes-graph.cjs'),
    '--repo', repo, '--app', 'Instruction App', '--vault', 'Local Notes', '--agent', agent]);
  return repo;
}

function migrate(repo, command, ...args) {
  const result = spawnSync('node', [migratorPath, command, '--repo', repo, ...args, '--json'], {
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 2, result.stderr);
  return { ...result, report: JSON.parse(result.stdout) };
}

function managedChangeArgs(repoRoot, scriptsDir = 'scripts') {
  const installer = requireFromTest(path.join(kitRoot, 'install-notes-graph.cjs'));
  return installer.buildScriptWrites(scriptsDir).flatMap(({ rel }) => {
    const target = path.join(repoRoot, rel);
    if (!fs.existsSync(target)) return [];
    const hash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    return ['--accept-managed-change', `${rel}=${hash}`];
  });
}

for (const [agent, instructionFile] of Object.entries({ codex: 'AGENTS.md', cursor: 'AGENTS.md', claude: 'CLAUDE.md', gemini: 'GEMINI.md', copilot: '.github/copilot-instructions.md' })) {
test(`${agent} migration creates only selected instructions with read-only previews, idempotency, and rollback`, () => {
  const repo = fixture(agent);
  try {
    const file = path.join(repo, instructionFile);
    const original = fs.readFileSync(file, 'utf8');
    const configBefore = fs.readFileSync(path.join(repo, 'notes-graph.config.json'), 'utf8');
    const unselected = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md'].filter((rel) => rel !== instructionFile);
    for (const rel of unselected) {
      fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
      fs.writeFileSync(path.join(repo, rel), 'Custom unrelated instructions.\n');
    }
    fs.rmSync(file);
    const oldAudit = migrate(repo, 'audit', '--to', '0.14.0');
    assert.equal(oldAudit.report.items.some(({ rel }) => rel === instructionFile), instructionFile === 'AGENTS.md');
    const audit = migrate(repo, 'audit');
    const item = audit.report.items.find(({ rel }) => rel === instructionFile);
    assert.equal(item.action, 'create');
    assert.equal(item.state, 'planned');
    assert.equal(item.migration, instructionFile === 'AGENTS.md' ? 'vault-0.4.0-managed-sections' : 'vault-0.15.0-claude-instructions');
    assert.equal(fs.existsSync(file), false);
    migrate(repo, 'apply', '--all-safe', '--dry-run');
    assert.equal(fs.existsSync(file), false);
    assert.equal(fs.existsSync(path.join(repo, '.notes-graph-kit')), false);
    const applied = migrate(repo, 'apply', '--all-safe');
    assert.equal(applied.status, 0);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    for (const rel of unselected) {
      assert.equal(fs.readFileSync(path.join(repo, rel), 'utf8'), 'Custom unrelated instructions.\n');
      assert.equal(applied.report.items.some((item) => item.rel === rel), false);
    }
    const repeated = migrate(repo, 'audit');
    assert.equal(repeated.status, 0);
    assert.deepEqual(repeated.report.writes, []);
    const rollback = migrate(repo, 'rollback', '--backup', applied.report.backupId);
    assert.equal(rollback.status, 0);
    assert.equal(fs.existsSync(file), false);
    assert.equal(fs.readFileSync(path.join(repo, 'notes-graph.config.json'), 'utf8'), configBefore);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
}

for (const [agent, instructionFile] of Object.entries({ codex: 'AGENTS.md', claude: 'CLAUDE.md', gemini: 'GEMINI.md', copilot: '.github/copilot-instructions.md' })) {
  test(`${instructionFile} migration refreshes the real managed block and preserves fenced examples and surrounding bytes`, () => {
    const repo = fixture(agent);
    try {
      const file = path.join(repo, instructionFile);
      const prefix = `# Local instructions\r\n\r\n\`\`\`md\r\n${start}\r\nExample only\r\n${end}\r\n\`\`\`\r\n\r\n`;
      const suffix = '\r\n\r\n## Local policy\r\nKeep this policy.\r\n';
      const original = `${prefix}${start}\r\n## Project Notes Graph\r\nStale managed text\r\n${end}${suffix}`;
      fs.writeFileSync(file, original);
      const audit = migrate(repo, 'audit');
      const item = audit.report.items.find(({ rel }) => rel === instructionFile);
      assert.equal(item.state, 'planned');
      assert.equal(item.action, 'replace-managed');
      assert.equal(fs.readFileSync(file, 'utf8'), original);
      const applied = migrate(repo, 'apply', '--all-safe');
      assert.equal(applied.status, 0);
      const current = fs.readFileSync(file, 'utf8');
      assert.ok(current.startsWith(prefix));
      assert.ok(current.endsWith(suffix));
      assert.doesNotMatch(current, /Stale managed text/);
      assert.match(current, /Local Notes/);
      assert.equal(migrate(repo, 'audit').status, 0);
      assert.equal(migrate(repo, 'rollback', '--backup', applied.report.backupId).status, 0);
      assert.equal(fs.readFileSync(file, 'utf8'), original);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test(`${instructionFile} legacy adoption requires its exact acceptance ID and rollback retains original content`, () => {
    const repo = fixture(agent);
    try {
      const file = path.join(repo, instructionFile);
      const original = '# Local policy\n\n## Project Notes Graph\n\nCustom legacy instructions.\n\n## Other Policy\n\nKeep this.\n';
      fs.writeFileSync(file, original);
      const audit = migrate(repo, 'audit');
      const item = audit.report.items.find(({ rel }) => rel === instructionFile);
      assert.equal(item.state, 'conflict');
      assert.equal(item.optInRequired, true);
      const safe = migrate(repo, 'apply', '--all-safe');
      assert.equal(safe.status, 1);
      assert.equal(fs.readFileSync(file, 'utf8'), original);
      const accepted = migrate(repo, 'apply', '--all-safe', '--accept', item.id);
      assert.equal(accepted.status, 0);
      const current = fs.readFileSync(file, 'utf8');
      assert.match(current, /^# Local policy\n/);
      assert.match(current, /## Other Policy\n\nKeep this\.\n$/);
      assert.doesNotMatch(current, /Custom legacy instructions/);
      assert.equal(migrate(repo, 'rollback', '--backup', accepted.report.backupId).status, 0);
      assert.equal(fs.readFileSync(file, 'utf8'), original);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test(`${instructionFile} migration preserves unmanaged content and rejects malformed managed blocks`, () => {
    const repo = fixture(agent);
    try {
      const file = path.join(repo, instructionFile);
      const unmanaged = `# Local policy\n\n\`\`\`md\n${start}\n## Project Notes Graph\n${end}\n\`\`\`\n`;
      fs.writeFileSync(file, unmanaged);
      const preserved = migrate(repo, 'audit').report.items.find(({ rel }) => rel === instructionFile);
      assert.equal(preserved.state, 'preserved');
      migrate(repo, 'apply', '--all-safe');
      assert.equal(fs.readFileSync(file, 'utf8'), unmanaged);
      for (const content of [
        `${start}\nMissing end\n`,
        `${start}\n${end}\n${start}\n${end}\n`,
        '## Project Notes Graph\n\n```md\nUnclosed legacy fence\n',
        '## Project Notes Graph\nOne\n## Project Notes Graph\nTwo\n'
      ]) {
        fs.writeFileSync(file, content);
        const audit = migrate(repo, 'audit');
        const item = audit.report.items.find(({ rel }) => rel === instructionFile);
        assert.ok(['conflict', 'manual'].includes(item.state));
        assert.equal(item.optInRequired, false);
        assert.equal(migrate(repo, 'apply', '--all-safe').status, 1);
        assert.equal(fs.readFileSync(file, 'utf8'), content);
      }
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
}

for (const appRel of ['Products/Main.md', 'Apps/Nested/Main.md']) {
  const agent = 'claude';
  test(`instruction migration honors configured appRel ${appRel} for create, refresh, and legacy adoption`, () => {
    const repo = fixture(agent);
    try {
      const configPath = path.join(repo, 'notes-graph.config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const oldAppPath = path.join(repo, config.vaultDir, config.appRel);
      config.appRel = appRel;
      const newAppPath = path.join(repo, config.vaultDir, appRel);
      fs.mkdirSync(path.dirname(newAppPath), { recursive: true });
      fs.renameSync(oldAppPath, newAppPath);
      fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
      const claudePath = path.join(repo, 'CLAUDE.md');
      fs.rmSync(claudePath);
      const created = migrate(repo, 'apply', '--all-safe');
      assert.equal(created.status, 0);
      const expectedLink = `Link task notes to \`${appRel}\``;
      for (const instructionFile of ['CLAUDE.md']) {
        const text = fs.readFileSync(path.join(repo, instructionFile), 'utf8');
        assert.ok(text.includes(expectedLink), text);
        assert.equal(text.includes('Apps/Main.md'), false, text);
      }
      fs.writeFileSync(claudePath, '## Project Notes Graph\n\nCustom legacy guidance.\n');
      const legacy = migrate(repo, 'audit').report.items.find(({ rel }) => rel === 'CLAUDE.md');
      assert.equal(legacy.optInRequired, true);
      const adopted = migrate(repo, 'apply', '--all-safe', '--accept', legacy.id);
      assert.equal(adopted.status, 0);
      assert.ok(fs.readFileSync(claudePath, 'utf8').includes(expectedLink));
      assert.equal(migrate(repo, 'audit').status, 0);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
}

test('legacy config defaults to Codex without creating other agent files and rollback restores config', () => {
  const repo = fixture();
  try {
    const configPath = path.join(repo, 'notes-graph.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    delete config.agent;
    const original = `${JSON.stringify(config, null, 2)}\n`;
    fs.writeFileSync(configPath, original);
    const applied = migrate(repo, 'apply', '--all-safe');
    assert.equal(applied.status, 0);
    assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf8')).agent, 'codex');
    for (const rel of ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md']) {
      assert.equal(fs.existsSync(path.join(repo, rel)), false);
    }
    assert.equal(migrate(repo, 'rollback', '--backup', applied.report.backupId).status, 0);
    assert.equal(fs.readFileSync(configPath, 'utf8'), original);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('migration rejects an unknown configured agent without target writes', () => {
  const repo = fixture();
  try {
    const configPath = path.join(repo, 'notes-graph.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.agent = 'unsupported';
    const original = `${JSON.stringify(config, null, 2)}\n`;
    fs.writeFileSync(configPath, original);
    const result = spawnSync('node', [migratorPath, 'apply', '--repo', repo, '--all-safe'], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unknown agent/);
    assert.equal(fs.readFileSync(configPath, 'utf8'), original);
    assert.equal(fs.existsSync(path.join(repo, '.notes-graph-kit')), false);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

for (const [agent, instructionFile] of Object.entries({ codex: 'AGENTS.md', cursor: 'AGENTS.md', claude: 'CLAUDE.md', gemini: 'GEMINI.md', copilot: '.github/copilot-instructions.md' })) {
  test(`${agent} unmanaged adoption selects only its instruction file and rollback removes the adopted config`, () => {
    const repo = fixture(agent);
    try {
      const configPath = path.join(repo, 'notes-graph.config.json');
      fs.unlinkSync(configPath);
      fs.unlinkSync(path.join(repo, instructionFile));
      const options = ['--app', 'Instruction App', '--vault', 'Local Notes', '--agent', agent];
      const rejected = spawnSync('node', [migratorPath, 'audit', '--repo', repo, ...options, '--json'], { encoding: 'utf8' });
      assert.equal(rejected.status, 1, rejected.stderr);
      const rejectedReport = JSON.parse(rejected.stdout);
      assert.ok(rejectedReport.items.some((item) =>
        item.category === 'script' && item.optInRequired && item.rel === 'scripts/project-notes.cjs'
      ));
      const acceptedOptions = [...options, ...managedChangeArgs(repo)];
      const audit = migrate(repo, 'audit', ...acceptedOptions);
      assert.equal(audit.report.items.some((item) => item.rel === instructionFile && item.action === 'create'), true);
      assert.equal(fs.existsSync(configPath), false);
      migrate(repo, 'apply', ...acceptedOptions, '--all-safe', '--dry-run');
      assert.equal(fs.existsSync(configPath), false);
      assert.equal(fs.existsSync(path.join(repo, instructionFile)), false);
      const applied = migrate(repo, 'apply', ...acceptedOptions, '--all-safe');
      assert.equal(applied.status, 0);
      assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf8')).agent, agent);
      for (const file of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md']) {
        assert.equal(fs.existsSync(path.join(repo, file)), file === instructionFile, file);
      }
      assert.equal(migrate(repo, 'audit').status, 0);
      assert.equal(migrate(repo, 'rollback', '--backup', applied.report.backupId).status, 0);
      assert.equal(fs.existsSync(configPath), false);
      assert.equal(fs.existsSync(path.join(repo, instructionFile)), false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
}

test('migration refuses an agent override for an installed repo or rollback', () => {
  const repo = fixture('claude');
  try {
    const configPath = path.join(repo, 'notes-graph.config.json');
    const original = fs.readFileSync(configPath, 'utf8');
    for (const command of ['audit', 'apply', 'rollback']) {
      const result = spawnSync('node', [migratorPath, command, '--repo', repo, '--agent', 'gemini', ...(command === 'apply' ? ['--all-safe'] : [])], { encoding: 'utf8' });
      assert.equal(result.status, 2);
      assert.match(result.stderr, /--agent/);
      assert.equal(fs.readFileSync(configPath, 'utf8'), original);
      assert.equal(fs.existsSync(path.join(repo, 'GEMINI.md')), false);
    }
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
