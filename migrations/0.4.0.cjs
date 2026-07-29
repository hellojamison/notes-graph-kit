const fs = require('node:fs');
const path = require('node:path');
const {
  markedBlock,
  mergeManagedSection
} = require('./utils.cjs');

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

function legacyAgentsSections(content) {
  const sections = [];
  const lines = String(content).match(/[^\n]*(?:\n|$)/g).filter(Boolean);
  let offset = 0;
  let fence = null;
  let active = null;
  for (const lineWithEnding of lines) {
    const line = lineWithEnding.replace(/\r?\n$/, '');
    const lineStart = offset;
    offset += lineWithEnding.length;
    if (fence) {
      const closePattern = new RegExp(
        `^ {0,3}\\${fence.character}{${fence.length},}[ \\t]*$`
      );
      if (closePattern.test(line)) {
        fence = null;
      }
      continue;
    }
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      fence = { character: marker[0], length: marker.length };
      continue;
    }
    if (/^ {0,3}#{1,2}[ \t]+/.test(line) && active != null) {
      sections.push({ start: active, end: lineStart });
      active = null;
    }
    if (/^ {0,3}##[ \t]+Project Notes Graph[ \t]*$/.test(line)) {
      active = lineStart;
    }
  }
  if (active != null) {
    sections.push({ start: active, end: content.length });
  }
  return { sections, unclosedFence: fence != null };
}

function apply(planner) {
  const agentsRel = 'AGENTS.md';
  const agents = planner.readRepo(agentsRel);
  if (agents == null) {
    const desired = planner.installer.agentsSnippet(
      planner.appName,
      planner.vaultDir,
      path.posix.basename(planner.appRel, '.md')
    ).trimEnd();
    planner.propose({
      id: itemId('agents', agentsRel),
      migration: MIGRATION,
      category: 'agents',
      rel: agentsRel,
      candidate: `# ${path.basename(planner.repoRoot)}\n\n${desired}\n`,
      reason: 'adoption needs the managed Project Notes Graph instructions',
      evidence: ['AGENTS.md is missing'],
      action: 'create',
      destructive: false,
      optInRequired: false
    });
  } else {
    const block = markedBlock(
      agents,
      planner.installer.AGENTS_SECTION_START,
      planner.installer.AGENTS_SECTION_END
    );
    if (block.status === 'invalid') {
      planner.conflict({
        id: itemId('agents', agentsRel),
        migration: MIGRATION,
        category: 'agents',
        rel: agentsRel,
        reason: 'AGENTS.md has incomplete or duplicate managed markers',
        evidence: [],
        destructive: true,
        optInRequired: false
      });
    } else if (block.status === 'missing') {
      const scan = planner.installer.scanAgentsContent(agents);
      if (scan.hasLegacyHeading) {
        const legacy = legacyAgentsSections(agents);
        if (legacy.unclosedFence || legacy.sections.length !== 1) {
          planner.conflict({
            id: itemId('agents-legacy-heading', agentsRel),
            migration: MIGRATION,
            category: 'agents',
            rel: agentsRel,
            reason: 'legacy Project Notes Graph section is ambiguous and cannot be replaced safely',
            evidence: [
              `${legacy.sections.length} exact heading section(s) outside fenced code`,
              legacy.unclosedFence ? 'unclosed fenced code block' : 'fences are balanced'
            ],
            action: 'manual',
            destructive: true,
            optInRequired: false
          });
        } else {
          const desired = planner.installer.agentsSnippet(
            planner.appName,
            planner.vaultDir,
            path.posix.basename(planner.appRel, '.md')
          ).trimEnd();
          const [section] = legacy.sections;
          const suffix = agents.slice(section.end);
          const separator = suffix ? '\n\n' : '\n';
          planner.propose({
            id: itemId('agents-legacy-heading', agentsRel),
            migration: MIGRATION,
            category: 'agents',
            rel: agentsRel,
            candidate: `${agents.slice(0, section.start)}${desired}${separator}${suffix}`,
            reason: 'legacy unmarked Project Notes Graph section needs explicit managed-block adoption',
            evidence: ['one exact heading section outside fenced code', 'surrounding content is retained'],
            action: 'replace-legacy-section',
            destructive: true,
            optInRequired: true
          });
        }
      } else {
        planner.preserved({
          id: itemId('agents', agentsRel),
          migration: MIGRATION,
          category: 'agents',
          rel: agentsRel,
          reason: 'unmanaged AGENTS.md content is preserved byte-for-byte',
          evidence: ['no notes-graph-kit managed marker pair'],
          action: 'preserve'
        });
      }
    } else {
      const desired = planner.installer.agentsSnippet(
        planner.appName,
        planner.vaultDir,
        path.posix.basename(planner.appRel, '.md')
      ).trimEnd();
      const candidate = `${agents.slice(0, block.start)}${desired}${agents.slice(block.end)}`;
      planner.propose({
        id: itemId('agents', agentsRel),
        migration: MIGRATION,
        category: 'agents',
        rel: agentsRel,
        candidate,
        action: 'replace-managed',
        reason: 'refresh only the installer-managed AGENTS block',
        evidence: ['complete notes-graph-kit marker pair'],
        destructive: false,
        optInRequired: false
      });
    }
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
