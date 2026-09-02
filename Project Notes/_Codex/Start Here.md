---
title: "Start Here"
schema_version: 1
type: "index"
status: "current"
date: "2026-07-05"
tags:
  - notes/index
app: "My Project"
source_of_truth: true
last_verified: "2026-07-05"
confidence: "medium"
related_apps:
  - "[[Apps/My Project|My Project]]"
related_processes:
  - "[[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]"
related_runbooks:
  - "[[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]"
  - "[[Notes System|Notes System]]"
related_decisions:
  - "[[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]"
related_evidence:
  - "[[Evidence/Notes Graph Adoption|Notes Graph Adoption]]"
---

# Start Here

<!-- notes-graph-kit:managed:start-here:start -->
This is the agent entrypoint for the project notes graph.

## Retrieval Order

1. Start with [[Apps/My Project|My Project]].
2. Move to the relevant process note.
3. Use the linked runbook for commands and gates.
4. Check related decisions for accepted rules.
5. Check incidents, evidence, and daily notes for what actually happened.

## Workflow

1. Route the work with `npm run notes:route -- "<task description>"`.
2. Create its note with `npm run notes:new -- --title "Title" --type <type> ...`.
3. Close structured evidence with `npm run notes:closeout -- --note "<note path>" --working "..." --verified "..." --not-verified "..." --verdict "..." --decision "Project Notes/Decisions/Current Decision.md"`; add `--certify` only when the evidence itself is verified. When a phase closes, also supply its process Status note plus `--phase`, `--certified`, `--settled`, and optional `--open-item "id: summary"` or `--close-item id` so the current-state summary stays aligned.
4. Run `npm run notes:validate`.
5. After upgrading the kit, audit the still-untouched vault from the kit checkout with `node migrate-notes-graph.cjs audit --repo /path/to/repo --to 0.14.0` before accepting any migration.

Supported creation types are task, evidence, app, process, runbook, decision, incident, release, and status. Task, evidence, and status notes require a process route. The CLI selects the matching template; do not copy fenced template scaffold metadata into a note manually.

## Validation

Also run `npm run notes:validate` after changing structured notes, templates, Bases, scripts, or graph links.

See [[Notes System|Notes System]] for note organization rules.
<!-- notes-graph-kit:managed:start-here:end -->
