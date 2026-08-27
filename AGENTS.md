# notes-graph-kit

Portable installer and helper scripts for the project notes graph workflow used across multiple project repos. This repo is the **single authoritative source** for the kit — retired copies inside individual app repos are pointers only; change the kit here, then install or upgrade target repos.

The kit scaffolds an Obsidian vault skeleton, copies config-driven CLI helpers (`notes:route`, `notes:new`, `notes:closeout`, `notes:search`, `notes:context`, `notes:search:eval`, `notes:stats`, `notes:validate`), merges npm scripts, stamps `kitVersion`, and writes the `## Project Notes Graph` block into each target repo's `AGENTS.md`.

## Repo map

- `install-notes-graph.cjs` — installer/upgrader; preferred way to propagate the kit.
- `migrate-notes-graph.cjs` — audit/apply/rollback workflow for existing customized vaults.
- `scripts/project-notes.cjs` — route/create/closeout helper for task notes.
- `scripts/search-project-notes.cjs` — deterministic section-level BM25 search.
- `scripts/build-project-notes-context.cjs` — bounded, source-attributed context packets with one-hop graph expansion.
- `scripts/evaluate-project-notes-search.cjs` — checked-in relevance-contract evaluator.
- `scripts/project-notes-stats.cjs` — read-only scale, graph-health, freshness, and retrieval report.
- `scripts/validate-project-notes-graph.cjs` — structured note/link validator.
- `scripts/lib/project-notes-graph.cjs` — shared graph utilities (statuses, wikilink rules, route resolution).
- `notes-graph.config.json` — kit-local config (app name, vault folder, routes); target repos get their own copy on install.
- `AGENTS-snippet.md` — source block the installer merges into target `AGENTS.md` files.
- `Project Notes/` — starter Obsidian vault skeleton (marked typed-note templates, Bases, seed notes). Placeholder app name is `My Project`.
- `tests/install-smoke.test.mjs` — end-to-end install/upgrade smoke test.
- `README.md` — user-facing install and daily-use guide.

Helper scripts are fully config-driven (`notes-graph.config.json` plus `PROJECT_NOTES_*` env overrides), so installs copy them verbatim — no per-project rewriting.

## Commands

Kit development (this repo):

- Test: `npm test` — scaffolds temp repos, runs install → route → new → search/evaluate → closeout → validate, and exercises upgrade/guard paths. Run after changing the installer, helpers, validator, or vault skeleton.
- Notes helpers (dogfood): `npm run notes:route -- "<task>"`, `npm run notes:new -- --title "<title>" --type <type> ...`, `npm run notes:closeout`, `npm run notes:search -- "<query>"`, `npm run notes:context -- "<query>"`, `npm run notes:search:eval`, `npm run notes:stats`, `npm run notes:validate`.
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
  --vault "Project Notes"
```

Options: `--repo` (exact Git worktree root; defaults to cwd), `--app` (required; rejects `[`, `]`, and `|` because they break Obsidian wikilinks), `--vault` (directory name only, defaults to `Project Notes`), `--force` (overwrite managed scripts/config), `--force-vault` (with `--force`, also overwrite vault files), `--allow-non-git` (explicit bootstrap escape hatch), `--dry-run` (preview only).

The installer:

1. Copies eight managed helper/library files into the target's existing `scripts/` or `Scripts/` directory spelling (refuses to overwrite existing helper scripts unless `--force` is used).
2. Writes `notes-graph.config.json` with app name, vault dir, routes, `kitVersion`, and independent `vaultMigrationState`.
3. Copies the vault skeleton with the app name substituted, excluding this kit repo's dated local task notes (existing vault files are not overwritten unless both `--force` and `--force-vault` are used).
4. Merges `notes`, `notes:route`, `notes:new`, `notes:closeout`, `notes:search`, `notes:context`, `notes:search:eval`, `notes:stats`, `notes:validate` into `package.json` and adds `js-yaml`; existing customized `notes:*` commands are preserved with a warning.
5. Writes or appends a managed-marker-wrapped `## Project Notes Graph` block to `AGENTS.md` (creates the file if missing; skips a marker pair or exact legacy heading outside fenced code).

Writes are staged and committed as one rollback-capable transaction, including `package.json` and `AGENTS.md`. This protects ordinary synchronous failures, not power loss or forced process termination.

Then in the target repo:

```bash
npm install
npm run notes:route -- "notes graph"
npm run notes:search -- "rollback evidence" --type evidence --status verified
npm run notes:validate
```

Upgrade an existing install (scripts + `kitVersion` only; vault untouched):

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

GitHub Actions CI runs `npm ci`, `npm test`, `npm run notes:search:eval`, `npm run notes:validate`, `git diff --check`, and `npm audit --omit=dev` on pushes and pull requests.

## Hard rules and gotchas

- **Authoritative source only** — fix bugs and add features here, then `--upgrade` consuming repos. Do not edit retired `notes-graph-kit/` copies inside app repos.
- **Target safety** — `--repo` must be the exact Git worktree root unless `--allow-non-git` is intentional. Filesystem root and the user home directory are always rejected.
- **Vault safety** — `--vault` must be a directory name, not a path. Install never overwrites existing vault files unless both `--force` and `--force-vault` are supplied. Upgrade never touches vault content.
- **Migration safety** — never substitute `--force --force-vault` for migration. Audit first, accept conflicts by exact item ID, preserve unmarked/custom content, and use the generated backup for rollback. Rollback refuses post-migration edits.
- **Script safety** — install refuses to overwrite existing managed helper scripts unless `--force`; use `--upgrade` for repos already carrying this kit.
- **Config guard** — re-install without `--force` or `--upgrade` fails if `notes-graph.config.json` already exists.
- **Custom npm scripts** — if a target repo customized a `notes:*` command, the installer preserves it instead of overwriting.
- **AGENTS.md merge** — install creates or appends a managed `## Project Notes Graph` block; it does not replace an existing section. Heading and marker examples inside fenced blocks do not count. Migration refreshes an existing managed block automatically; a legacy unmarked heading is preserved unless its exact audited adoption item is accepted.
- **Template contract** — all eight product templates are `type: template` source notes with exactly one marked fenced YAML mapping. Generate notes through `notes:new`; never copy scaffold metadata manually. Normal upgrade leaves these vault files untouched.
- **Managed document sections** — `_Codex/Start Here.md`, `Notes System.md`, and `Templates/_README.md` wrap kit-owned body regions in path-specific managed markers. Put repo-specific additions outside those markers so later audited migrations can preserve them deterministically.
- **Placeholder substitution** — only vault skeleton files get app/vault name substitution; scripts are copied verbatim.
- **Version stamp** — bump `package.json` version when changing install behavior; target `notes-graph.config.json` `kitVersion` reflects what was installed.

## Project notes (Project Notes)

Keep concise date-and-time-stamped notes in `Project Notes/` for every substantive kit change.

Start from `Project Notes/_Codex/Start Here.md`, then use `Project Notes/Notes System.md` as the organization guide.

For substantive tasks:

- Pick the relevant app, process, and runbook before editing notes.
- Update both today's daily note and one task-specific evidence/task note.
- Link task notes to `Apps/My Project.md` plus the relevant process and runbook.
- Record what is working, what was verified, what was tried and failed, and what was not verified.
- Notes are a map, not source-of-truth policy; reverify mutable facts against the repo and smoke tests before relying on old notes.

Prefer the repo-local notes helper:

- `npm run notes:route -- "<task description>"`
- `npm run notes:new -- --title "<title>" --type <type> --summary "<goal>"` (`task`, `evidence`, `app`, `process`, `runbook`, `decision`, `incident`, or `release`; task/evidence require `--process`)
- `npm run notes:closeout -- --note "Project Notes/Evidence/YYYY-MM-DD <task title>.md" --working "..." --verified "..." --not-verified "..."` (add `--certify` only for `status: verified`)
- `npm run notes:validate` after graph metadata, templates, Bases, validator, helper script, or structured note changes.

## Skills

- `obsidian-markdown` — vault note syntax (wikilinks, frontmatter, callouts).
- `obsidian-bases` — `.base` dashboard files in the vault skeleton.
- `json-canvas` — `.canvas` files if added to the graph.
- `create-skill` — when authoring new per-project notes skills that wrap this kit.
