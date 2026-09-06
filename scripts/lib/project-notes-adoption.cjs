// Read-only adoption inventory shared by notes:stats and notes:recommend.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { extractWikilinkTargets, resolveTargetDetailed } = require('./project-notes-graph.cjs');
const { extractReceiptBlocks, extractOpenItemsBlock, validateReceipt } = require('./project-notes-receipts.cjs');

const AGENT_FILES = Object.freeze({ codex: 'AGENTS.md', cursor: 'AGENTS.md', claude: 'CLAUDE.md', gemini: 'GEMINI.md', copilot: '.github/copilot-instructions.md' });
const SECTION_START = '<!-- notes-graph-kit:start -->';
const SECTION_END = '<!-- notes-graph-kit:end -->';
const LEGACY_SECTION_START = '<!-- notes-graph-kit:agents:start -->';
const LEGACY_SECTION_END = '<!-- notes-graph-kit:agents:end -->';

function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function regularState(file) {
  if (!fs.existsSync(file)) return 'missing';
  const stat = fs.lstatSync(file);
  return stat.isFile() && !stat.isSymbolicLink() ? 'configured' : 'unsafe';
}
function contractState(repoRoot, name) { return regularState(path.join(repoRoot, name)); }
function scriptsDir(repoRoot, hashes = {}) {
  for (const dir of ['scripts', 'Scripts']) if (Object.keys(hashes).some((rel) => fs.existsSync(path.join(repoRoot, dir, rel.replace(/^scripts\//, ''))))) return dir;
  return 'scripts';
}
function instruction(config, repoRoot) {
  const agent = typeof config.agent === 'string' && AGENT_FILES[config.agent] ? config.agent : 'codex';
  const rel = AGENT_FILES[agent]; const file = path.join(repoRoot, rel); const state = regularState(file);
  let presence = 'missing';
  if (state === 'configured') {
    const text = fs.readFileSync(file, 'utf8');
    const marker = text.includes(SECTION_START) || text.includes(SECTION_END)
      ? [SECTION_START, SECTION_END] : [LEGACY_SECTION_START, LEGACY_SECTION_END];
    let fence = null; let starts = 0; let ends = 0; let startAt = -1; let endAt = -1;
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fence) { if (new RegExp(`^ {0,3}\\${fence.char}{${fence.length},}[ \\t]*$`).test(line)) fence = null; continue; }
      if (fenceMatch) { fence = { char: fenceMatch[1][0], length: fenceMatch[1].length }; continue; }
      if (line.trim() === marker[0]) { starts += 1; startAt = index; }
      if (line.trim() === marker[1]) { ends += 1; endAt = index; }
    }
    presence = starts === 1 && ends === 1 && startAt < endAt ? 'present' : starts || ends ? 'malformed' : 'missing';
  } else if (state === 'unsafe') presence = 'unsafe';
  return { selected_agent: agent, file: rel, presence };
}
function helpers(repoRoot, config) {
  const recorded = config.managedScriptHashes && typeof config.managedScriptHashes === 'object' && !Array.isArray(config.managedScriptHashes) ? config.managedScriptHashes : {};
  const dir = scriptsDir(repoRoot, recorded);
  const entries = Object.keys(recorded).sort().map((sourceRel) => {
    const rel = `${dir}/${sourceRel.replace(/^scripts\//, '')}`;
    const file = path.join(repoRoot, rel);
    if (!fs.existsSync(file)) return { path: rel, state: 'missing', recorded_sha256: recorded[sourceRel] };
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) return { path: rel, state: 'unsafe', recorded_sha256: recorded[sourceRel] };
    const actual = sha256(fs.readFileSync(file, 'utf8'));
    return { path: rel, state: actual === recorded[sourceRel] ? 'unchanged' : 'modified', recorded_sha256: recorded[sourceRel], actual_sha256: actual };
  });
  return { recorded: Object.keys(recorded).length > 0, directory: dir, unchanged: entries.filter((x) => x.state === 'unchanged').length, modified: entries.filter((x) => x.state === 'modified').length, missing: entries.filter((x) => x.state === 'missing').length, unsafe: entries.filter((x) => x.state === 'unsafe').length, entries };
}
function date(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null; }
function statusAndEvidence(graph, config) {
  const claims = new Map(); const statusDates = [];
  const notes = graph.notes.filter((n) => n.frontmatter?.type !== 'template');
  for (const note of notes.filter((n) => n.frontmatter?.type === 'status')) {
    const targets = (Array.isArray(note.frontmatter.related_processes) ? note.frontmatter.related_processes : [note.frontmatter.related_processes]).filter((x) => typeof x === 'string').flatMap(extractWikilinkTargets);
    for (const target of targets) { const resolved = resolveTargetDetailed(target, graph.index); if (resolved.status === 'resolved') claims.set(resolved.rel, [...(claims.get(resolved.rel) || []), note.rel]); }
    statusDates.push({ path: note.rel, date: date(note.frontmatter.last_updated) || date(note.frontmatter.last_verified) || date(note.frontmatter.date) });
  }
  const active = (Array.isArray(config.routes) ? config.routes : []).map((r) => r?.processRel).filter((x) => typeof x === 'string').filter((rel) => {
    const resolved = resolveTargetDetailed(rel, graph.index);
    return resolved.status !== 'resolved' || graph.noteByRel.get(resolved.rel)?.frontmatter?.status !== 'draft';
  }).map((rel) => {
    const status = claims.get(rel) || []; return { process: rel, status_notes: status, state: status.length === 0 ? 'missing-status' : status.length === 1 ? 'covered' : 'duplicate-status' };
  });
  let v2 = 0; let validReceipts = 0; let invalidReceipts = 0;
  for (const note of notes.filter((n) => n.frontmatter?.type === 'evidence' && (n.frontmatter.evidence_format === 2 || n.frontmatter.evidence_format === '2'))) {
    v2 += 1; const parsed = extractReceiptBlocks(note.body); const ids = new Set();
    for (const receipt of parsed.receipts) { if (validateReceipt(receipt, ids).length === 0) validReceipts += 1; else invalidReceipts += 1; }
    invalidReceipts += parsed.errors.length;
  }
  // Parse open items too: this keeps malformed structured Status records visible as adoption gaps.
  const malformedOpenItems = notes.filter((n) => n.frontmatter?.type === 'status').reduce((count, n) => count + extractOpenItemsBlock(n.body).errors.length, 0);
  return { processes: { configured_active: active.length, covered: active.filter((x) => x.state === 'covered').length, missing_status: active.filter((x) => x.state === 'missing-status').map((x) => x.process), duplicate_status: active.filter((x) => x.state === 'duplicate-status').map((x) => x.process), entries: active }, evidence_v2: { notes: v2, valid_receipts: validReceipts, invalid_receipts: invalidReceipts }, status_update_dates: statusDates.sort((a, b) => a.path.localeCompare(b.path)), malformed_open_item_blocks: malformedOpenItems };
}
function adoptionReport(repoRoot, graph, options = {}) {
  const configPath = path.join(repoRoot, 'notes-graph.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const status = graph ? statusAndEvidence(graph, config) : { processes: { configured_active: Array.isArray(config.routes) ? config.routes.length : 0, covered: 0, missing_status: [], duplicate_status: [], entries: [] }, evidence_v2: { notes: 0, valid_receipts: 0, invalid_receipts: 0 }, status_update_dates: [], malformed_open_item_blocks: 0 };
  const contracts = { search: { state: contractState(repoRoot, 'notes-search-eval.yml') }, context: { state: contractState(repoRoot, 'notes-context-eval.yml') } };
  if (options.evaluation) contracts.search.result = options.evaluation;
  if (options.contextEvaluation) contracts.context.result = options.contextEvaluation;
  return { kit_version: typeof config.kitVersion === 'string' ? config.kitVersion : null, instruction: instruction(config, repoRoot), helpers: helpers(repoRoot, config), migrations: { label: 'recorded state; not a fresh audit', recorded_ids: Array.isArray(config.vaultMigrationState?.applied) ? [...config.vaultMigrationState.applied] : [] }, ...status, contracts };
}
module.exports = { adoptionReport, regularState, contractState };
