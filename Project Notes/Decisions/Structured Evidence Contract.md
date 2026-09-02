---
title: Structured Evidence Contract
schema_version: 1
type: decision
status: current
date: "2026-09-02"
area:
  - area-name
tags:
  - notes/decision
app: My Project
source_of_truth: false
confidence: medium
freshness: reverify-before-use
decision_state: settled
supersedes: null
superseded_by: null
related_apps:
  - "[[Apps/My Project|My Project]]"
related_processes:
  - "[[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]"
related_runbooks:
  - "[[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]"
related_decisions:
  - "[[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]"
created_by: project-notes-cli
---

# Structured Evidence Contract


## Current Decision

Settled — current-state work belongs in one living Status note; detailed evidence carries a rewritten Current Verdict and structured receipts.

## Status

Settled

## Context

Make current verdicts, receipts, artifacts, and open items machine-checkable.

## Decision

- New evidence starts `open` and closes `done`; verification is separate.
- The first section is Current Verdict and a completed note links its owning Decision.
- Receipts carry test filters/counts, artifact paths and hashes, Git SHAs, decisions, and Status open-item IDs. Prose is not parsed as proof.
- Decision replacements use reciprocal `supersedes` / `superseded_by`; Status keeps open and closed items as durable objects.

## Consequences

- Daily notes are short outcome/link ledgers, not duplicate evidence narratives.
- Evidence is capped at 1,200 words per topic and continues through a linked follow-up note.

## Revisit If

## Graph Links

- Status: [[Status/Notes Graph Maintenance Status|Notes Graph Maintenance Status]]
- Decisions: [[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]
