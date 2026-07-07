---
title: Generated Note Metadata Fix
schema_version: 1
type: task
status: done
date: "2026-07-07"
tags:
  - notes/task
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

# Generated Note Metadata Fix


## Goal

Remove generated task template YAML leakage and enforce schema-managed required metadata without breaking legacy notes.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Closeout 2026-07-07 01:53 PDT

- Working: Fixed generated note metadata and template leakage: notes:new now emits schema_version, date, and tags; task template body no longer carries a copied YAML frontmatter sample; schema-managed notes now enforce required fields while legacy frontmatter notes without schema_version remain compatible; Evidence/ is documented as the CLI work-log folder and current is documented as a status.
- Verified: npm test passed 21 tests including generated task/evidence metadata, schema-required validation, and legacy compatibility; npm run notes:validate passed with 0 warnings; git diff --check passed; npm audit --omit=dev found 0 vulnerabilities; npm ci --dry-run --ignore-scripts succeeded.
- Not verified: No downstream repo was upgraded with the 0.2.11 kit, and GitHub Actions has not run for this local change until it is committed and pushed.
