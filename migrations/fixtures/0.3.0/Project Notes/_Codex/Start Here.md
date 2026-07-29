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
3. Close the note with `npm run notes:closeout -- --note "<note path>" --working "..." --verified "..." --not-verified "..."`; add `--certify` only when the note itself is verified.
4. Run `npm run notes:validate`.

Supported creation types are task, evidence, app, process, runbook, decision, incident, and release. Task and evidence notes require a process route. The CLI selects the matching template; do not copy fenced template scaffold metadata into a note manually.

## Validation

Also run `npm run notes:validate` after changing structured notes, templates, Bases, scripts, or graph links.

See [[Notes System|Notes System]] for note organization rules.
