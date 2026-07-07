---
title: Template Frontmatter Type Fixes
schema_version: 1
type: evidence
status: done
date: "2026-07-07"
tags:
  - notes/evidence
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

# Template Frontmatter Type Fixes


## Goal

Correct copyable vault skeleton templates whose target frontmatter was typed as evidence instead of the intended app/process/runbook node type.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Closeout 2026-07-07 00:24 PDT

- Working: Fixed the copyable App, Process, and Runbook templates so their frontmatter now uses type app, process, and runbook instead of evidence. Added a regression test that checks intended template frontmatter types and bumped the kit version to 0.2.5 for the changed install skeleton.
- Verified: npm test passed 9 tests, including template frontmatter uses the intended note types; npm run notes:validate passed with 0 warnings; git diff --check passed.
- Not verified: No real downstream repo was upgraded or installed with the 0.2.5 skeleton.
