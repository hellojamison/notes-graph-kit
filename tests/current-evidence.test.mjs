import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cwd, args) {
  return execFileSync('node', args, { cwd, encoding: 'utf8' });
}

function runFailure(cwd, args) {
  const result = spawnSync('node', args, { cwd, encoding: 'utf8' });
  assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

function installRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-graph-kit-current-evidence-'));
  run(kitRoot, [
    'install-notes-graph.cjs', '--repo', repoRoot, '--app', 'Smoke App', '--allow-non-git'
  ]);
  fs.symlinkSync(path.join(kitRoot, 'node_modules'), path.join(repoRoot, 'node_modules'));
  return repoRoot;
}

function createdRel(output) {
  const rel = output.match(/^Created (.+)$/m)?.[1];
  assert.ok(rel, output);
  return rel;
}

function frontmatter(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, filePath);
  return { text, value: yaml.load(match[1]) };
}

test('structured evidence keeps the current verdict, open-item objects, receipts, and artifact index verifiable', () => {
  const repoRoot = installRepo();
  try {
    const statusRel = createdRel(run(repoRoot, [
      'scripts/project-notes.cjs', 'new', '--type', 'status',
      '--title', 'Smoke Status', '--process', 'notes-graph-maintenance', '--summary', 'Phase alpha'
    ]));
    const decisionRel = createdRel(run(repoRoot, [
      'scripts/project-notes.cjs', 'new', '--type', 'decision',
      '--title', 'Smoke Verdict', '--process', 'notes-graph-maintenance'
    ]));
    const evidenceRel = createdRel(run(repoRoot, [
      'scripts/project-notes.cjs', 'new', '--type', 'evidence',
      '--title', 'Focused Evidence', '--topic', 'Focused evidence contract',
      '--process', 'notes-graph-maintenance', '--summary', 'Validate receipts.'
    ]));
    const evidencePath = path.join(repoRoot, 'Project Notes', evidenceRel);
    const artifactPath = path.join(repoRoot, 'artifacts/focused/receipt.txt');
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, 'focused receipt\n');
    const digest = crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
    execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'notes@example.invalid'], { cwd: repoRoot });
    execFileSync('git', ['config', 'user.name', 'Notes Test'], { cwd: repoRoot });
    execFileSync('git', ['add', '.'], { cwd: repoRoot });
    execFileSync('git', ['commit', '-m', 'receipt fixture'], { cwd: repoRoot, stdio: 'ignore' });
    const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    const receipt = [
      '<!-- notes-graph-kit:receipt:start -->',
      '```yaml',
      'id: focused-pass',
      'outcome: verified',
      'tests:',
      '  passed: 20',
      '  filter: swift test --filter FocusedSuite',
      'artifacts:',
      '  - path: artifacts/focused/receipt.txt',
      `    sha256: ${digest}`,
      `    git_sha: ${gitSha}`,
      `decisions:`,
      `  - "[[${decisionRel.replace(/\.md$/, '')}|Smoke Verdict]]"`,
      'open_items:',
      '  - dense-lane-timing',
      'closes_open_items: []',
      '```',
      '<!-- notes-graph-kit:receipt:end -->',
      ''
    ].join('\n');
    fs.writeFileSync(
      evidencePath,
      fs.readFileSync(evidencePath, 'utf8').replace('\n## Not Verified', `\n${receipt}\n## Not Verified`)
    );

    const closeOutput = run(repoRoot, [
      'scripts/project-notes.cjs', 'closeout', '--note', path.join('Project Notes', evidenceRel),
      '--working', 'Structured evidence is implemented.',
      '--verified', 'Focused validation is recorded in the receipt.',
      '--not-verified', 'Obsidian rendering.',
      '--verdict', 'The receipt is self-verifying.',
      '--decision', path.join('Project Notes', decisionRel),
      '--status', path.join('Project Notes', statusRel),
      '--phase', 'Phase beta',
      '--certified', 'The Status note has one structured open-item list.',
      '--open-item', 'dense-lane-timing: Measure dense-lane timing.',
      '--settled', 'Evidence receipts carry the current verdict.'
    ]);
    assert.match(closeOutput, /^Closed /m);
    const closedEvidence = frontmatter(evidencePath);
    assert.equal(closedEvidence.value.status, 'done');
    assert.equal(closedEvidence.value.verification, 'unverified');
    assert.match(closedEvidence.text, /# Focused Evidence\n\n## Current Verdict\n\nThe receipt is self-verifying\./);
    assert.match(closedEvidence.text, /Decision: \[\[Decisions\/Smoke Verdict\|Smoke Verdict\]\]/);
    const dailyRel = closeOutput.match(/^Updated (\d{4}-\d{2}-\d{2}\.md)$/m)?.[1];
    assert.ok(dailyRel, closeOutput);
    const dailyText = fs.readFileSync(path.join(repoRoot, 'Project Notes', dailyRel), 'utf8');
    assert.match(dailyText, /The receipt is self-verifying\. — \[\[Evidence\/.*Focused Evidence/);
    assert.doesNotMatch(dailyText, /Working:|Verified:|Not verified:|Created notes graph/);

    assert.match(run(repoRoot, ['scripts/validate-project-notes-graph.cjs']), /validation passed with 0 warning\(s\)/);
    const indexPreview = run(repoRoot, ['scripts/build-project-notes-artifact-index.cjs']);
    assert.match(indexPreview, /artifacts\/focused\/receipt\.txt/);
    assert.match(run(repoRoot, ['scripts/build-project-notes-artifact-index.cjs', '--write']), /Wrote artifacts\/INDEX\.md/);
    assert.match(fs.readFileSync(path.join(repoRoot, 'artifacts/INDEX.md'), 'utf8'), /Focused Evidence/);

    fs.writeFileSync(artifactPath, 'tampered\n');
    assert.match(runFailure(repoRoot, ['scripts/validate-project-notes-graph.cjs']), /sha256 does not match/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('validator rejects bare test totals, non-chronological managed daily entries, and asymmetric decisions', () => {
  const repoRoot = installRepo();
  try {
    const decisionA = createdRel(run(repoRoot, [
      'scripts/project-notes.cjs', 'new', '--type', 'decision', '--title', 'Old Decision'
    ]));
    const decisionB = createdRel(run(repoRoot, [
      'scripts/project-notes.cjs', 'new', '--type', 'decision', '--title', 'New Decision'
    ]));
    const evidenceRel = createdRel(run(repoRoot, [
      'scripts/project-notes.cjs', 'new', '--type', 'evidence',
      '--title', 'Bare Count Evidence', '--process', 'notes-graph-maintenance'
    ]));
    const evidencePath = path.join(repoRoot, 'Project Notes', evidenceRel);
    fs.appendFileSync(evidencePath, '\n66 focused tests passed.\n');
    const oldPath = path.join(repoRoot, 'Project Notes', decisionA);
    const old = frontmatter(oldPath);
    old.value.status = 'superseded';
    old.value.superseded_by = `[[${decisionB.replace(/\.md$/, '')}|New Decision]]`;
    fs.writeFileSync(oldPath, `---\n${yaml.dump(old.value)}---\n${old.text.split('\n---\n').slice(1).join('\n---\n')}`);
    assert.match(runFailure(repoRoot, ['scripts/validate-project-notes-graph.cjs']), /bare test count found/);
    assert.match(runFailure(repoRoot, ['scripts/validate-project-notes-graph.cjs']), /does not link back with supersedes/);

    const dailyPath = path.join(repoRoot, 'Project Notes/2026-09-02.md');
    fs.writeFileSync(dailyPath, [
      '---', 'title: "2026-09-02"', 'schema_version: 1', 'daily_format: 2', 'type: daily',
      'status: active', 'date: "2026-09-02"', 'tags:', '  - notes/daily',
      'related_apps:', '  - "[[Apps/Smoke App|Smoke App]]"', '---', '', '# 2026-09-02', '',
      '- 13:40 PDT: Later — [[Decisions/Old Decision|Old Decision]]',
      '- 13:39 PDT: Earlier — [[Decisions/New Decision|New Decision]]', ''
    ].join('\n'));
    assert.match(runFailure(repoRoot, ['scripts/validate-project-notes-graph.cjs']), /timestamped daily entries must be chronological/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
