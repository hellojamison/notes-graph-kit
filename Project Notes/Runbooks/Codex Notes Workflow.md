---
title: "Codex Notes Workflow"
type: "runbook"
status: "current"
app: "My Project"
source_of_truth: true
last_verified: "2026-07-05"
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

## Stop Conditions

- Stop if the task would touch unrelated environment, secret, or app-state files.
- Stop if notes cleanup becomes the goal instead of useful retrieval.
