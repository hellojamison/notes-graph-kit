---
title: Validator Warning Summary and Active Work
schema_version: 1
type: task
status: done
date: "2026-07-28"
tags:
  - notes/task
app: My Project
source_of_truth: false
last_verified: "2026-07-28"
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

# Validator Warning Summary and Active Work

## Goal

Summarize accepted legacy validator warnings by default, preserve verbose diagnostics, and correct the starter Active Work dashboard.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Closeout 2026-07-28 03:24 PDT

- Working: Added default warning-category summaries with a --verbose escape hatch, kept actionable warnings individual, corrected the starter Active Work Base to explicit open statuses and ordered columns, documented the behavior, and bumped the kit to 0.2.14.
- Verified: npm test passed all 27 subtests; npm run notes:validate passed with 0 warnings; git diff --check passed. The regression fixture proved five recurring categories are summarized, an orphan-runbook warning remains individual, and --verbose restores all six file-level warnings.
- Not verified: GitHub Actions has not run because these changes are not committed or pushed. Only PTMaestro has been upgraded to 0.2.14 so far.
