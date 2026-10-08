---
title: "Codex Notes Workflow"
schema_version: 1
type: "runbook"
status: "current"
date: "2026-07-05"
tags:
  - notes/runbook
app: "My Project"
source_of_truth: true
last_verified: "2026-10-07"
confidence: "medium"
related_apps:
  - "[[Apps/My Project|My Project]]"
related_processes:
  - "[[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]"
---

# Codex Notes Workflow

Use this runbook for task-start and task-closeout note updates.

## Steps

1. Confirm the current worktree and branch.
2. Read the relevant process and decision notes.
3. Run the smallest useful validation.
4. Record working, verified, and not verified results.

## Before Pushing Kit Changes

Run the checks defined in `.github/workflows/ci.yml` against the changes being committed:

```bash
npm ci
npm test
npm run notes:search:eval
npm run notes:context:eval
npm run notes:stats -- --baseline notes-stats-baseline.json
npm run notes:validate
git diff --check
npm audit --omit=dev
```

The stats baseline includes guide freshness. When it reports a stale current process or runbook, review that guide against current source and instructions, correct outdated claims, update `last_verified` only after the review, and record the evidence. Keep `notes-stats-baseline.json` unchanged unless its contract needs a separately reviewed change.

## Stop Conditions

- Stop if the task would touch unrelated environment, secret, or app-state files.
- Stop if notes cleanup becomes the goal instead of useful retrieval.
