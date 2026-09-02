---
title: Living Status Notes
schema_version: 1
type: evidence
status: done
date: "2026-09-02"
tags:
  - notes/evidence
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
last_verified: "2026-09-02"
---

# Living Status Notes

## Scope

Add a first-class living Status note per process and atomically refresh it at phase closeout.

## Inventory

## Validation

## Not Verified

## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-09-02 13:40 PDT

- Working: Implemented type: status, a Status template and index, process uniqueness validation, atomic phase-closeout updates, status-aware search/context/stats, 0.13.0 migration, and documentation.
- Verified: npm test passed 106/106; npm run notes:validate passed with 0 warnings; git diff --check passed; focused lifecycle and migration safety coverage passed.
- Not verified: No consumer repository has upgraded or audited the 0.13.0 vault migration, and Obsidian visual rendering has not been exercised.
