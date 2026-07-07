---
title: Public Install Path Docs
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

# Public Install Path Docs

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

Replace machine-specific public install commands with clone-relative usage in README.md and AGENTS.md.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Closeout 2026-07-06 23:04 PDT

- Working: README.md and AGENTS.md now use clone-relative public install and upgrade commands instead of machine-specific /Users paths.
- Verified: rg found no remaining machine-specific install path; git diff --check passed; npm run notes:validate passed with 0 warnings; npm test passed 5 tests.
- Not verified: No real external target repo install was run for this docs-only change.
