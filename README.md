# notes-graph-kit

Portable starter kit for the project notes graph workflow.

## What is included

- `scripts/project-notes.cjs` — route/create/closeout helper for task notes.
- `scripts/validate-project-notes-graph.cjs` — structured note/link validator.
- `scripts/lib/project-notes-graph.cjs` — shared graph utilities.
- `notes-graph.config.json` — app name, vault folder, app note, and route aliases.
- `Project Notes/` — starter Obsidian vault skeleton with templates, Bases, and graph seed notes.
- `AGENTS-snippet.md` — agent-instructions block to paste into the target repo.

## Use this in another repo

This kit is meant to be copied into the root of a project repo and then customized.

### 1. Copy the kit

From the target repo root:

```bash
cp -R /Users/jamisonrabbe/Projects/notes-graph-kit/scripts ./scripts
cp -R "/Users/jamisonrabbe/Projects/notes-graph-kit/Project Notes" "./Project Notes"
cp /Users/jamisonrabbe/Projects/notes-graph-kit/notes-graph.config.json ./notes-graph.config.json
cp /Users/jamisonrabbe/Projects/notes-graph-kit/AGENTS-snippet.md ./AGENTS-snippet.md
```

If the repo has no `package.json`, copy this kit's `package.json` and `package-lock.json` too:

```bash
cp /Users/jamisonrabbe/Projects/notes-graph-kit/package.json ./package.json
cp /Users/jamisonrabbe/Projects/notes-graph-kit/package-lock.json ./package-lock.json
```

If the repo already has a `package.json`, merge these scripts and dependency instead of overwriting it:

```json
{
  "scripts": {
    "notes": "node scripts/project-notes.cjs",
    "notes:route": "node scripts/project-notes.cjs route",
    "notes:new": "node scripts/project-notes.cjs new",
    "notes:closeout": "node scripts/project-notes.cjs closeout",
    "notes:validate": "node scripts/validate-project-notes-graph.cjs"
  },
  "dependencies": {
    "js-yaml": "^4.1.0"
  }
}
```

Then run:

```bash
npm install
```

### 2. Customize the graph

Edit `notes-graph.config.json`:

   - `appName`: the project/app name.
   - `vaultDir`: the notes vault folder name inside the repo.
   - `appRel`: the app note path inside the vault.
   - `routes`: process aliases and their target process notes.

If you changed `vaultDir`, rename `Project Notes/` to match.

If you changed `appName` or `appRel`, rename/update `Project Notes/Apps/My Project.md` and the starter wikilinks in `_Codex/Start Here.md`, process, runbook, decision, and evidence notes.

### 3. Add agent instructions

Copy the block from `AGENTS-snippet.md` into the target repo's `AGENTS.md`, `CLAUDE.md`, or equivalent instructions file. Update the vault/app names in that snippet if you changed them.

### 4. Verify install

```bash
npm run notes:route -- "notes graph"
npm run notes:validate
git diff --check
```

If validation reports broken wikilinks after renaming the app or vault, fix the renamed note paths/links and rerun `npm run notes:validate`.

## Daily use

```bash
npm run notes:route -- "describe the task"
npm run notes:new -- --title "Task title" --process notes-graph-maintenance --summary "Goal"
npm run notes:closeout -- --note "Project Notes/Evidence/YYYY-MM-DD Task title.md" --working "..." --verified "..." --not-verified "..."
npm run notes:validate
```

Typical agent workflow:

1. Read `Project Notes/_Codex/Start Here.md`.
2. Run `npm run notes:route -- "<task>"`.
3. Create a task/evidence note with `npm run notes:new`.
4. Do the work and record exact verification.
5. Close the task note with `npm run notes:closeout`.

## Environment overrides

- `PROJECT_NOTES_NOTES_REPO_ROOT=/path/to/repo`
- `PROJECT_NOTES_NOTES_VAULT_ROOT=/path/to/vault`
- `PROJECT_NOTES_CONFIG=/path/to/notes-graph.config.json`

Generated from PTMaestro on 20260705171118. Product build artifacts and project-specific evidence were intentionally excluded.
