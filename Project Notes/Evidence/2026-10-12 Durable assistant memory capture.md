---
title: Durable assistant memory capture
schema_version: 1
type: task
status: done
date: "2026-10-12"
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
---

# Durable assistant memory capture

## Goal

Retain explicit human preferences and lessons separately from transcript episodes; disclose preference retrieval.

## Context

2026-10-12 23:45 America/Los_Angeles: user reported an episode-heavy Hermes memory
store. Read-only aggregate confirmed 365 records: 358 episodes, 2 preferences,
3 lessons, 1 fact and 1 checkpoint. Existing typed storage was capable; the
personal plugin automatically saved only expiring transcript episodes. The
installed personal skill also lacked its advertised bundled scripts directory.

## Changes

- Added standalone `capture --trusted-user` for narrow explicit human statements,
  preserving wording/source, durable types, and deduplicating active equivalents.
  Other text returns without a write. Secret-like/quoted/multiline and explicit
  no-retention statements do not enter this automatic path.
- Added read-only `stats` and optional `context --include-preferences`, with
  explicit selection labels and the same word/record limits. Default lexical
  retrieval and revision/history safeguards remain intact.
- Updated the portable skill CLI and instructions to version 1.2.0; installer,
  package version and vault schema unchanged.
- The external Hermes personal plugin now invokes capture on actual interactive
  human turns and includes preference context. Assistant output remains an
  unverified, expiring episode. Its installed skill bundle was refreshed.

## Verification

- `npm test`: 203 passed, 0 failed after allowing the existing installer fixtures
  registry access and worker process inspection. Initial sandbox run: 200 passed,
  3 failed (two npm registry DNS denials and one worker process-tree assertion).
- Four new memory contracts cover trusted-input capture/deduplication, rejected
  data/secret/transient inputs, preference retrieval amid 40 episodes, and
  read-only aggregate counts with expiry/archive semantics.
- Personal plugin: 85 isolated Python contracts passed, including actual kit
  calls for preference retention, unrelated-topic recall, scheduled-input exclusion,
  and assistant-output episode-only storage. No live model prediction submitted.
- Repository worker doctor: unavailable (`default_model` not available); no model
  load, paid fallback or runtime install attempted.
- Detailed logs/backups: external task-3 `memory-improvement/` and
  `assistant-recovery/`. Unrelated dirty repository files were preserved.

## Not Verified

- No backfill of historical episodes or semantic extraction. Narrow recognition
  does not capture every paraphrase; reviewed remember/revise remains available.
- No new end-to-end model prediction for memory capture; deterministic integration
  validates actual hook/CLI behavior without competing with shared inference.

## Risks / Follow-ups

Conflicting statements are retained with sources rather than silently replacing
old records; reconcile with revision-checked `revise`. All memory is advisory data,
not authorization. Preference inclusion is opt-in and can consume the context
budget before lexical matches. No Git commit or push performed.

## Graph Links

- Status: [[Status/Notes Graph Maintenance Status|Notes Graph Maintenance Status]]
- Decisions: [[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]
