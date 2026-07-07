---
title: P2 Notes Helper Hardening
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

# P2 Notes Helper Hardening

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

Fix task note type generation, route config validation, and preserved notes script warnings.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Closeout 2026-07-07 01:16 PDT

- Working: Fixed all three P2s: notes:new now honors task versus evidence frontmatter; route configs are schema-checked and processRel must target a process note; install and upgrade now warn when preserving custom notes:* npm scripts. Updated README, AGENTS docs, snippet text, tests, and bumped the kit to 0.2.9.
- Verified: npm test passed 17 tests; npm run notes:validate passed with 0 warnings; git diff --check passed; npm audit --omit=dev found 0 vulnerabilities; npm ci --dry-run --ignore-scripts succeeded; package.json, package-lock.json, and lock root package all report 0.2.9.
- Not verified: No downstream repo was upgraded with the 0.2.9 kit, and GitHub Actions has not run for this local change until it is committed and pushed.
