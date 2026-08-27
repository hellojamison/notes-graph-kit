---
title: Changed Notes Statistics
schema_version: 1
type: task
status: done
date: "2026-08-27"
tags:
  - notes/task
app: My Project
source_of_truth: false
confidence: medium
related_apps:
  - "[[Apps/My Project|My Project]]"
related_processes:
  - "[[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]"
related_runbooks:
  - "[[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]"
related_decisions:
  - "[[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]"
created_by: project-notes-cli
last_verified: "2026-08-27"
---

# Changed Notes Statistics

## Goal

Add read-only Git-ref-scoped note change inventory to notes:stats without hiding global graph health.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-08-27 11:16 PDT

- Working: Added opt-in read-only notes:stats --changed-since Git-ref inventory for tracked existing/deleted Markdown notes while retaining global graph, freshness, evidence, and retrieval checks.
- Verified: Focused stats/duplicates tests passed 10/10; full npm test passed 98/98; fixture proved tracked modification/deletion reporting, untracked exclusion, global health retention, and invalid-ref exit 2; live HEAD report found one tracked daily-note change.
- Not verified: No consuming production repository has upgraded to kit 0.10.0; changed-since intentionally does not inventory untracked files.
