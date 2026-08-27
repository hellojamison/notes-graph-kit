---
title: Project Notes Statistics
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

# Project Notes Statistics

## Goal

Add a read-only notes:stats report for vault scale, graph health, evidence state, guide freshness, and search evaluation performance.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-08-27 10:42 PDT

- Working: Added installed read-only notes:stats reporting scale, graph health, evidence verification, guide freshness, largest content, and search evaluation quality/latency.
- Verified: Focused stats/evaluator tests passed; full npm test passed 87/87; live kit report found 44 non-template notes, 0 broken or ambiguous links, 0 orphans, and 4/4 evaluation queries at rank 1.
- Not verified: No consuming production repository has been upgraded to kit 0.7.0 yet.
