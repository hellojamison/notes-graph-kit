---
title: Audit Follow-up Fixes
type: evidence
status: done
app: My Project
source_of_truth: false
last_verified: "2026-07-07"
confidence: medium
created_by: project-notes-cli
related_apps:
  - "[[Apps/My Project|My Project]]"
related_processes:
  - "[[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]"
related_runbooks:
  - "[[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]"
related_decisions:
  - "[[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]"
---

# Audit Follow-up Fixes

```yaml
---
title: Task Name
schema_version: 1
type: task
status: active
date: YYYY-MM-DD
area:
  - area-name
tags:
  - notes/task
freshness: reverify-before-use
---
```

## Goal

Fix title-safe task wikilinks, stale scaffold docs, and add CI for notes-graph-kit.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Closeout 2026-07-07 01:04 PDT

- Working: Fixed all three audit follow-ups: task filenames now remove Obsidian target delimiters before generating wikilinks; validation now reports malformed wikilinks and checks daily body links; scaffold docs now describe the current Node validator/schema; GitHub Actions CI now runs the repo gates.
- Verified: npm test passed 13 tests; npm run notes:validate passed with 0 warnings; git diff --check passed; npm audit --omit=dev found 0 vulnerabilities; rg found no stale Python validator commands; CI YAML parsed; npm ci dry-run succeeded.
- Not verified: No downstream repo was upgraded with the 0.2.7 kit, and GitHub Actions has not run until this branch is pushed.
