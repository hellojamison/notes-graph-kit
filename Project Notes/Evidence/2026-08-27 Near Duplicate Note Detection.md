---
title: Near Duplicate Note Detection
schema_version: 1
type: task
status: done
date: "2026-08-27"
tags:
  - notes/task
app: My Project
source_of_truth: false
confidence: medium
related_apps:
  - "[[Apps/My Project|My Project]]"
related_processes:
  - "[[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]"
related_runbooks:
  - "[[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]"
related_decisions:
  - "[[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]"
created_by: project-notes-cli
last_verified: "2026-08-27"
---

# Near Duplicate Note Detection

## Goal

Add deterministic informational near-duplicate detection that never rewrites notes or fails CI by default.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-08-27 11:16 PDT

- Working: Added installed read-only notes:duplicates using deterministic five-word Jaccard shingles with conservative defaults, bounded workload, and informational-only output.
- Verified: Focused stats/duplicates tests passed 10/10; full npm test passed 98/98; fixtures proved deterministic candidate ordering, template/daily exclusion, opt-in daily inclusion, option guards, no writes, and installer delivery; live kit scan found zero pairs among 27 eligible notes.
- Not verified: Similarity candidates have not been human-reviewed in consuming production vaults and the command intentionally makes no merge/delete decision.
