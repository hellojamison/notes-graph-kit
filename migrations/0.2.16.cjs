const {
  canonicalDate,
  mergeBaseTemplateExclusion,
  mergeFrontmatter
} = require('./utils.cjs');

const MIGRATION = 'vault-0.2.16-schema-indexes';

const INDEXES = [
  'Decisions/_README.md',
  'Incidents/_README.md',
  'Releases/_README.md',
  'Runbooks/_README.md',
  'Known-Good/_README.md'
];

const SEEDS = [
  ['_Codex/Start Here.md', 'notes/index'],
  ['Processes/Notes Graph Maintenance.md', 'notes/process'],
  ['Runbooks/Codex Notes Workflow.md', 'notes/runbook'],
  ['Decisions/Notes Graph Adoption Policy.md', 'notes/decision'],
  ['Evidence/Notes Graph Adoption.md', 'notes/evidence']
];

const PRODUCT_TEMPLATES = [
  ['Templates/App Template.md', 'notes/app'],
  ['Templates/Process Template.md', 'notes/process'],
  ['Templates/Runbook Template.md', 'notes/runbook'],
  ['Templates/Evidence Template.md', 'notes/evidence']
];

const BASES = [
  'Bases/Active Work.base',
  'Bases/Decisions.base',
  'Bases/Incidents.base',
  'Bases/Runbooks.base',
  'Dashboards/Notes Review.base'
];

function itemId(category, rel) {
  return `${MIGRATION}:${category}:${rel}`;
}

function schemaReplaceKeys(planner, text) {
  let frontmatter;
  try {
    frontmatter = planner.frontmatter(text);
  } catch {
    return new Set();
  }
  const replaceKeys = new Set();
  if (frontmatter.schema_version !== 1 && frontmatter.schema_version !== '1') {
    replaceKeys.add('schema_version');
  }
  if (!canonicalDate(frontmatter.date)) {
    replaceKeys.add('date');
  }
  if (
    !Array.isArray(frontmatter.tags)
    || frontmatter.tags.length === 0
    || frontmatter.tags.some((tag) => typeof tag !== 'string' || !tag.trim())
  ) {
    replaceKeys.add('tags');
  }
  return replaceKeys;
}

function hasManagedIdentity(planner, rel, text, expectedType) {
  if (planner.isKnownHistoricalVaultFile(rel)) {
    return true;
  }
  try {
    const frontmatter = planner.frontmatter(text);
    return (
      (frontmatter.schema_version === 1 || frontmatter.schema_version === '1')
      && frontmatter.type === expectedType
    ) || (
      frontmatter.type === expectedType
      && typeof frontmatter.app === 'string'
      && Object.prototype.hasOwnProperty.call(frontmatter, 'source_of_truth')
      && typeof frontmatter.confidence === 'string'
    );
  } catch {
    return false;
  }
}

function apply(planner) {
  for (const rel of INDEXES) {
    const existing = planner.readVault(rel);
    const desired = planner.readSourceVault(rel);
    if (existing == null) {
      planner.propose({
        id: itemId('index', rel),
        migration: MIGRATION,
        category: 'index',
        rel: planner.repoRelForVault(rel),
        candidate: desired,
        action: 'create',
        reason: 'required structured-folder index is missing',
        evidence: [`source ${rel}`],
        destructive: false,
        optInRequired: false
      });
      continue;
    }
    const sourceFrontmatter = planner.frontmatter(desired);
    const replaceKeys = schemaReplaceKeys(planner, existing);
    const managedIdentity = hasManagedIdentity(
      planner,
      rel,
      existing,
      sourceFrontmatter.type
    );
    if (!managedIdentity) {
      replaceKeys.add('type');
    }
    const merged = mergeFrontmatter(existing, sourceFrontmatter, {
      requireEqual: managedIdentity ? new Set(['type']) : new Set(),
      replaceKeys
    });
    planner.proposeMerge({
      id: itemId('index', rel),
      migration: MIGRATION,
      category: 'index',
      rel: planner.repoRelForVault(rel),
      existing,
      result: merged,
      action: 'merge',
      reason: 'index metadata must satisfy the schema contract',
      destructive: false,
      optInRequired: !managedIdentity
    });
  }

  const appRel = planner.appRel;
  const appSeed = [appRel, 'notes/app', 'Apps/My Project.md'];
  const managedNotes = [
    ...SEEDS.map(([rel, tag]) => [rel, tag, rel]),
    appSeed,
    ...PRODUCT_TEMPLATES.map(([rel, tag]) => [rel, tag, rel])
  ];
  for (const [rel, tag, sourceRel] of managedNotes) {
    const existing = planner.readVault(rel);
    const id = itemId('frontmatter', rel);
    if (existing == null) {
      planner.propose({
        id,
        migration: MIGRATION,
        category: 'frontmatter',
        rel: planner.repoRelForVault(rel),
        candidate: planner.readSourceVault(sourceRel),
        action: 'create',
        reason: 'known seed or template is missing',
        evidence: [`source ${sourceRel}`],
        destructive: false,
        optInRequired: false
      });
      continue;
    }
    const replaceKeys = schemaReplaceKeys(planner, existing);
    const sourceFrontmatter = planner.frontmatter(planner.readSourceVault(sourceRel));
    const managedIdentity = hasManagedIdentity(
      planner,
      rel,
      existing,
      sourceFrontmatter.type
    );
    if (!managedIdentity) {
      replaceKeys.add('type');
    }
    const merged = mergeFrontmatter(existing, {
      schema_version: 1,
      type: sourceFrontmatter.type,
      date: '2026-07-05',
      tags: [tag]
    }, { replaceKeys });
    planner.proposeMerge({
      id,
      migration: MIGRATION,
      category: 'frontmatter',
      rel: planner.repoRelForVault(rel),
      existing,
      result: merged,
      action: 'merge',
      reason: 'seed metadata must satisfy the schema contract',
      destructive: false,
      optInRequired: !managedIdentity
    });
  }

  for (const mapping of planner.mappings) {
    const rel = mapping.path;
    const existing = planner.readVault(rel);
    const id = itemId('mapping', rel);
    if (existing == null) {
      planner.conflict({
        id,
        migration: MIGRATION,
        category: 'mapping',
        rel: planner.repoRelForVault(rel),
        reason: 'mapped note does not exist',
        evidence: [`mapping ${mapping.source}`],
        destructive: false,
        optInRequired: false
      });
      continue;
    }
    const merged = mergeFrontmatter(existing, {
      schema_version: 1,
      title: mapping.title,
      type: mapping.type,
      status: mapping.status,
      date: mapping.date,
      tags: mapping.tags,
      app: planner.appName,
      related_apps: [
        `[[${planner.appRel.replace(/\.md$/i, '')}|${planner.appName}]]`
      ]
    }, {
      allowMissing: true,
      mergeArrays: new Set(['related_apps']),
      replaceKeys: new Set([
        'schema_version', 'title', 'type', 'status', 'date', 'tags', 'app'
      ])
    });
    planner.proposeMerge({
      id,
      migration: MIGRATION,
      category: 'mapping',
      rel: planner.repoRelForVault(rel),
      existing,
      result: merged,
      action: 'adopt',
      reason: 'explicit mapping adopts the note onto the schema contract',
      destructive: false,
      optInRequired: false
    });
  }

  const taskRel = 'Templates/Task Note Template.md';
  const task = planner.readVault(taskRel);
  if (task == null) {
    planner.manual({
      id: itemId('template', taskRel),
      migration: MIGRATION,
      category: 'template',
      rel: planner.repoRelForVault(taskRel),
      reason: 'task template is missing',
      evidence: [],
      destructive: false,
      optInRequired: true
    });
  } else if (/^## Graph Links[ \t]*$/m.test(task)) {
    planner.compliant({
      id: itemId('template', taskRel),
      migration: MIGRATION,
      category: 'template',
      rel: planner.repoRelForVault(taskRel),
      reason: 'task template already includes Graph Links',
      evidence: ['## Graph Links'],
      action: 'none'
    });
  } else {
    planner.propose({
      id: itemId('template', taskRel),
      migration: MIGRATION,
      category: 'template',
      rel: planner.repoRelForVault(taskRel),
      candidate: `${task.trimEnd()}\n\n## Graph Links\n\n- App:\n- Process:\n- Runbook:\n`,
      action: 'merge',
      reason: 'task notes require body-level graph navigation fields',
      evidence: ['append ## Graph Links'],
      destructive: false,
      optInRequired: false
    });
  }

  for (const rel of BASES) {
    const existing = planner.readVault(rel);
    if (existing == null) {
      planner.manual({
        id: itemId('base', rel),
        migration: MIGRATION,
        category: 'base',
        rel: planner.repoRelForVault(rel),
        reason: 'expected Base is missing',
        evidence: [],
        destructive: false,
        optInRequired: true
      });
      continue;
    }
    planner.proposeMerge({
      id: itemId('base', rel),
      migration: MIGRATION,
      category: 'base',
      rel: planner.repoRelForVault(rel),
      existing,
      result: mergeBaseTemplateExclusion(existing),
      action: 'merge',
      reason: 'templates must not appear as product notes in Bases',
      destructive: false,
      optInRequired: false
    });
  }
}

module.exports = {
  id: MIGRATION,
  version: '0.2.16',
  apply
};
