---
title: Installer AGENTS Block Automation
type: evidence
status: done
app: My Project
source_of_truth: false
last_verified: "2026-07-06"
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

# Installer AGENTS Block Automation

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

Document and verify installer support for creating or appending the Project Notes Graph AGENTS.md block.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Closeout 2026-07-06 22:52 PDT

- Working: Installer now creates AGENTS.md when missing, appends the Project Notes Graph block when AGENTS.md exists without that section, and skips existing Project Notes Graph sections.
- Verified: npm test passed 5 tests; npm run notes:validate passed with 0 warnings; git diff --check passed.
- Not verified: No real external target repo was upgraded in place; behavior was verified through the smoke tests.
