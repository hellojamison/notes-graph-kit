const fs = require('node:fs');
const path = require('node:path');
const {
  mergeManagedSection
} = require('./utils.cjs');
const { planInstructionFile } = require('./instruction-files.cjs');

const MIGRATION = 'vault-0.4.0-managed-sections';
const MANAGED_DOCS = [
  {
    rel: '_Codex/Start Here.md',
    start: '<!-- notes-graph-kit:managed:start-here:start -->',
    end: '<!-- notes-graph-kit:managed:start-here:end -->'
  },
  {
    rel: 'Notes System.md',
    start: '<!-- notes-graph-kit:managed:notes-system:start -->',
    end: '<!-- notes-graph-kit:managed:notes-system:end -->'
  },
  {
    rel: 'Templates/_README.md',
    start: '<!-- notes-graph-kit:managed:templates-index:start -->',
    end: '<!-- notes-graph-kit:managed:templates-index:end -->'
  }
];

function itemId(category, rel) {
  return `${MIGRATION}:${category}:${rel}`;
}

function apply(planner) {
  if (planner.instructionFile === 'AGENTS.md') {
    planInstructionFile(planner, 'AGENTS.md', MIGRATION, 'agents');
  }

  for (const { rel, start, end } of MANAGED_DOCS) {
    const existing = planner.readVault(rel);
    const desired = planner.readSourceVault(rel);
    if (existing == null) {
      planner.propose({
        id: itemId('documentation', rel),
        migration: MIGRATION,
        category: 'documentation',
        rel: planner.repoRelForVault(rel),
        candidate: desired,
        action: 'create',
        reason: 'known managed documentation note is missing',
        evidence: [`source ${rel}`],
        destructive: false,
        optInRequired: false
      });
      continue;
    }
    if (planner.isKnownHistoricalVaultFile(rel)) {
      planner.propose({
        id: itemId('documentation', rel),
        migration: MIGRATION,
        category: 'documentation',
        rel: planner.repoRelForVault(rel),
        candidate: desired,
        action: 'replace-known',
        reason: 'exact frozen historical guide can be upgraded deterministically',
        evidence: ['matched checked-in historical fixture'],
        destructive: false,
        optInRequired: false
      });
      continue;
    }
    const merged = mergeManagedSection(
      planner.body(existing),
      planner.body(desired),
      start,
      end
    );
    const ambiguous = merged.evidence?.some((entry) => entry.startsWith('append '));
    planner.proposeMerge({
      id: itemId('documentation', rel),
      migration: MIGRATION,
      category: 'documentation',
      rel: planner.repoRelForVault(rel),
      existing,
      result: merged.conflict
        ? merged
        : {
            content: merged.content === planner.body(existing)
              ? existing
              : planner.withBody(existing, merged.content),
            evidence: merged.evidence
          },
      action: 'replace-managed',
      reason: 'documentation needs an explicitly owned managed section',
      destructive: Boolean(ambiguous),
      optInRequired: Boolean(ambiguous)
    });
  }

  const names = fs.readdirSync(planner.repoRoot)
    .filter((name) => name === 'scripts' || name === 'Scripts')
    .filter((name) => fs.lstatSync(path.join(planner.repoRoot, name)).isDirectory())
    .sort();
  if (names.length <= 1) {
    planner.compliant({
      id: itemId('scripts', 'scripts'),
      migration: MIGRATION,
      category: 'scripts',
      rel: names[0] || 'scripts',
      reason: names.length === 0
        ? 'no existing scripts directory needs migration'
        : `${names[0]} directory casing is supported`,
      evidence: names,
      action: 'none'
    });
  } else {
    planner.conflict({
      id: itemId('scripts', names.join('+')),
      migration: MIGRATION,
      category: 'scripts',
      rel: names.join(', '),
      reason: 'both scripts/ and Scripts/ exist; choose one before upgrading',
      evidence: names,
      destructive: true,
      optInRequired: false
    });
  }
}

module.exports = {
  id: MIGRATION,
  version: '0.4.0',
  apply
};
