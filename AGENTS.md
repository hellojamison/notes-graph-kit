# notes-graph-kit

Portable installer and helper scripts for the project notes graph workflow used across multiple project repos. This repo is the **single authoritative source** for the kit — retired copies inside individual app repos are pointers only; change the kit here, then install or upgrade target repos.

The kit scaffolds an Obsidian vault skeleton, copies config-driven CLI helpers (`notes:route`, `notes:new`, `notes:closeout`, `notes:validate`), merges npm scripts, stamps `kitVersion`, and writes the `## Project Notes Graph` block into each target repo's `AGENTS.md`.

## Repo map

- `install-notes-graph.cjs` — installer/upgrader; preferred way to propagate the kit.
- `scripts/project-notes.cjs` — route/create/closeout helper for task notes.
- `scripts/validate-project-notes-graph.cjs` — structured note/link validator.
- `scripts/lib/project-notes-graph.cjs` — shared graph utilities (statuses, wikilink rules, route resolution).
- `notes-graph.config.json` — kit-local config (app name, vault folder, routes); target repos get their own copy on install.
- `AGENTS-snippet.md` — source block the installer merges into target `AGENTS.md` files.
- `Project Notes/` — starter Obsidian vault skeleton (templates, Bases, seed notes). Placeholder app name is `My Project`.
- `tests/install-smoke.test.mjs` — end-to-end install/upgrade smoke test.
- `README.md` — user-facing install and daily-use guide.

Helper scripts are fully config-driven (`notes-graph.config.json` plus `PROJECT_NOTES_*` env overrides), so installs copy them verbatim — no per-project rewriting.

## Commands

Kit development (this repo):

- Test: `npm test` — scaffolds a temp repo, runs install → route → new → closeout → validate, and exercises upgrade/guard paths. Run after changing the installer, helpers, validator, or vault skeleton.
- Notes helpers (dogfood): `npm run notes:route -- "<task>"`, `npm run notes:new`, `npm run notes:closeout`, `npm run notes:validate`.

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

Options: `--repo` (defaults to cwd), `--app` (required; rejects `[`, `]`, and `|` because they break Obsidian wikilinks), `--vault` (directory name only, defaults to `Project Notes`), `--force` (overwrite kit-managed scripts or vault files), `--dry-run` (preview only).

The installer:

1. Copies the three helper scripts into `scripts/` (refuses to overwrite existing helper scripts unless `--force` is used).
2. Writes `notes-graph.config.json` with app name, vault dir, routes, and `kitVersion`.
3. Copies the vault skeleton with the app name substituted, excluding this kit repo's dated local task notes (existing vault files are not overwritten without `--force`).
4. Merges `notes`, `notes:route`, `notes:new`, `notes:closeout`, `notes:validate` into `package.json` and adds `js-yaml`.
5. Writes or appends the `## Project Notes Graph` block to `AGENTS.md` (creates the file if missing; skips if the section already exists).

Then in the target repo:

```bash
npm install
npm run notes:route -- "notes graph"
npm run notes:validate
```

Upgrade an existing install (scripts + `kitVersion` only; vault untouched):

```bash
node install-notes-graph.cjs --repo /path/to/target/repo --upgrade
```

Use `--dry-run` on install or upgrade to preview writes.

## Testing and verification

- `npm test` is the primary verification gate for kit changes.
- After install/upgrade in a real repo, run `npm run notes:validate` in that repo.
- State what was smoke-tested vs. manually verified when closing kit work notes.

GitHub Actions CI runs `npm ci`, `npm test`, `npm run notes:validate`, `git diff --check`, and `npm audit --omit=dev` on pushes and pull requests.

## Hard rules and gotchas

- **Authoritative source only** — fix bugs and add features here, then `--upgrade` consuming repos. Do not edit retired `notes-graph-kit/` copies inside app repos.
- **Vault safety** — `--vault` must be a directory name, not a path. Install never overwrites existing vault files unless `--force`. Upgrade never touches vault content.
- **Script safety** — install refuses to overwrite existing managed helper scripts unless `--force`; use `--upgrade` for repos already carrying this kit.
- **Config guard** — re-install without `--force` or `--upgrade` fails if `notes-graph.config.json` already exists.
- **Custom npm scripts** — if a target repo customized a `notes:*` command, the installer preserves it instead of overwriting.
- **AGENTS.md merge** — install creates or appends `## Project Notes Graph`; it does not replace an existing section. Edit `AGENTS-snippet.md` here, then re-run install with `--force` on a scratch repo or patch target repos manually if the block needs updating.
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
- `npm run notes:new -- --title "<task title>" --process <process-alias> --summary "<goal>"`
- `npm run notes:closeout -- --note "Project Notes/Evidence/YYYY-MM-DD <task title>.md" --working "..." --verified "..." --not-verified "..."`
- `npm run notes:validate` after graph metadata, templates, Bases, validator, helper script, or structured note changes.

## Skills

- `obsidian-markdown` — vault note syntax (wikilinks, frontmatter, callouts).
- `obsidian-bases` — `.base` dashboard files in the vault skeleton.
- `json-canvas` — `.canvas` files if added to the graph.
- `create-skill` — when authoring new per-project notes skills that wrap this kit.
