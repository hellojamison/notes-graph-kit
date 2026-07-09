# Agent Instructions Snippet

The installer writes this block into the target repo's `AGENTS.md` automatically (creating the file if needed, appending if it exists, and skipping if a `## Project Notes Graph` section is already present). For manual installs, copy the block into `AGENTS.md`, `CLAUDE.md`, or equivalent, replacing `Project Notes` and `My Project` if you changed `vaultDir` or `appName` in `notes-graph.config.json`.

```md
## Project Notes Graph

Keep concise date-and-time-stamped notes in this worktree's `Project Notes/` vault per substantive task.

Use `Project Notes/_Codex/Start Here.md` as the graph entrypoint, then use `Project Notes/Notes System.md` as the note organization guide.

For substantive tasks:
- Start from `_Codex/Start Here.md`.
- Pick the relevant app, process, and runbook before editing notes.
- Update both today's daily note and one task-specific evidence/task note.
- Link task notes to `Apps/My Project.md` plus the relevant process and runbook.
- Record what is working, what was verified, what was tried and failed, and what was not verified.
- Treat notes as evidence and navigation, not as source-of-truth policy; verify mutable facts against the repo, live system, logs, or artifacts before relying on old notes.
- Preserve old flat notes unless promoting them materially improves retrieval.

Prefer the repo-local notes helper:
- Use `npm run notes:route -- "<task description>"` to choose the app/process/runbook path.
- Use `npm run notes:new -- --title "<task title>" --process <process-alias> --summary "<goal>"` to create a task note; pass `--type evidence` for an evidence-shaped note.
- Use `npm run notes:closeout -- --note "Project Notes/Evidence/YYYY-MM-DD <task title>.md" --working "..." --verified "..." --not-verified "..."` when closing a task note.
- Run `npm run notes:validate` after graph metadata, templates, Bases, validator, helper script, or structured note changes.

Optional agent skills:
- `obsidian-markdown` for wikilinks, frontmatter, callouts, and Obsidian-flavored Markdown.
- `obsidian-bases` for `.base` dashboard edits.
- `json-canvas` if this repo adds `.canvas` files.

These skills are optional guidance only. This kit works without Obsidian, the `obsidian` CLI, or any Obsidian runtime dependency; the repo-local npm helpers and validator are the source of truth.
```
