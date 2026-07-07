# notes-graph-kit

Portable kit for the project notes graph workflow. This repo is the **single
authoritative source** — earlier copies inside individual app repos are retired
pointers.

## What is included

- `install-notes-graph.cjs` — installer/upgrader (preferred way to use the kit).
- `scripts/project-notes.cjs` — route/create/closeout helper for task notes.
- `scripts/validate-project-notes-graph.cjs` — structured note/link validator.
- `scripts/lib/project-notes-graph.cjs` — shared graph utilities.
- `notes-graph.config.json` — app name, vault folder, app note, and route aliases.
- `Project Notes/` — starter Obsidian vault skeleton with templates, Bases, and graph seed notes.
- `AGENTS-snippet.md` — agent-instructions block for the target repo.
- `tests/` — self-test (`npm test`) that scaffolds a temp repo and runs the full workflow.

The helper scripts are fully config-driven (`notes-graph.config.json` plus
`PROJECT_NOTES_*` env overrides), so installs copy them verbatim — no
per-project rewriting. Placeholder substitution (app name, vault folder) only
touches the kit-owned vault skeleton.

## Install into a repo

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

Options:

- `--repo` — target repo root (defaults to current directory).
- `--app` — required app/product name. Quotes and filename punctuation are
  supported; `[`, `]`, and `|` are rejected because they break Obsidian
  wikilinks.
- `--vault` — vault directory name, not a path (defaults to `Project Notes`).
- `--force` — overwrite existing kit-managed scripts or vault files.
- `--dry-run` — print planned writes without changing files.

The installer:

1. Copies the three helper scripts verbatim into `scripts/` (refuses to
   overwrite existing helper scripts unless `--force` is used).
2. Writes `notes-graph.config.json` with the app name, vault dir, and a
   `kitVersion` stamp.
3. Copies the vault skeleton with the app name substituted, excluding this
   kit repo's dated local task notes (existing vault files are never
   overwritten without `--force`).
4. Merges `notes`, `notes:route`, `notes:new`, `notes:closeout`, and
   `notes:validate` into `package.json` (existing customized commands are
   preserved with a warning) and adds the `js-yaml` dependency.
5. Writes or appends the `## Project Notes Graph` block to `AGENTS.md` (creates
   the file if missing; skips if the section already exists).

See `AGENTS.md` in this repo for the full agent-oriented install reference.

Then in the target repo:

```bash
npm install
npm run notes:route -- "notes graph"
npm run notes:validate
git diff --check
```

## Upgrade an existing install

```bash
node install-notes-graph.cjs --repo /path/to/target/repo --upgrade
```

Re-copies the kit-managed scripts, bumps `kitVersion` in the target config, and
never touches vault content. Use `--dry-run` to preview. The target's
`kitVersion` tells you which kit vintage a repo has.

Existing repos with older or renamed helper scripts (e.g. `overcue-notes.cjs`,
`notes.cjs`, split `notes-*.cjs`) keep working through their `notes:*` npm
scripts; upgrade them only when a fix needs propagating.

## Customize the graph

Edit `notes-graph.config.json` in the target repo:

- `appName` — the project/app name.
- `vaultDir` — the notes vault folder name inside the repo.
- `appRel` — the app note path inside the vault.
- `routes` — process aliases and their target process notes. Add
  project-specific processes (and matching notes under `Processes/`) as the
  project grows.

Run `npm run notes:validate` after any structural change.

## Daily use

```bash
npm run notes:route -- "describe the task"
npm run notes:new -- --title "Task title" --process notes-graph-maintenance --summary "Goal"
npm run notes:closeout -- --note "Project Notes/Evidence/YYYY-MM-DD Task title.md" --working "..." --verified "..." --not-verified "..."
npm run notes:validate
```

`notes:new` creates `type: task` by default. Pass `--type evidence` for an evidence-shaped note.

Typical agent workflow:

1. Read `Project Notes/_Codex/Start Here.md`.
2. Run `npm run notes:route -- "<task>"`.
3. Create a task note with `npm run notes:new`; pass `--type evidence` for an evidence-shaped note.
4. Do the work and record exact verification.
5. Close the task note with `npm run notes:closeout`.

## Environment overrides

- `PROJECT_NOTES_NOTES_REPO_ROOT=/path/to/repo`
- `PROJECT_NOTES_NOTES_VAULT_ROOT=/path/to/vault`
- `PROJECT_NOTES_CONFIG=/path/to/notes-graph.config.json`

## Kit development

See `AGENTS.md` for the agent-oriented repo map, install commands, and gotchas.

Run `npm test` after changing the installer, helper scripts, or vault skeleton.
It scaffolds a temp repo, runs install → route → new → closeout → validate, and
exercises upgrade and the no-clobber guard.

GitHub Actions CI also runs `npm ci`, `npm test`, `npm run notes:validate`,
`git diff --check`, and `npm audit --omit=dev` on pushes and pull requests.

## License

MIT. See [LICENSE](LICENSE).

## Manual copy (fallback)

If you cannot run the installer, copy `scripts/`, `Project Notes/`,
`notes-graph.config.json`, and the `package.json` script/dependency block by
hand, then customize per "Customize the graph" above. The installer is
preferred because it handles renames and stamps `kitVersion`.
