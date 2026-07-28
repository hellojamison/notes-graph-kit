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

- `--repo` — exact target Git worktree root (defaults to current directory).
  Filesystem root and the user home directory are always rejected.
- `--app` — required app/product name. Quotes and filename punctuation are
  supported; `[`, `]`, and `|` are rejected because they break Obsidian
  wikilinks.
- `--vault` — vault directory name, not a path (defaults to `Project Notes`).
- `--force` — overwrite existing kit-managed scripts and config during an
  install.
- `--force-vault` — with `--force`, also overwrite existing vault skeleton
  files. Use both flags only when discarding local vault customizations is
  intentional.
- `--allow-non-git` — explicitly permit an intentional install outside a Git
  worktree.
- `--dry-run` — print planned writes without changing files.

The installer:

1. Copies the three helper scripts verbatim into `scripts/` (refuses to
   overwrite existing helper scripts unless `--force` is used).
2. Writes `notes-graph.config.json` with the app name, vault dir, and a
   `kitVersion` stamp.
3. Copies the vault skeleton with the app name substituted, excluding this
   kit repo's dated local task notes. Existing vault files are skipped unless
   both `--force` and `--force-vault` are supplied.
4. Merges `notes`, `notes:route`, `notes:new`, `notes:closeout`, and
   `notes:validate` into `package.json` (existing customized commands are
   preserved with a warning) and adds the `js-yaml` dependency.
5. Writes or appends a marked `## Project Notes Graph` block to `AGENTS.md`
   (creates the file if missing; skips a managed block or an exact legacy
   heading outside fenced code).

All planned files, including `package.json` and `AGENTS.md`, are staged before
replacement. Ordinary write failures roll back files already changed. This
cannot provide whole-install atomicity against power loss or a forced process
termination.

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

Upgrades refuse to replace a newer semantic kit version with an older checkout.
Use `--allow-downgrade` only for an intentional rollback.
An installed but malformed `kitVersion` fails closed; a legacy config with no
version remains upgradeable. `--upgrade` rejects install-only `--app`, `--vault`,
`--force`, and `--force-vault` options instead of silently ignoring them.

Existing repos with older or renamed helper scripts (e.g. `overcue-notes.cjs`,
`notes.cjs`, split `notes-*.cjs`) keep working through their `notes:*` npm
scripts; upgrade them only when a fix needs propagating.

### Existing vault migration for 0.3.0

Version 0.3.0 makes all eight structured-note templates machine-readable and
adds typed creation for task, evidence, app, process, runbook, decision,
incident, and release notes. `--upgrade` refreshes the CLI scripts and
`kitVersion` but remains vault-untouched, so merge these vault changes manually:

1. Replace the eight files under `Templates/` with their 0.3.0 versions after
   preserving any local body customizations. Each template's own frontmatter
   must be `type: template`, and each body must contain exactly one marked YAML
   scaffold using the marker pair shipped by the kit.
2. Merge the 0.3.0 guidance from `Templates/_README.md`, `_Codex/Start Here.md`,
   and `Notes System.md`.
3. Do not extract or copy fenced scaffold metadata into destination notes.
   `notes:new` validates and removes the marked block automatically.
4. Run `npm run notes:validate`, then create disposable examples for the note
   types used by the target repo before relying on the migrated templates.

Existing `AGENTS.md` blocks are also upgrade-untouched. Merge the `notes:new`
type list and `notes:closeout --certify` guidance from `AGENTS-snippet.md`
manually when updating an existing install.

### Existing vault migration for 0.2.16

Version 0.2.16 makes wikilink resolution path-safe, checks links in root
schema-managed notes and templates, and brings the fresh-install seed notes onto
the `schema_version: 1` contract. `--upgrade` still never edits vault content,
so existing installs need a small manual vault migration after upgrading:

1. Add schema-managed `_README.md` index notes under `Decisions/`, `Incidents/`,
   `Releases/`, `Runbooks/`, and `Known-Good/`, including a `related_apps` link
   to the target repo's app note. If a target repo intentionally does not use
   one of those folders, remove or replace its link in `Notes System.md`.
2. Add `schema_version: 1`, the original note date, and a non-empty
   type-appropriate `tags` list to `_Codex/Start Here.md`, the starter app,
   process, runbook, decision, and evidence notes, plus the App, Process,
   Runbook, and Evidence templates. Preserve their existing app,
   source-of-truth, confidence, and relationship fields.
3. Update `Templates/Task Note Template.md` with a final `## Graph Links`
   section. Remove the literal `last_verified: "YYYY-MM-DD"` property from the
   App, Process, Runbook, and Evidence template frontmatter; add
   `last_verified` only after checking the copied note's mutable claims.
4. Update `Templates/_README.md` to list all eight shipped templates and explain
   that copied notes must replace `title`, `type`, `date`, `status`, tags, and
   graph relationships.
5. Add this global filter to Active Work, Decisions, Incidents, and Runbooks:

   ```yaml
   filters:
     not:
       - 'file.inFolder("Templates")'
   ```

   In Notes Review, preserve its existing global `and` filters and add:

   ```yaml
   - not:
       - 'file.inFolder("Templates")'
   ```

6. Replace any timestamp-shaped schema metadata such as
   `2026-06-03T00:00:00.000Z` with `YYYY-MM-DD`.
7. Run `npm run notes:validate`. Wrong-folder links no longer resolve through an
   unrelated note with the same basename, and ambiguous folderless links must
   be replaced with explicit vault-relative paths.

Fresh installs already contain these index notes and schema fields.
Upgrade also leaves an existing `AGENTS.md` block untouched. Legacy real
headings remain supported; add the marker lines from `AGENTS-snippet.md`
manually only if you want the block to carry the new managed boundaries.

## Customize the graph

Edit `notes-graph.config.json` in the target repo:

- `appName` — the project/app name.
- `vaultDir` — the notes vault folder name inside the repo.
- `appRel` — the app note path inside the vault.
- `routes` — process aliases and their target process notes. Add
  project-specific processes (and matching notes under `Processes/`) as the
  project grows. Each `processRel` must point to an existing note with
  `type: process`; `npm run notes:validate` fails invalid route configs.
  Fallback routing contains only the shipped Notes Graph Maintenance process.
  Duplicate normalized aliases fail validation, and input matching more than
  one route reports sorted candidates instead of silently choosing one.

Run `npm run notes:validate` after any structural change.

The default validator output summarizes recurring compatibility warnings such
as preserved legacy notes, while errors and actionable graph warnings remain
individual. Use `npm run notes:validate -- --verbose` to print every warning
and its note path.

Body links are checked in schema-managed notes, templates, structured folders,
and daily notes. Vault-relative links must match their complete path. A
folderless wikilink is accepted only when its basename uniquely identifies one
note; otherwise validation reports every candidate and asks for an explicit
vault-relative path.

## Daily use

```bash
npm run notes:route -- "describe the task"
npm run notes:new -- --title "Task title" --process notes-graph-maintenance --summary "Goal"
npm run notes:new -- --title "Release title" --type release --summary "Release scope"
npm run notes:closeout -- --note "Project Notes/Evidence/YYYY-MM-DD Task title.md" --working "..." --verified "..." --not-verified "..."
npm run notes:closeout -- --note "Project Notes/Evidence/YYYY-MM-DD Task title.md" --certify --working "..." --verified "..." --not-verified "..."
npm run notes:validate
```

`notes:new` writes dated work-log notes under `Project Notes/Evidence/`. It
creates `type: task` by default. `--type` accepts `task`, `evidence`, `app`,
`process`, `runbook`, `decision`, `incident`, or `release`. Task and evidence
notes require `--process` and use date-prefixed filenames under `Evidence/`;
the other types use their matching structured folder and accept `--process`
optionally. New process notes also add a route using a slug of the title and
refuse route-ID or alias collisions instead of choosing a suffix.
Draft process, runbook, decision, and release notes are exempt from operational
completeness and inbound-link warnings. Add the required relationships before
promoting them to an active, current, or verified status.

Every shipped template is a `type: template` source note with one marked YAML
scaffold. `notes:new` validates that scaffold, generates canonical frontmatter,
and removes it from the finished body. Do not copy scaffold metadata manually.

`notes:closeout` refuses a note that already has a real `## Closeout` heading
before changing the note or daily log. Date fields are serialized as
`YYYY-MM-DD`. If a command value itself begins with `--`, use the equals form,
for example `--not-verified="--force path not tested"`.
Normal closeout sets `status: done`; `--certify` sets `status: verified`.
The daily closeout line records the selected status explicitly.

Typical agent workflow:

1. Read `Project Notes/_Codex/Start Here.md`.
2. Run `npm run notes:route -- "<task>"`.
3. Create the appropriate typed note with `npm run notes:new`.
4. Do the work and record exact verification.
5. Close the task note with `npm run notes:closeout`.
6. Run `npm run notes:validate`.

Optional: humans or agents doing heavy vault maintenance can use
[`kepano/obsidian-skills`](https://github.com/kepano/obsidian-skills) for
Obsidian-specific editing guidance. The relevant optional skills are
`obsidian-markdown`, `obsidian-bases`, and `json-canvas`. The kit does not
require those skills, Obsidian, `obsidian` CLI, or any Obsidian runtime
dependency; the repo-local npm helpers and validator remain the source of
truth.

## Environment overrides

- `PROJECT_NOTES_NOTES_REPO_ROOT=/path/to/repo`
- `PROJECT_NOTES_NOTES_VAULT_ROOT=/path/to/vault`
- `PROJECT_NOTES_CONFIG=/path/to/notes-graph.config.json`

## Kit development

See `AGENTS.md` for the agent-oriented repo map, install commands, and gotchas.

Run `npm test` after changing the installer, helper scripts, or vault skeleton.
It scaffolds temp targets, runs install → route → new → closeout → validate,
and exercises Git-root, upgrade, force, ambiguity, transaction rollback, and
no-clobber guards.

GitHub Actions CI also runs `npm ci`, `npm test`, `npm run notes:validate`,
`git diff --check`, and `npm audit --omit=dev` on pushes and pull requests.

## License

MIT. See [LICENSE](LICENSE).

## Manual copy (fallback)

If you cannot run the installer, copy `scripts/`, `Project Notes/`,
`notes-graph.config.json`, and the `package.json` script/dependency block by
hand, then customize per "Customize the graph" above. The installer is
preferred because it handles renames and stamps `kitVersion`. Keep each
template file intact; do not manually extract its marked scaffold.
