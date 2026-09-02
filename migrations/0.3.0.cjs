const {
  mergeHeadingSection,
  mergeManagedSection,
  mergeTemplate
} = require('./utils.cjs');

const MIGRATION = 'vault-0.3.0-typed-templates';

const TEMPLATES = [
  ['Templates/Task Note Template.md', 'task'],
  ['Templates/Evidence Template.md', 'evidence'],
  ['Templates/App Template.md', 'app'],
  ['Templates/Process Template.md', 'process'],
  ['Templates/Runbook Template.md', 'runbook'],
  ['Templates/Decision Record Template.md', 'decision'],
  ['Templates/Incident Note Template.md', 'incident'],
  ['Templates/Release Note Template.md', 'release']
];

function itemId(category, rel) {
  return `${MIGRATION}:${category}:${rel}`;
}

function apply(planner) {
  for (const [rel, type] of TEMPLATES) {
    const existing = planner.readVault(rel);
    const desired = planner.readSourceVault(rel);
    if (existing == null) {
      planner.propose({
        id: itemId('template', rel),
        migration: MIGRATION,
        category: 'template',
        rel: planner.repoRelForVault(rel),
        candidate: desired,
        action: 'create',
        reason: `${type} source template is missing`,
        evidence: [`source ${rel}`],
        destructive: false,
        optInRequired: false
      });
      continue;
    }
    planner.proposeMerge({
      id: itemId('template', rel),
      migration: MIGRATION,
      category: 'template',
      rel: planner.repoRelForVault(rel),
      existing,
      result: mergeTemplate(existing, desired, type),
      action: 'replace-managed',
      reason: 'template outer metadata and marked scaffold must follow the typed-template contract',
      destructive: false,
      optInRequired: false
    });
  }

  const readmeRel = 'Templates/_README.md';
  const readme = planner.readVault(readmeRel);
  const desiredReadme = planner.readSourceVault(readmeRel);
  if (readme == null) {
    planner.propose({
      id: itemId('documentation', readmeRel),
      migration: MIGRATION,
      category: 'documentation',
      rel: planner.repoRelForVault(readmeRel),
      candidate: desiredReadme,
      action: 'create',
      reason: 'template usage guide is missing',
      evidence: [`source ${readmeRel}`],
      destructive: false,
      optInRequired: false
    });
  } else if (
    readme === desiredReadme
    || readme.includes('<!-- notes-graph-kit:managed:templates-index:start -->')
  ) {
    planner.compliant({
      id: itemId('documentation', readmeRel),
      migration: MIGRATION,
      category: 'documentation',
      rel: planner.repoRelForVault(readmeRel),
      action: 'none',
      reason: 'template usage guide already matches',
      evidence: ['current managed source']
    });
  } else {
    const merged = mergeManagedSection(
      readme,
      desiredReadme,
      '<!-- notes-graph-kit:managed:templates-index:start -->',
      '<!-- notes-graph-kit:managed:templates-index:end -->'
    );
    const ambiguous = merged.evidence?.some((entry) => entry.startsWith('append '));
    if (ambiguous && planner.targetVersion !== '0.3.0') {
      planner.deferMigrationUntil(MIGRATION, 'vault-0.4.0-managed-sections');
      planner.preserved({
        id: itemId('documentation', readmeRel),
        migration: MIGRATION,
        category: 'documentation',
        rel: planner.repoRelForVault(readmeRel),
        action: 'preserve',
        reason: 'customized template guide is deferred to the 0.4.0 managed-section item',
        evidence: merged.evidence
      });
    } else {
      planner.proposeMerge({
        id: itemId('documentation', readmeRel),
        migration: MIGRATION,
        category: 'documentation',
        rel: planner.repoRelForVault(readmeRel),
        existing: readme,
        result: merged,
        action: 'replace-managed',
        reason: 'template guide must describe CLI-managed scaffolds',
        destructive: Boolean(ambiguous),
        optInRequired: Boolean(ambiguous)
      });
    }
  }

  const docs = [
    ['_Codex/Start Here.md', 'Workflow', 'Validation'],
    ['Notes System.md', 'Template Contract', 'Status Rules']
  ];
  for (const [rel, heading, beforeHeading] of docs) {
    const existing = planner.readVault(rel);
    const desired = planner.readSourceVault(rel);
    if (existing == null) {
      planner.manual({
        id: itemId('documentation', rel),
        migration: MIGRATION,
        category: 'documentation',
        rel: planner.repoRelForVault(rel),
        reason: 'documentation note is missing',
        evidence: [],
        destructive: false,
        optInRequired: true
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
        reason: `exact frozen historical ${heading} guide can be upgraded deterministically`,
        evidence: ['matched checked-in historical fixture'],
        destructive: false,
        optInRequired: false
      });
      continue;
    }
    if (existing === desired) {
      planner.compliant({
        id: itemId('documentation', rel),
        migration: MIGRATION,
        category: 'documentation',
        rel: planner.repoRelForVault(rel),
        action: 'none',
        reason: `documentation already includes the 0.3.0 ${heading} guidance`,
        evidence: ['current managed source']
      });
      continue;
    }
    if (planner.targetVersion !== '0.3.0') {
      planner.deferMigrationUntil(MIGRATION, 'vault-0.4.0-managed-sections');
      planner.preserved({
        id: itemId('documentation', rel),
        migration: MIGRATION,
        category: 'documentation',
        rel: planner.repoRelForVault(rel),
        action: 'preserve',
        reason: `customized ${heading} section is deferred to the 0.4.0 managed-section item`,
        evidence: ['unmarked or customized legacy documentation']
      });
      continue;
    }
    const currentBody = planner.body(existing);
    const desiredBody = planner.body(desired);
    const merged = mergeHeadingSection(currentBody, desiredBody, heading, {
      replaceExisting: false,
      beforeHeading
    });
    const reviewed = merged.conflict
      ? mergeHeadingSection(currentBody, desiredBody, heading, {
          replaceExisting: true,
          beforeHeading
        })
      : merged;
    planner.proposeMerge({
      id: itemId('documentation', rel),
      migration: MIGRATION,
      category: 'documentation',
      rel: planner.repoRelForVault(rel),
      existing,
      result: {
        content: planner.withBody(existing, reviewed.content),
        evidence: reviewed.evidence
      },
      action: 'replace-managed',
      reason: `documentation must include the 0.3.0 ${heading} guidance`,
      destructive: true,
      optInRequired: true
    });
  }
}

module.exports = {
  id: MIGRATION,
  version: '0.3.0',
  apply
};
