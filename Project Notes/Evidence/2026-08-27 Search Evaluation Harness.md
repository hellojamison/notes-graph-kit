---
title: Search Evaluation Harness
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

# Search Evaluation Harness

## Goal

Add a checked-in relevance contract and deterministic evaluation command for ranked notes search.

## Context

Search ranking had deterministic unit tests but no reviewed, repo-level relevance judgments covering realistic questions against the actual vault.

## Changes

- Added `notes:search:eval`, installed through kit version 0.6.0.
- Added a strict `schema_version: 1` YAML contract with query IDs, optional search filters, expected vault-relative paths, and optional exact headings.
- Added top-1, top-3, configurable top-k, and mean reciprocal rank metrics with text and JSON reports.
- Made ranking misses exit 1 and malformed/unsafe contracts exit 2.
- Kept contracts repo-owned: install/upgrade copies the evaluator but never creates or overwrites `notes-search-eval.yml`.
- Added path traversal, direct symlink, and symlinked-parent escape guards plus unknown-field rejection.
- Added a four-query contract for this kit covering migration rollback, typed-release workflow, ambiguous wikilinks, and authority ranking.
- Added the checked-in contract to this kit's GitHub Actions CI gate.

## Verification

- `node --test tests/search-eval.test.mjs`: 4/4 tests passed, including an intentional ranking miss and malformed/escaping inputs.
- `npm run notes:search:eval`: 4/4 queries passed at rank 1; top-1 4/4, top-3 4/4, MRR 1.000.
- `npm run notes:search:eval -- --json`: returned structured per-query expected ranks and top results.
- `npm test`: 84/84 tests passed, including installer, migration, validator, search, evaluator, and typed-note coverage.

## Not Verified

- Consumer repos do not yet have reviewed evaluation contracts.
- Four kit queries are a seed set, not broad proof of ranking quality.

## Risks / Follow-ups

- Expectations can become stale when notes are intentionally renamed or reorganized; those changes require human review rather than automatic baseline regeneration.
- A top-k pass proves retrievability for labeled cases, not that every returned result is relevant.

## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-08-27 08:25 PDT

- Working: The kit installs a strict repo-owned search evaluation command with top-k and MRR reporting.
- Verified: npm test passed 84/84; evaluator tests passed 4/4; the kit contract passed 4/4 at rank 1 with MRR 1.000; notes validation and audit passed.
- Not verified: Consumer repos have no reviewed contracts yet, and four kit queries are not broad relevance proof.
