const {
  mergeManagedSection,
  mergeTemplate
} = require('./utils.cjs');

const MIGRATION = 'vault-0.14.0-current-evidence';
const TEMPLATES = [
  ['Templates/Evidence Template.md', 'evidence'],
  ['Templates/Decision Record Template.md', 'decision'],
  ['Templates/Status Note Template.md', 'status']
];
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
  for (const [templateRel, type] of TEMPLATES) {
    const existing = planner.readVault(templateRel);
    const desired = planner.readSourceVault(templateRel);
    if (existing == null) {
      planner.propose({
        id: itemId('template', templateRel),
        migration: MIGRATION,
        category: 'template',
        rel: planner.repoRelForVault(templateRel),
        candidate: desired,
        action: 'create',
        reason: `${type} source template is missing`,
        evidence: [`source ${templateRel}`],
        destructive: false,
        optInRequired: false
      });
    } else {
      planner.proposeMerge({
        id: itemId('template', templateRel),
        migration: MIGRATION,
        category: 'template',
        rel: planner.repoRelForVault(templateRel),
        existing,
        result: mergeTemplate(existing, desired, type),
        action: 'replace-managed',
        reason: 'template must support current verdicts, decisions, and structured receipts',
        destructive: false,
        optInRequired: false
      });
    }
  }

  for (const { rel, start, end } of MANAGED_DOCS) {
    const existing = planner.readVault(rel);
    if (existing == null) {
      continue;
    }
    if (!existing.includes(start) || !existing.includes(end)) {
      planner.preserved({
        id: itemId('documentation', rel),
        migration: MIGRATION,
        category: 'documentation',
        rel: planner.repoRelForVault(rel),
        action: 'preserve',
        reason: 'unmanaged documentation is preserved byte-for-byte',
        evidence: ['no complete managed marker pair']
      });
      continue;
    }
    const desired = planner.readSourceVault(rel);
    const merged = mergeManagedSection(planner.body(existing), planner.body(desired), start, end);
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
      reason: 'managed guidance needs the current-evidence workflow',
      destructive: false,
      optInRequired: false
    });
  }
}

module.exports = {
  id: MIGRATION,
  version: '0.14.0',
  apply
};
