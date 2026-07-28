---
title: Active Work Type Filtering
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

# Active Work Type Filtering

## Goal

Limit the starter Active Work Base to operational note types and prevent dashboard noise.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Closeout 2026-07-28 03:52 PDT

- Working: Limited the starter Active Work Base to explicit open statuses combined with task, evidence, incident, decision, release, and audit types; bumped the kit to 0.2.15.
- Verified: npm test passed all 27 subtests including the operational-type filter contract; npm run notes:validate passed with 0 warnings; git diff --check passed.
- Not verified: No downstream repo has been upgraded to 0.2.15, existing installs still need the Base change applied manually because upgrade does not migrate vault content, and the Base has not been visually opened in Obsidian.
