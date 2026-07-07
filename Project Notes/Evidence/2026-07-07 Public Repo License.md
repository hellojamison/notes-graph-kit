---
title: Public Repo License
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

# Public Repo License


## Goal

Add a public repository license declaration so notes-graph-kit has explicit reuse terms.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Closeout 2026-07-07 00:36 PDT

- Working: Added an MIT LICENSE file, declared license MIT in package.json and package-lock.json, and linked the license from README.md. Used a contributors copyright line rather than a personal path/name.
- Verified: node package metadata check printed MIT; npm test passed 11 tests; npm run notes:validate passed with 0 warnings; git diff --check passed. SPDX lists MIT as the standardized license identifier and canonical license text source.
- Not verified: No legal review was performed, and the choice of MIT was an engineering default for a public permissive tooling repo. No commit or push was performed.
