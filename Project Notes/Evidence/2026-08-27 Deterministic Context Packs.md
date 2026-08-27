---
title: Deterministic Context Packs
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

# Deterministic Context Packs

## Goal

Add a read-only notes:context command that assembles ranked sections and one-hop operational links within a hard word budget.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-08-27 11:07 PDT

- Working: Added installed read-only notes:context with deterministic ranked sections, one-hop operational graph expansion, source attribution, filters, Markdown/JSON output, and a hard source-word budget.
- Verified: Focused context/search/evaluator/stats tests passed 17/17; full npm test passed 91/91; live kit context assembled 3 ranked sections plus 3 linked operational notes within a 700-word budget.
- Not verified: No consuming production repository has been upgraded to kit 0.8.0 and no external LLM context-quality study has been run.
