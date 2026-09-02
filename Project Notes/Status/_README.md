---
title: Status
schema_version: 1
type: index
status: active
date: 2026-09-02
tags:
  - notes/status
related_apps:
  - "[[Apps/My Project|My Project]]"
---

# Status

Each effort has one living Status note. It is the short answer to “where are we right now?” rather than another chronological work log.

Create it once for a process:

```bash
npm run notes:new -- --title "Notes Graph Maintenance Status" --type status --process notes-graph-maintenance --summary "Phase 0.14: current evidence"
```

At each phase closeout, update the evidence note and the Status note together:

```bash
npm run notes:closeout -- --note "Project Notes/Evidence/YYYY-MM-DD Phase.md" --working "..." --verified "..." --not-verified "..." --verdict "Current conclusion" --decision "Project Notes/Decisions/Current Decision.md" --status "Project Notes/Status/Notes Graph Maintenance Status.md" --phase "Phase 0.14" --certified "..." --open-item "dense-lane-timing: Measure dense-lane timing" --settled "Receipt contract adopted"
```

The Status note states the current phase, certified facts, structured Open Items, linked settled Decisions, and a short linked history of phase closeouts. An item stays in the one list with `state: open|closed`, so historical evidence can still refer to it and a stale open loop cannot disappear into prose. It is a map to supporting evidence, not a substitute for it.
