---
title: Context Quality Evaluation Harness
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

# Context Quality Evaluation Harness

## Goal

Add a reviewed opt-in regression contract for deterministic context packets without changing context output or consumer vaults.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-08-27 11:54 PDT

- Working: Added opt-in notes:context:eval contracts for required, ordered, and forbidden sources plus automatic budget, accounting, and attribution invariants; installer and upgrade deliver only the evaluator and command, while consumer contracts remain repo-owned and untouched; notes:recommend now prompts before contract or CI opt-ins.
- Verified: Focused context/evaluator/recommendation tests passed 11/11; full npm test passed 105/105; the reviewed kit context contract passed 2/2; search evaluation passed 4/4 at rank 1; stats baseline, duplicate scan, notes validation, diff check, and production dependency audit passed.
- Not verified: No consuming production repository was upgraded, and no external LLM answer-quality study was run.
