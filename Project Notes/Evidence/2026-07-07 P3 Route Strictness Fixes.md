---
title: P3 Route Strictness Fixes
type: task
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

# P3 Route Strictness Fixes

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

Fail validation for missing configured route targets and make route lookup honor per-call env/config.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Closeout 2026-07-07 01:26 PDT

- Working: Fixed both route P3s: configured route targets now fail validation when missing, and route lookup now derives definitions from the per-call env/config instead of a module-load snapshot. Added compatibility getter for routeDefinitions and documented route processRel requirements.
- Verified: npm test passed 19 tests, including missing configured route target and per-call env route config regressions; npm run notes:validate passed with 0 warnings; git diff --check passed; npm audit --omit=dev found 0 vulnerabilities; npm ci --dry-run --ignore-scripts succeeded.
- Not verified: No downstream repo was upgraded with the 0.2.10 kit, and GitHub Actions has not run for this local change until it is committed and pushed.
