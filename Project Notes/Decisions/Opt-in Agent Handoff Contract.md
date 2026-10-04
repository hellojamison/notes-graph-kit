---
title: Opt-in Agent Handoff Contract
schema_version: 1
type: decision
status: current
date: "2026-10-04"
area:
  - agent-handoffs
tags:
  - notes/decision
app: My Project
source_of_truth: false
confidence: medium
freshness: reverify-before-use
decision_state: accepted
supersedes: null
superseded_by: null
related_apps:
  - "[[Apps/My Project|My Project]]"
related_processes:
  - "[[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]"
related_runbooks:
  - "[[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]"
related_decisions: []
created_by: project-notes-cli
---

# Opt-in Agent Handoff Contract


## Current Decision

Handoff is opt-in and separate from evidence certification. The CLI ships with kit 0.17.0; live agent adoption remains unverified.

## Status

Accepted for kit implementation; consumer adoption pending.

## Context

Use immutable assignment packets separate from evidence certification, with declared-input freshness and coordinator-owned acceptance.

## Decision

Create immutable assignment JSON with a bounded existing context packet and declared-file snapshots. Check worktree, HEAD, input/note hashes, and packet corruption. The sender owns acceptance; a worker never certifies itself. Keep output outside the vault, with no dispatch or shared-note lifecycle writes.

## Consequences

Existing context/search/evidence behavior remains unchanged. The installer adds one managed CLI helper and preserves custom npm commands. The optional skill is loaded explicitly; it is not globally installed. Snapshot checks cover declared files, not exhaustive discovery or runtime identity.

## Revisit If

A real pilot demonstrates missing inputs, excessive review cost, or the need for runner integration and returned-result validation.

## Graph Links

- Status: None selected
- Decisions: None selected
