---
title: Agent Opt-In Recommendations
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

# Agent Opt-In Recommendations

## Goal

Add a read-only machine-readable recommendation command and managed agent instructions for evidence-based opt-in prompts after install and upgrade.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-08-27 11:43 PDT

- Working: Added installed read-only notes:recommend with a versioned JSON agent contract, evidence-based opt-in levels, approval requirements, safe next steps, and install/upgrade guidance; updated managed AGENTS instructions so agents never enable write/CI opt-ins silently.
- Verified: Focused installer/recommendation tests passed 59/59 and full npm test passed 102/102; coverage proves no-write inspection, scale-based recommendations, configured prerequisites, CI detection, unsafe-path attention, malformed-input exit 2, and install/upgrade delivery. Live kit output correctly reports existing evaluation/baseline/CI gates as enabled and duplicate review as read-only.
- Not verified: No external agent framework or production consumer has yet demonstrated that it follows the recommendation contract and prompts users correctly.
