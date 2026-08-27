---
title: Statistics Regression Baselines
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

# Statistics Regression Baselines

## Goal

Add opt-in versioned notes:stats baselines with safe creation, explicit replacement, stable comparison metrics, and regression exit codes.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-08-27 11:11 PDT

- Working: Added opt-in versioned notes:stats baselines with stable health/retrieval metrics, explicit safe creation/replacement, optional growth limits, CI comparison, and unchanged default behavior.
- Verified: Focused baseline tests passed 6/6 and full npm test passed 94/94, covering pass/fail/invalid exit codes, retrieval and graph regressions, informational growth, opt-in limits, overwrite refusal, malformed schemas, path escape, and symlink guards.
- Not verified: No consuming production repository has upgraded to kit 0.9.0; target repos must review and create their own baseline explicitly.
