---
title: Per-change daily entry files
schema_version: 1
type: task
status: done
date: "2026-10-21"
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
last_verified: "2026-10-21"
---

# Per-change daily entry files

## Goal

Stop PRs conflicting on the shared daily note: closeout writes one entry file per change and the daily note becomes a generated view.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Graph Links

- Status: [[Status/Notes Graph Maintenance Status|Notes Graph Maintenance Status]]
- Decisions: [[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]

## Closeout 2026-10-21 15:52 PDT

- Working: Closeout writes Daily/YYYY-MM-DD/HHMM-<slug>.md; notes:daily and notes:daily:build combine it with legacy daily notes; installer adds the npm scripts and a .gitignore rule for views; kit 0.19.0.
- Verified: npm test: 217/217 pass (5 new in tests/daily-entries.test.mjs, including a two-branch merge with no daily-note conflict); notes:validate passes on this vault.
- Not verified: Obsidian rendering of the per-day folder; downstream repos until their upgrade PRs run.
