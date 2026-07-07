---
title: P1 Installer Audit Fixes
schema_version: 1
type: evidence
status: done
date: "2026-07-06"
tags:
  - notes/evidence
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

# P1 Installer Audit Fixes


## Goal

Fix installer path traversal, managed-script clobbering, and consumer vault pollution from repo-local dated task notes.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Closeout 2026-07-06 23:22 PDT

- Working: Fixed all three P1 installer issues: --vault is now validated as a simple directory name before writes, install excludes kit-local dated daily/evidence notes from consumer vault skeletons, and install preflights existing managed helper scripts so it refuses to overwrite them without --force and avoids partial writes.
- Verified: npm test passed 8 tests; npm run notes:validate passed with 0 warnings; git diff --check passed; npm audit --omit=dev found 0 vulnerabilities; focused throwaway installs confirmed traversal rejection leaves no outside or repo files, script collision preserves existing helper and creates no config, and clean install has no dated task notes while keeping Evidence/Notes Graph Adoption.md.
- Not verified: No real downstream project was installed or upgraded in place; verification used test fixtures and throwaway temp repos.
