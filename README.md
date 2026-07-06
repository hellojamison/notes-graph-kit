# notes-graph-kit

Portable starter kit for the project notes graph workflow.

## What is included

- `scripts/project-notes.cjs` — route/create/closeout helper for task notes.
- `scripts/validate-project-notes-graph.cjs` — structured note/link validator.
- `scripts/lib/project-notes-graph.cjs` — shared graph utilities.
- `notes-graph.config.json` — app name, vault folder, app note, and route aliases.
- `Project Notes/` — starter Obsidian vault skeleton with templates, Bases, and graph seed notes.

## Install in another project

1. Unzip this folder into the target repo.
2. Run `npm install`.
3. Edit `notes-graph.config.json`:
   - `appName`: the project/app name.
   - `vaultDir`: the notes vault folder name inside the repo.
   - `appRel`: the app note path inside the vault.
   - `routes`: process aliases and their target process notes.
4. Rename `Project Notes/` if you changed `vaultDir`.
5. Rename/update `Project Notes/Apps/My Project.md` if you changed `appName` or `appRel`.
6. Run `npm run notes:validate`.

## Daily use

```bash
npm run notes:route -- "describe the task"
npm run notes:new -- --title "Task title" --process notes-graph-maintenance --summary "Goal"
npm run notes:closeout -- --note "Project Notes/Evidence/YYYY-MM-DD Task title.md" --working "..." --verified "..." --not-verified "..."
```

## Environment overrides

- `PROJECT_NOTES_NOTES_REPO_ROOT=/path/to/repo`
- `PROJECT_NOTES_NOTES_VAULT_ROOT=/path/to/vault`
- `PROJECT_NOTES_CONFIG=/path/to/notes-graph.config.json`

Generated from PTMaestro on 20260705171118. Product build artifacts and project-specific evidence were intentionally excluded.
