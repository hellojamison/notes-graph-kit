const path = require('node:path');

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

function planInstructionFile(planner, agentsRel, migration, category) {
  const itemId = (kind, rel) => `${migration}:${kind}:${rel}`;
  const agents = planner.readRepo(agentsRel);
  if (agents == null) {
    const desired = planner.installer.agentsSnippet(
      planner.appName,
      planner.vaultDir,
      path.posix.basename(planner.appRel, '.md'),
      planner.appRel
    ).trimEnd();
    planner.propose({
      id: itemId(category, agentsRel),
      migration,
      category,
      rel: agentsRel,
      candidate: `# ${path.basename(planner.repoRoot)}\n\n${desired}\n`,
      reason: 'adoption needs the managed Project Notes Graph instructions',
      evidence: [`${agentsRel} is missing`],
      action: 'create',
      destructive: false,
      optInRequired: false
    });
  } else {
    const scan = planner.installer.scanAgentsContent(agents);
    const hasMarkers = scan.starts.length > 0 || scan.ends.length > 0;
    const complete = scan.starts.length === 1 && scan.ends.length === 1
      && scan.starts[0] < scan.ends[0];
    const block = { status: hasMarkers ? (complete ? 'found' : 'invalid') : 'missing' };
    if (complete) {
      const lines = agents.match(/[^\n]*(?:\n|$)/g).filter(Boolean);
      const startLine = scan.starts[0];
      const endLine = scan.ends[0];
      block.start = lines.slice(0, startLine).join('').length
        + lines[startLine].indexOf(planner.installer.AGENTS_SECTION_START);
      block.end = lines.slice(0, endLine).join('').length
        + lines[endLine].indexOf(planner.installer.AGENTS_SECTION_END)
        + planner.installer.AGENTS_SECTION_END.length;
    }
    if (block.status === 'invalid') {
      planner.conflict({
        id: itemId(category, agentsRel),
        migration,
        category,
        rel: agentsRel,
        reason: `${agentsRel} has incomplete or duplicate managed markers`,
        evidence: [],
        destructive: true,
        optInRequired: false
      });
    } else if (block.status === 'missing') {
      if (scan.hasLegacyHeading) {
        const legacy = legacyAgentsSections(agents);
        if (legacy.unclosedFence || legacy.sections.length !== 1) {
          planner.conflict({
            id: itemId(`${category}-legacy-heading`, agentsRel),
            migration,
            category,
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
            path.posix.basename(planner.appRel, '.md'),
            planner.appRel
          ).trimEnd();
          const [section] = legacy.sections;
          const suffix = agents.slice(section.end);
          const separator = suffix ? '\n\n' : '\n';
          planner.propose({
            id: itemId(`${category}-legacy-heading`, agentsRel),
            migration,
            category,
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
          id: itemId(category, agentsRel),
          migration,
          category,
          rel: agentsRel,
          reason: `unmanaged ${agentsRel} content is preserved byte-for-byte`,
          evidence: ['no notes-graph-kit managed marker pair'],
          action: 'preserve'
        });
      }
    } else {
      const desired = planner.installer.agentsSnippet(
        planner.appName,
        planner.vaultDir,
        path.posix.basename(planner.appRel, '.md'),
        planner.appRel
      ).trimEnd();
      const candidate = `${agents.slice(0, block.start)}${desired}${agents.slice(block.end)}`;
      planner.propose({
        id: itemId(category, agentsRel),
        migration,
        category,
        rel: agentsRel,
        candidate,
        action: 'replace-managed',
        reason: `refresh only the installer-managed ${agentsRel} block`,
        evidence: ['complete notes-graph-kit marker pair'],
        destructive: false,
        optInRequired: false
      });
    }
  }
}

module.exports = { planInstructionFile };
