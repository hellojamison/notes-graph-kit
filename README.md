# notes-graph-kit

Portable kit for the project notes graph workflow. This repo is the **single
authoritative source** — earlier copies inside individual app repos are retired
pointers.

## What is included

- `install-notes-graph.cjs` — installer/upgrader (preferred way to use the kit).
- `migrate-notes-graph.cjs` — audited, backup-backed migration of an existing
  customized vault.
- `scripts/project-notes.cjs` — route/create/closeout helper for task notes.
- `scripts/search-project-notes.cjs` — deterministic section-level BM25 search.
- `scripts/build-project-notes-context.cjs` — bounded context packets from search plus one-hop operational links.
- `scripts/evaluate-project-notes-search.cjs` — relevance evaluation against a repo-owned YAML contract.
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

1. Copies the eight managed helper/library files verbatim into the target's
   existing `scripts/` or `Scripts/` directory spelling (refuses to
   overwrite existing helper scripts unless `--force` is used).
2. Writes `notes-graph.config.json` with the app name, vault dir, a
   `kitVersion` stamp, and independent `vaultMigrationState`.
3. Copies the vault skeleton with the app name substituted, excluding this
   kit repo's dated local task notes. Existing vault files are skipped unless
   both `--force` and `--force-vault` are supplied.
4. Merges `notes`, `notes:route`, `notes:new`, `notes:closeout`, `notes:search`, `notes:context`,
   `notes:search:eval`, `notes:stats`, and
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
npm run notes:search -- "rollback evidence" --type evidence --status verified
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

After upgrading to 0.4.0, audit the still-untouched vault:

```bash
node migrate-notes-graph.cjs audit \
  --repo /path/to/target/repo \
  --to 0.4.0
```

Upgrade output prints this audit command. Do not use `--force --force-vault` as
a migration shortcut for a customized vault.

After every upgrade, the installer prints the cumulative vault-migration
sections applicable to the destination version and the exact path to this
README. The checklist is intentionally cumulative: `kitVersion` records
managed-script installation, not whether a prior vault migration was completed.
Run the 0.4.0 migrator once; its audit classifies every applicable historical
change. For example, a direct `0.2.15` → `0.4.0` audit evaluates the 0.2.16,
0.3.0, and 0.4.0 migrations without requiring an intermediate manual rewrite.

Upgrades refuse to replace a newer semantic kit version with an older checkout.
Use `--allow-downgrade` only for an intentional rollback.
An installed but malformed `kitVersion` fails closed; a legacy config with no
version remains upgradeable. `--upgrade` rejects install-only `--app`, `--vault`,
`--force`, and `--force-vault` options instead of silently ignoring them.

Existing repos with older or renamed helper scripts (e.g. `overcue-notes.cjs`,
`notes.cjs`, split `notes-*.cjs`) keep working through their `notes:*` npm
scripts; upgrade them only when a fix needs propagating.

### Existing vault migration for 0.2.16

Version 0.2.16 makes wikilink resolution path-safe, checks links in root
schema-managed notes and templates, and brings the fresh-install seed notes onto
the `schema_version: 1` contract.

The 0.4.0 audit represents this historical migration as reviewable items:
missing folder indexes, required seed metadata, template-safe Base filters,
canonical date-only values, and path/ambiguity diagnostics. Safe additions can
be selected with `--all-safe`; collisions or customized files remain unchanged
unless their exact item IDs are accepted. Use a mapping when an existing
renamed or unmanaged note should satisfy a required typed path.

Fresh installs already contain these changes. Existing `AGENTS.md` content
remains upgrade-untouched and is handled as a separate audited item.

### Existing vault migration for 0.3.0

Version 0.3.0 makes all eight structured-note templates machine-readable and
adds typed creation for task, evidence, app, process, runbook, decision,
incident, and release notes.

The 0.4.0 audit classifies each template and managed guide section without
blindly replacing a customized file. It can install pristine scaffold contracts
and managed document regions as safe items; local conflicts require explicit
item acceptance and remain recoverable through the generated backup. Do not
extract fenced scaffold metadata into destination notes; `notes:new` validates
and removes the marked block automatically.

After apply, validate the real vault and exercise the typed creation paths in a
scratch clone or worktree.

### Existing vault migration for 0.4.0

Version 0.4.0 adds an explicit audit/apply/rollback workflow. It adopts older
or customized vaults without treating a matching pathname as permission to
overwrite user content.

1. Audit first. Audit is read-only and reports safe changes, conflicts, and
   stable item IDs:

   ```bash
   node migrate-notes-graph.cjs audit \
     --repo /path/to/target/repo \
     --to 0.4.0
   ```

   Add `--json` for machine-readable output. For an unmanaged vault with no kit
   config, identify it explicitly with `--app "App Name" --vault "Existing
   Notes"`. Non-Git targets also require `--allow-non-git`.

2. For existing notes that should join the typed graph, pass a mapping file
   with `--map migration.yml`:

   ```yaml
   schema_version: 1
   entries:
     - path: Apps/Existing App.md
       title: Existing App
       type: app
       status: current
       date: "2026-07-28"
       tags:
         - notes/app
   ```

   Entry paths are relative to the configured vault root. A mapping adopts the
   exact note in place: it does not move or rename the file, replace its body,
   discard optional frontmatter fields, or authorize changes to a different
   path.

   Re-run audit with the mapping:

   ```bash
   node migrate-notes-graph.cjs audit \
     --repo /path/to/target/repo \
     --to 0.4.0 \
     --map migration.yml
   ```

3. Preview the proposed apply without creating a backup:

   ```bash
   node migrate-notes-graph.cjs apply \
     --repo /path/to/target/repo \
     --to 0.4.0 \
     --map migration.yml \
     --all-safe \
     --accept <reviewed-item-id> \
     --dry-run
   ```

   `--accept` is repeatable. Use only item IDs reviewed in the matching audit.
   Omit an item to leave it unchanged. Repeat the same `--app`, `--vault`, and
   `--map` inputs used for audit. Omit `--map` from both commands when no
   adoption mapping is needed.

4. Run the same command without `--dry-run` to apply. A Git target receives a
   durable local backup under
   `.notes-graph-kit/vault-migration-backups/<backup-id>`, which the migrator
   adds to `.git/info/exclude`; it is not a Git commit. For a non-Git target,
   add `--allow-non-git --backup-dir /absolute/backup/directory`; apply refuses
   a non-Git migration without an explicit backup directory.

5. Validate and review the resulting diff:

   ```bash
   npm run notes:validate -- --verbose
   git diff --check
   git diff -- "Project Notes" AGENTS.md notes-graph.config.json
   ```

   If the vault has a different configured name, substitute that path. Exercise
   typed note creation in a scratch clone or worktree, not by creating
   disposable notes and routes in the working vault.

6. Roll back by backup ID if the accepted result is wrong:

   ```bash
   node migrate-notes-graph.cjs rollback \
     --repo /path/to/target/repo \
     --backup <backup-id>
   ```

   Include `--backup-dir` when the backup is outside the default directory.
   A non-Git rollback also requires `--allow-non-git`. Rollback refuses to
   overwrite files changed after migration; review and preserve those edits
   instead of forcing a restore.

Backups record original existence, before/after SHA-256 hashes, POSIX modes,
migration IDs, and the prior migration-state object. Rollback restores file
bytes and POSIX modes and removes migration-created files and empty
directories. It does not restore timestamps or extended attributes.

`vaultMigrationState` is independent from `kitVersion`. A missing state object
is never treated as proof either way: audit inspects the actual managed
components, and a migration ID is recorded only when that contract is
semantically compliant. Migration IDs form a cumulative chain: an unresolved
earlier contract prevents that migration and later migrations from being
attested.

JSON reports distinguish action from state. `applied` is `true` only after a
real apply or rollback commits writes; audit and dry-run always report
`applied: false`. `currentApplied` lists the state found before planning, while
`prospectiveApplied` lists the state the selected writes would produce.
Ordinary Markdown outside managed paths appears under `Preserved legacy`, even
though its bytes are never rewritten.

The 0.4.0 skeleton marks the kit-managed body regions in `_Codex/Start Here.md`,
`Notes System.md`, and `Templates/_README.md`. Migration can update those
regions deterministically. Keep repo-specific prose outside the managed marker
pairs; migration must not replace unmarked content. Review any local edits
inside a managed region before applying: content inside a complete marker pair
is kit-owned and refreshes automatically. Ambiguous unmarked sections require
their exact audited item ID before migration changes them.

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
npm run notes:search -- "rollback evidence" --type evidence --status verified --since 2026-01-01
npm run notes:search -- "rollback evidence" --json
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

`notes:search` ranks matching Markdown sections with deterministic BM25 and a
bounded authority multiplier. Verified evidence, current decisions, and
current runbooks/processes receive modest boosts; daily notes receive a modest
penalty. Authority never creates a match: a section must first have a positive
lexical score. Text and JSON results expose the BM25 score, multiplier, reasons,
and combined score so ranking remains reviewable. The command
prints the note path, heading line, frontmatter type/status/date, score, and a
short excerpt. Repeated `--type` and `--status` filters are ORed within their
field and combined with `--since YYYY-MM-DD`; `--limit` accepts 1–100 results.
Template notes are excluded unless `--include-templates` is supplied. Fenced
code blocks are not indexed. Use `--json` when another tool or agent will
consume the results. Search reads canonical
Markdown and does not create a cache, embedding model, or generated index.

`notes:context` turns ranked search results into a deterministic context packet:

```bash
npm run notes:context -- "release signing failure"
npm run notes:context -- "rollback evidence" --max-words 3000 --results 5 --json
```

The packet starts with ranked matching sections, then adds directly linked
decisions, evidence/audits/known-good records, processes, and runbooks. Graph
expansion is exactly one hop from the matched notes; templates and unrelated
notes are excluded. Every item retains its vault path, heading line, type,
status, date, and either search rank/score or the path that linked it.
`--max-words` is a hard 100–20,000 word budget for extracted source content;
the small attribution/header overhead is reported separately by the rendered
format and is not part of that source-content count. `--results` accepts 1–20
seed sections. Repeatable `--type` and `--status` plus `--since` filter only
the lexical seed search; reviewed operational notes linked from those seeds may
still be included. Output is read-only, stable for unchanged inputs, and uses
no generated summaries, embeddings, cache, or vault writes.

`notes:search:eval` reads a repo-owned `notes-search-eval.yml` and measures
top-1 hits, top-3 hits, mean reciprocal rank (MRR), and whether each query has
an expected path/optional heading within `top_k`. A miss exits with status 1;
malformed contracts exit with status 2. Use `--json` for automation and
`--top-k 1..100` only for an intentional temporary override. The installer
copies the evaluator but never creates or overwrites the contract because
relevance judgments belong to each target repo.

Minimal contract:

```yaml
schema_version: 1
top_k: 3
queries:
  - id: rollback-verification
    query: rollback migration evidence
    filters:
      type: [evidence]
      status: [verified]
    expected:
      - path: Evidence/2026-08-27 Rollback Verification.md
        heading: Verification
```

Expected entries form a relevance set: a query passes when any expected entry
ranks within `top_k`. Do not regenerate expectations from current output; each
path and heading should represent a reviewed result that ought to remain
retrievable.

`notes:stats` gives a read-only snapshot of vault scale and maintenance risk:

```bash
npm run notes:stats
npm run notes:stats -- --json --top 20 --stale-days 120
```

It reports non-template note, section, word, and byte totals; counts by type and
status; largest notes and sections; broken and ambiguous links; orphan notes;
verified versus unverified evidence; and stale `current` process/runbook notes.
An orphan is a non-template, non-daily operational note other than an index or
app hub with no inbound link from another included note. Guide age uses
`last_verified`, then `date`, and defaults to 90 days. When
`notes-search-eval.yml` exists, stats also runs it once and reports top-1,
top-3, MRR, total elapsed time, and average time per query. Timing is
informational and varies by machine. A missing default contract is reported as
`not-configured`; an explicitly requested missing or unsafe `--eval-file`
fails closed.

### Stats regression baselines

Baselines are opt-in and repo-owned. An install or upgrade never creates,
changes, or deletes one. Create the first reviewed baseline explicitly:

```bash
npm run notes:stats -- --write-baseline notes-stats-baseline.json
git add notes-stats-baseline.json
```

Creation refuses an existing file. After reviewing current results, replacement
requires the separate `--replace-baseline` acknowledgement. Compare in CI with:

```bash
npm run notes:stats -- --baseline notes-stats-baseline.json
```

Comparison exits 1 when broken links, ambiguous links, orphans, or stale
current guides increase, or when a configured search evaluation disappears or
its passed/top-1/top-3/MRR metrics decline. Note, section, word, and byte
changes are reported but do not fail by default because healthy project growth
is expected. A reviewed baseline may opt into `limits.max_note_growth` or
`limits.max_word_growth_percent`; generated baselines leave `limits` empty.
Baselines contain only stable metrics—timestamps, largest-file lists, paths,
and evaluation timings are excluded. Invalid schemas, unknown fields, missing
files, symlinks, and paths outside the exact repository fail closed with exit
2.

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
It scaffolds temp targets, runs install → route → new → search → closeout → validate,
and exercises Git-root, upgrade, force, ambiguity, transaction rollback, and
no-clobber guards.

GitHub Actions CI also runs `npm ci`, `npm test`, `npm run notes:search:eval`,
`npm run notes:validate`, `git diff --check`, and `npm audit --omit=dev` on
pushes and pull requests.

## License

MIT. See [LICENSE](LICENSE).

## Manual copy (fallback)

If you cannot run the installer, copy `scripts/`, `Project Notes/`,
`notes-graph.config.json`, and the `package.json` script/dependency block by
hand, then customize per "Customize the graph" above. The installer is
preferred because it handles renames and stamps `kitVersion`. Keep each
template file intact; do not manually extract its marked scaffold.
