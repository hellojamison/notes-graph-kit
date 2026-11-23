import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const requireFromTest = createRequire(import.meta.url);
const { evaluateContract } = requireFromTest('../scripts/evaluate-project-notes-context.cjs');
const { loadVaultGraph } = requireFromTest('../scripts/lib/project-notes-graph.cjs');

function note(frontmatter, body) {
  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

function fixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-context-eval-contract-'));
  const vault = path.join(repo, 'Project Notes');
  fs.mkdirSync(path.join(vault, 'Evidence'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'Runbooks'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'Templates'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'notes-graph.config.json'), JSON.stringify({ vaultDir: 'Project Notes' }));
  fs.writeFileSync(path.join(vault, 'Evidence/Rollback.md'), note(
    'title: Rollback Proof\ntype: evidence\nstatus: verified\ndate: "2026-08-27"',
    '# Rollback Proof\n\n## Verification\n\nMigration rollback restored the backup byte for byte.'
  ));
  fs.writeFileSync(path.join(vault, 'Runbooks/Recovery.md'), note(
    'title: Recovery\ntype: runbook\nstatus: current',
    '# Recovery\n\n## Current Status\n\nRestore the immutable backup.'
  ));
  fs.writeFileSync(path.join(vault, 'Templates/Task.md'), note('title: Task Template\ntype: template\nstatus: current', '# Task Template'));
  return repo;
}

function graphFor(repo) {
  return loadVaultGraph({ env: { PROJECT_NOTES_NOTES_VAULT_ROOT: path.join(repo, 'Project Notes') } });
}

function evaluate(cases, graph) {
  return evaluateContract({ schemaVersion: 1, cases }, graph);
}

test('evaluateContract passes when required sources are found, forbidden sources are absent, and ordering holds', () => {
  const repo = fixture();
  try {
    const report = evaluate([
      {
        id: 'rollback',
        query: 'rollback restored backup',
        results: 3,
        maxWords: 300,
        required: [{ path: 'Evidence/Rollback.md', heading: 'Verification', kind: 'match' }],
        ordered: [{ path: 'Evidence/Rollback.md', heading: 'Verification', kind: 'match' }],
        forbidden: [{ path: 'Templates/Task.md' }]
      }
    ], graphFor(repo));
    assert.equal(report.passed, true);
    assert.deepEqual(report.summary, { caseCount: 1, passed: 1, failed: 0 });
    assert.equal(report.cases.length, 1);
    assert.equal(report.cases[0].passed, true);
    assert.equal(report.cases[0].required[0].found, true);
    assert.equal(report.cases[0].forbidden[0].absent, true);
    assert.equal(report.cases[0].ordered[0].index, 1);
    assert.deepEqual(report.cases[0].invariants, {
      budget_respected: true,
      word_counts_consistent: true,
      sources_attributed: true
    });
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('evaluateContract fails when a required source is missing', () => {
  const repo = fixture();
  try {
    const report = evaluate([
      {
        id: 'rollback',
        query: 'rollback restored backup',
        results: 3,
        maxWords: 300,
        required: [{ path: 'Evidence/Missing.md', kind: 'match' }],
        ordered: [],
        forbidden: []
      }
    ], graphFor(repo));
    assert.equal(report.passed, false);
    assert.deepEqual(report.summary, { caseCount: 1, passed: 0, failed: 1 });
    assert.equal(report.cases[0].required[0].found, false);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('evaluateContract fails when a forbidden source is present', () => {
  const repo = fixture();
  try {
    const report = evaluate([
      {
        id: 'rollback',
        query: 'rollback restored backup',
        results: 3,
        maxWords: 300,
        required: [{ path: 'Evidence/Rollback.md', heading: 'Verification', kind: 'match' }],
        ordered: [],
        forbidden: [{ path: 'Evidence/Rollback.md', heading: 'Verification', kind: 'match' }]
      }
    ], graphFor(repo));
    assert.equal(report.passed, false);
    assert.deepEqual(report.summary, { caseCount: 1, passed: 0, failed: 1 });
    assert.equal(report.cases[0].forbidden[0].absent, false);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('evaluateContract fails when an ordered source is missing', () => {
  const repo = fixture();
  try {
    const report = evaluate([
      {
        id: 'rollback',
        query: 'rollback restored backup',
        results: 3,
        maxWords: 300,
        required: [{ path: 'Evidence/Rollback.md', heading: 'Verification', kind: 'match' }],
        ordered: [
          { path: 'Evidence/Missing.md', kind: 'match' },
          { path: 'Evidence/Rollback.md', heading: 'Verification', kind: 'match' }
        ],
        forbidden: []
      }
    ], graphFor(repo));
    assert.equal(report.passed, false);
    assert.equal(report.cases[0].ordered[0].index, null);
    assert.equal(report.cases[0].ordered[1].index, 1);
    assert.deepEqual(report.cases[0].invariants, {
      budget_respected: true,
      word_counts_consistent: true,
      sources_attributed: true
    });
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('evaluateContract keeps the source word budget respected and counts consistent when excerpts truncate', () => {
  const repo = fixture();
  try {
    const report = evaluate([
      {
        id: 'rollback',
        query: 'rollback restored backup',
        results: 3,
        maxWords: 5,
        required: [{ path: 'Evidence/Rollback.md', heading: 'Verification', kind: 'match' }],
        ordered: [],
        forbidden: []
      }
    ], graphFor(repo));
    assert.equal(report.cases[0].passed, true);
    assert.equal(report.cases[0].required[0].found, true);
    assert.equal(report.cases[0].invariants.budget_respected, true);
    assert.equal(report.cases[0].invariants.word_counts_consistent, true);
    assert.equal(report.cases[0].invariants.sources_attributed, true);
    assert.ok(report.cases[0].budget.usedSourceWords <= 5);
    assert.equal(report.cases[0].budget.usedSourceWords + report.cases[0].budget.remainingSourceWords, 5);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('evaluateContract reports only the failing case when multiple cases are evaluated', () => {
  const repo = fixture();
  try {
    const report = evaluate([
      {
        id: 'rollback',
        query: 'rollback restored backup',
        results: 3,
        maxWords: 300,
        required: [{ path: 'Evidence/Rollback.md', heading: 'Verification', kind: 'match' }],
        ordered: [],
        forbidden: []
      },
      {
        id: 'missing',
        query: 'rollback restored backup',
        results: 3,
        maxWords: 300,
        required: [{ path: 'Evidence/Missing.md', kind: 'match' }],
        ordered: [],
        forbidden: []
      }
    ], graphFor(repo));
    assert.equal(report.passed, false);
    assert.deepEqual(report.summary, { caseCount: 2, passed: 1, failed: 1 });
    assert.equal(report.cases[0].passed, true);
    assert.equal(report.cases[1].passed, false);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});
