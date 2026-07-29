---
title: "Start Here"
type: "index"
status: "current"
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

## Validation

Run `npm run notes:validate` after changing structured notes, templates, Bases, scripts, or graph links.

See [[Notes System|Notes System]] for note organization rules.
