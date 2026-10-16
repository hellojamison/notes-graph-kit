---
title: Agent memory diagnostics and repo retrieval rollout
schema_version: 1
type: task
status: done
date: "2026-10-15"
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
last_verified: "2026-10-15"
---

# Agent memory diagnostics and repo retrieval rollout

## Goal

Make current verification and memory state retrievable, preserve historical evidence, and upgrade managed notes helpers.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Graph Links

- Status: [[Status/Notes Graph Maintenance Status|Notes Graph Maintenance Status]]
- Decisions: [[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]

## Closeout 2026-10-15 22:38 PDT

- Working: Released durable memory capture, deduplication, preference context and stats; added a profile-aware read-only doctor and refreshed both Hermes skill installations. Rolled out kit 0.18.0 to eight repos; condensed local worker startup policy with exact backups.
- Verified: npm test: 209 passed, zero failed/skipped. npm audit --omit=dev: zero vulnerabilities. Both Hermes profile doctors passed. Eight consumer validators and 20 search plus 20 context contracts passed locally.
- Not verified: No fresh product builds, native sessions, deployments or model conversation behavior certified. Historical product-guide verification dates remain unchanged; runtime gaps remain explicit.

## Maintenance receipts

- `artifacts/notes-maintenance-20261015/validation.json` records the exact npm gates and scope.
- Qwen coding dispatch could not start because the shared local slot was busy (two attempts, no source writes). Coordinator implemented/reviewed the doctor; known sandbox restrictions required host-side validation.
- First retrieval run exposed two missing current parity answers; added an actual eleven-file source hash comparison rather than weakening contract expectations. Both active source sets matched; packaged/corpus parity remains separate.
- An initial dependency-copy argument used a directory instead of a package name; corrected preparation retained a clean isolated baseline. Temporary task checkouts are removed at closeout.

- Final release proof: `artifacts/notes-maintenance-20261015/release-validation.json` binds test results to source hashes and lists eight verified remote consumer commits. Compressed complete npm test output is retained beside it.
- OverFlow and ptxExtractor histories diverged independently; their scoped maintenance commits were pushed to `codex/notes-maintenance-20261015`. Other consumer commits went to main. No product-history merge or forced push was performed.
