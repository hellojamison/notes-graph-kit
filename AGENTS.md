# notes-graph-kit

## Local work goes straight to main (2026-10-21, Jamison)

Agents on Jamison's Mac Studio (Codex, Claude Code, the local coder) commit and push finished work directly to `main`: no pull request, no CI dispatch. Run this repo's relevant local tests for what changed before pushing, then `git fetch origin && git rebase origin/main && git push origin HEAD:main` (rebase and retry if rejected; never force-push). Asana still records the work: In Progress at start, Solved and complete once pushed, with the commit link. This overrides the PR, branch, review and merge instructions below for local agents; those still apply to the remote agent on Jamison's other computer, which opens PRs for the merge agent. Full rule: `~/.codex/AGENTS.md` (Claude reads the same file as `~/.claude/CLAUDE.md`).

Portable installer and helper scripts for the project notes graph workflow used across multiple project repos. This repo is the **single authoritative source** for the kit — retired copies inside individual app repos are pointers only; change the kit here, then install or upgrade target repos.

The kit scaffolds an Obsidian vault skeleton, copies config-driven CLI helpers (`notes:route`, `notes:new`, `notes:closeout`, `notes:search`, `notes:context`, `notes:search:eval`, `notes:stats`, `notes:duplicates`, `notes:recommend`, `notes:validate`), merges npm scripts, stamps `kitVersion`, and writes the `## Project Notes Graph` block into the selected agent's instruction file.

## Repo map

- `install-notes-graph.cjs` — installer/upgrader; preferred way to propagate the kit.
- `migrate-notes-graph.cjs` — audit/apply/rollback workflow for existing customized vaults.
- `scripts/project-notes.cjs` — route/create/closeout helper for task notes.
- `scripts/search-project-notes.cjs` — deterministic section-level BM25 search.
- `scripts/build-project-notes-context.cjs` — bounded, source-attributed context packets with one-hop graph expansion.
- `scripts/evaluate-project-notes-context.cjs` — checked-in context-quality contract evaluator.
- `scripts/evaluate-project-notes-search.cjs` — checked-in relevance-contract evaluator.
- `scripts/project-notes-stats.cjs` — read-only scale, graph-health, freshness, and retrieval report.
- `scripts/find-project-notes-duplicates.cjs` — informational deterministic near-duplicate candidate report.
- `scripts/recommend-project-notes-opt-ins.cjs` — read-only machine-readable agent recommendations for optional setup.
- `scripts/validate-project-notes-graph.cjs` — structured note/link validator.
- `scripts/lib/project-notes-graph.cjs` — shared graph utilities (statuses, wikilink rules, route resolution).
- `notes-graph.config.json` — kit-local config (app name, vault folder, routes); target repos get their own copy on install.
- `AGENTS-snippet.md` — source block the installer merges into the selected agent's instruction file.
- `Project Notes/` — starter Obsidian vault skeleton (marked typed-note templates, Bases, seed notes). Placeholder app name is `My Project`.
- `tests/install-smoke.test.mjs` — end-to-end install/upgrade smoke test.
- `README.md` — user-facing install and daily-use guide.

Helper scripts are fully config-driven (`notes-graph.config.json` plus `PROJECT_NOTES_*` env overrides), so installs copy them verbatim — no per-project rewriting.

## Commands

Kit development (this repo):

- Test: `npm test` — scaffolds temp repos, runs install → route → new → search/evaluate → closeout → validate, and exercises upgrade/guard paths. Run after changing the installer, helpers, validator, or vault skeleton.
- Notes helpers (dogfood): `npm run notes:route -- "<task>"`, `npm run notes:new -- --title "<title>" --type <type> ...`, `npm run notes:closeout`, `npm run notes:search -- "<query>"`, `npm run notes:context -- "<query>"`, `npm run notes:context:eval`, `npm run notes:search:eval`, `npm run notes:stats`, `npm run notes:duplicates`, `npm run notes:recommend`, `npm run notes:validate`.
- Search is read-only, section-level BM25 over canonical Markdown with a bounded, disclosed authority multiplier for typed/statused operational records. Authority never creates a lexical match. It excludes templates and fenced code by default; filter with repeatable `--type`/`--status`, `--since YYYY-MM-DD`, `--limit 1..100`, or emit `--json`.
- Stats baselines are opt-in repo-owned contracts. Install/upgrade never creates or changes them; baseline comparison exits 1 only for reviewed health/retrieval regressions or configured growth limits, and malformed input exits 2.

Install into a target repo:

Clone this kit, then run the installer from the kit checkout:

```bash
git clone https://github.com/hellojamison/notes-graph-kit.git
cd notes-graph-kit
```

```bash
node install-notes-graph.cjs \
  --repo /path/to/target/repo \
  --app "App Name" \
  --agent codex \
  --vault "Project Notes"
```

Options: `--agent codex|claude|gemini|copilot|cursor` (saved selection; backward-compatible default `codex`), `--repo` (exact Git worktree root; defaults to cwd), `--app` (required; rejects `[`, `]`, and `|` because they break Obsidian wikilinks), `--vault` (directory name only, defaults to `Project Notes`), `--force` (overwrite managed scripts/config), `--force-vault` (with `--force`, also overwrite vault files), `--allow-non-git` (explicit bootstrap escape hatch), `--dry-run` (preview only).

The installer:

1. Copies managed helper/library files into the target's existing `scripts/` or `Scripts/` directory spelling (refuses to overwrite existing helper scripts unless `--force` is used).
2. Writes `notes-graph.config.json` with app name, vault dir, routes, `kitVersion`, and independent `vaultMigrationState`.
3. Copies the vault skeleton with the app name substituted, excluding this kit repo's dated local task notes (existing vault files are not overwritten unless both `--force` and `--force-vault` are used).
4. Merges `notes`, `notes:route`, `notes:new`, `notes:closeout`, `notes:search`, `notes:context`, `notes:context:eval`, `notes:search:eval`, `notes:stats`, `notes:duplicates`, `notes:recommend`, `notes:validate` into `package.json` and adds `js-yaml`; existing customized `notes:*` commands are preserved with a warning.
5. Writes or appends a managed-marker-wrapped `## Project Notes Graph` block to only the selected agent's instruction file (creates the file if missing; skips a marker pair or exact legacy heading outside fenced code).

Writes are staged and committed as one rollback-capable transaction, including `package.json` and the selected instruction file. This protects ordinary synchronous failures, not power loss or forced process termination.

Then in the target repo:

```bash
npm install
npm run notes:route -- "notes graph"
npm run notes:search -- "rollback evidence" --type evidence --status verified
npm run notes:validate
```

Upgrade an existing install (scripts, `kitVersion`, and missing instruction blocks; vault untouched):

```bash
node install-notes-graph.cjs --repo /path/to/target/repo --upgrade
```

Use `--dry-run` on install or upgrade to preview writes.
Upgrades refuse a semantic-version downgrade unless `--allow-downgrade` is supplied for an intentional rollback.
Upgrade rejects `--app`, `--vault`, `--force`, and `--force-vault`; a malformed installed `kitVersion` fails closed while a missing legacy version remains upgradeable.
Upgrade output lists every cumulative vault-migration section applicable to the destination version. `kitVersion` tracks managed scripts, not completed vault migrations; the 0.4 audit classifies all applicable sections in one run without an intermediate manual rewrite.
For 0.4.0, start with `node migrate-notes-graph.cjs audit --repo /path/to/target/repo --to 0.4.0`. Upgrade itself remains vault-untouched.

Migration commands:

- Audit: `node migrate-notes-graph.cjs audit --repo /path/to/repo --to 0.4.0 [--map migration.yml] [--json]`
- Preview/apply: `node migrate-notes-graph.cjs apply --repo /path/to/repo --to 0.4.0 --all-safe [--accept <item-id> ...] [--dry-run]`
- Rollback: `node migrate-notes-graph.cjs rollback --repo /path/to/repo --backup <backup-id>`

`--dry-run` creates no backup. A real Git apply stores a durable local backup under `.notes-graph-kit/vault-migration-backups/<backup-id>` and excludes that path through `.git/info/exclude`; it is not a Git commit. All non-Git migration commands require `--allow-non-git`, and real apply additionally requires an explicit `--backup-dir`.

## Testing and verification

- `npm test` is the primary verification gate for kit changes.
- After install/upgrade in a real repo, run `npm run notes:validate` in that repo.
- State what was smoke-tested vs. manually verified when closing kit work notes.

GitHub Actions CI runs `npm ci`, `npm test`, `npm run notes:search:eval`, `npm run notes:context:eval`, the reviewed stats-baseline comparison, `npm run notes:validate`, `git diff --check`, and `npm audit --omit=dev` on pushes and pull requests.

## Hard rules and gotchas

- **One agent file** — explicitly pass `--agent` for the agent using the target repo. Manage only its file: Codex/Cursor use `AGENTS.md`, Claude uses `CLAUDE.md`, Gemini uses `GEMINI.md`, Copilot uses `.github/copilot-instructions.md`. Do not install every format. Upgrades and migrations use saved `config.agent`; legacy missing values default to `codex`. Changing selection preserves other agents' files. Unmanaged migration adoption accepts `--agent`; repeat the same selection in audit and apply. Installed migrations use the saved choice and reject overrides.

- **Authoritative source only** — fix bugs and add features here, then `--upgrade` consuming repos. Do not edit retired `notes-graph-kit/` copies inside app repos.
- **Target safety** — `--repo` must be the exact Git worktree root unless `--allow-non-git` is intentional. Filesystem root and the user home directory are always rejected.
- **Vault safety** — `--vault` must be a directory name, not a path. Install never overwrites existing vault files unless both `--force` and `--force-vault` are supplied. Upgrade never touches vault content.
- **Migration safety** — never substitute `--force --force-vault` for migration. Audit first, accept conflicts by exact item ID, preserve unmarked/custom content, and use the generated backup for rollback. Rollback refuses post-migration edits.
- **Script safety** — install refuses to overwrite existing managed helper scripts unless `--force`; use `--upgrade` for repos already carrying this kit.
- **Config guard** — re-install without `--force` or `--upgrade` fails if `notes-graph.config.json` already exists.
- **Custom npm scripts** — if a target repo customized a `notes:*` command, the installer preserves it instead of overwriting.
- **Selected instruction file merge** — install creates or appends a managed `## Project Notes Graph` block; it does not replace an existing section. Heading and marker examples inside fenced blocks do not count. Migration refreshes an existing managed block automatically; a legacy unmarked heading is preserved unless its exact audited adoption item is accepted.
- **Template contract** — all eight product templates are `type: template` source notes with exactly one marked fenced YAML mapping. Generate notes through `notes:new`; never copy scaffold metadata manually. Normal upgrade leaves these vault files untouched.
- **Managed document sections** — `_Codex/Start Here.md`, `Notes System.md`, and `Templates/_README.md` wrap kit-owned body regions in path-specific managed markers. Put repo-specific additions outside those markers so later audited migrations can preserve them deterministically.
- **Placeholder substitution** — only vault skeleton files get app/vault name substitution; scripts are copied verbatim.
- **Version stamp** — bump `package.json` version when changing install behavior; target `notes-graph.config.json` `kitVersion` reflects what was installed.

## Project notes (Project Notes)

Keep concise date-and-time-stamped notes in `Project Notes/` for every substantive kit change.

Start from `Project Notes/_Codex/Start Here.md`, then use `Project Notes/Notes System.md` as the organization guide.

For substantive tasks:

- Pick the relevant app, process, and runbook before editing notes.
- Update one task-specific evidence/task note and close it with `notes:closeout`. Closeout writes a per-change daily entry file (`Project Notes/Daily/YYYY-MM-DD/HHMM-<slug>.md`); never edit the shared daily note (`Project Notes/YYYY-MM-DD.md`) in PRs.
- Link task notes to `Apps/My Project.md` plus the relevant process and runbook.
- Record what is working, what was verified, what was tried and failed, and what was not verified.
- Notes are a map, not source-of-truth policy; reverify mutable facts against the repo and smoke tests before relying on old notes.

Prefer the repo-local notes helper:

- `npm run notes:route -- "<task description>"`
- `npm run notes:new -- --title "<title>" --type <type> --summary "<goal>"` (`task`, `evidence`, `app`, `process`, `runbook`, `decision`, `incident`, or `release`; task/evidence require `--process`)
- `npm run notes:closeout -- --note "Project Notes/Evidence/YYYY-MM-DD <task title>.md" --working "..." --verified "..." --not-verified "..."` (add `--certify` only for `status: verified`)
- `npm run notes:validate` after graph metadata, templates, Bases, validator, helper script, or structured note changes.

## Optional handoffs

`npm run notes:handoff -- create --assignment <json> [--out <new-json>]` creates an opt-in assignment packet; `check --packet <json>` compares captured inputs. See `skills/notes-handoff/SKILL.md`. This is separate from evidence certification and does not change vault schemas or shared Status notes.

## Skills

- `obsidian-markdown` — vault note syntax (wikilinks, frontmatter, callouts).
- `obsidian-bases` — `.base` dashboard files in the vault skeleton.
- `json-canvas` — `.canvas` files if added to the graph.
- `create-skill` — when authoring new per-project notes skills that wrap this kit.

<!-- notes-graph-kit:start -->
## Project Notes Graph

When installing or upgrading this kit, select only the instruction file needed by the agent using the repo (`--agent codex|claude|gemini|copilot|cursor`); do not install every format. Preserve other agents' existing files.

Keep concise date-and-time-stamped notes in this worktree's `Project Notes/` vault per substantive task.

Use `Project Notes/_Codex/Start Here.md` as the graph entrypoint, then use `Project Notes/Notes System.md` as the note organization guide.

For substantive tasks:
- Start from `_Codex/Start Here.md`.
- Pick the relevant app, process, and runbook before editing notes.
- Update one task-specific evidence/task note and close it with `notes:closeout`. Closeout writes a per-change daily entry file (`Project Notes/Daily/YYYY-MM-DD/HHMM-<slug>.md`); never edit the shared daily note (`Project Notes/YYYY-MM-DD.md`) in PRs.
- Link task notes to `Apps/My Project.md` plus the relevant process and runbook.
- Record what is working, what was verified, what was tried and failed, and what was not verified.
- Treat notes as evidence and navigation, not as source-of-truth policy; verify mutable facts against the repo, live system, logs, or artifacts before relying on old notes.
- Preserve old flat notes unless promoting them materially improves retrieval.

Prefer the repo-local notes helper:
- After install or upgrade, run `npm run notes:recommend`. Present options marked `requires_user_approval: true` to the user before writing a contract/baseline or editing CI; do not silently enable them. Read-only recommendations may be run without approval.
- Use `npm run notes:route -- "<task description>"` to choose the app/process/runbook path.
- Use `npm run notes:search -- "<query>"` to retrieve ranked note sections; add `--type`, `--status`, or `--since` filters when needed.
- Use `npm run notes:context -- "<query>"` to assemble ranked sections plus one-hop linked decisions, evidence, processes, and runbooks within a disclosed source-word budget.
- Use `npm run notes:context:eval` after context assembly changes when the repo has a reviewed `notes-context-eval.yml`; treat failures as regressions to review, not expectations to rewrite automatically.
- Use `npm run notes:search:eval` after ranking changes when the repo has a reviewed `notes-search-eval.yml`; treat failures as regressions to review, not baselines to rewrite automatically.
- Use `npm run notes:stats` for a read-only snapshot of vault size, link health, orphan notes, evidence verification, stale current guides, and retrieval metrics. Orphans exclude templates, daily notes, indexes, and app hubs.
- If the repo has a reviewed `notes-stats-baseline.json`, use `npm run notes:stats -- --baseline notes-stats-baseline.json` as a regression gate. Never replace a baseline merely to silence a failure.
- Use `npm run notes:stats -- --changed-since <git-ref>` to add a tracked-note change inventory while retaining full-vault health checks.
- Use `npm run notes:duplicates` only to identify review candidates. It is informational; never merge or delete notes solely from its similarity score.
- Use `npm run notes:new -- --title "<title>" --type <type> --summary "<goal>"` with `task`, `evidence`, `app`, `process`, `runbook`, `decision`, `incident`, `release`, or `status`. Evidence also takes `--topic "one investigation topic"`; task, evidence, and status notes require `--process <process-alias>`; a process may have exactly one Status note. Creating a note is not a daily-log event.
- Let `notes:new` unwrap the matching marked template scaffold. Do not copy fenced scaffold metadata into a note manually.
- Structured evidence is `status: open|done`. Close it with `--verdict "current conclusion" --decision "Project Notes/Decisions/Current Decision.md"`; add `--certify` only for `verification: verified`. Keep its `## Current Verdict` first and current. The daily entry is one time/outcome/link line, never a second closeout paragraph. At a phase boundary, update the process Status note in the same command with `--status`, `--phase`, `--certified`, `--settled`, and optional `--open-item "id: summary"` or `--close-item id[,id]`.
- Put verdicts in `Decisions/` and connect replacements with reciprocal `supersedes` / `superseded_by` links. Add tests, artifact paths/hashes/Git SHAs, decision links, and open-item IDs as marked YAML receipts in evidence; test totals must include their exact filter command. Run `npm run notes:artifacts -- --write` to generate the artifact map when receipts name artifacts.
- Run `npm run notes:validate` after graph metadata, templates, Bases, validator, helper script, or structured note changes.
- After a kit upgrade, keep the vault untouched until `node migrate-notes-graph.cjs audit --repo /path/to/repo --to 0.14.0`, run from the authoritative kit checkout, has classified every proposed migration. Apply only reviewed safe/item IDs with the backup-backed `apply` command; use `rollback --backup <id>` rather than overwriting later edits.

Optional agent skills:
- `obsidian-markdown` for wikilinks, frontmatter, callouts, and Obsidian-flavored Markdown.
- `obsidian-bases` for `.base` dashboard edits.
- `json-canvas` if this repo adds `.canvas` files.

These skills are optional guidance only. This kit works without Obsidian, the `obsidian` CLI, or any Obsidian runtime dependency; the repo-local npm helpers and validator are the source of truth.
<!-- notes-graph-kit:end -->
<!-- notes-graph-kit:worker:start -->
## Optional repository workers

When notes-graph.config.json has workers.enabled:true, run npm run notes:worker -- doctor before the first worker job. If unavailable, report the limitation; never install a runtime or enable cloud fallback silently.
The coordinator owns planning, architecture, ambiguity, risky changes and final acceptance. Route bounded mechanical work through npm run notes:worker -- run --role SCOUT|AUDITOR|TESTER --task "specific question" --input relevant/file (repeat inputs). Use real source/tool evidence; never a whole-repo dump.
Workers default to read-only. Authorize exact test argv with --test-command; use --isolated-tests for artifact-writing tests. IMPLEMENTER requires separately authorized direct-runtime work in a clean isolated non-main worktree; this adapter does not dispatch it.
For the local-coding profile, the selected coordinator may be GPT-6 Astra or GPT-6.1 Sol; both use Qwen first as the primary mechanical worker and Luna xhigh as the bounded fallback only when authorized. Additional Sol review from an Astra chat is reserved for difficult/risky work; a Sol coordinator does not launch another Sol for routine worker failure. A task exceeding about 90 seconds or lacking evidence must return promptly. Scope errors, stale packets and changed source return to the coordinator, not cloud.
Consume the compact receipt and job artifact paths. Run npm run notes:worker -- review --job ID before using results later; review checks freshness and artifact integrity, not semantic correctness. Inspect material source/test evidence independently. Worker PASS and same-model agreement never certify evidence. Only the coordinator promotes accepted findings through notes:new/notes:closeout.
<!-- notes-graph-kit:worker:end -->

## Local coder and merge rules

Follow the "Local coder and merge rules" section of ~/.codex/AGENTS.md and ~/Documents/Projects/local-llm-audit/merge-agent-instructions-2026-10-19.md; they are authoritative and kept current. Repo-specific: required CI check for this repo is `test` (GitHub-hosted `ci.yml`, dispatch-only; dispatch before merging; locally `npm test`).
