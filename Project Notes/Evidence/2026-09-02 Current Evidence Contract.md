---
title: Current Evidence Contract
schema_version: 1
type: evidence
status: done
evidence_format: 2
topic: Current evidence format and verification contract
verification: verified
date: "2026-09-02"
tags:
  - notes/evidence
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
  - "[[Decisions/Structured Evidence Contract|Structured Evidence Contract]]"
verdict_decision: "[[Decisions/Structured Evidence Contract|Structured Evidence Contract]]"
follow_up: null
created_by: project-notes-cli
last_verified: "2026-09-02"
---

# Current Evidence Contract

## Current Verdict

The current-state workflow is now a verifiable graph rather than a chronological reconstruction.

Decision: [[Decisions/Structured Evidence Contract|Structured Evidence Contract]]

## Scope

Implement current verdicts, structured receipts, supersedable decisions, status-backed open items, and navigable artifacts.

## Inventory

## Validation

## Receipts

Add one marked YAML receipt per meaningful run. Each receipt has a stable `id`,
an `outcome`, and any applicable `tests.filter`, artifact `path`/`sha256`,
`git_sha`, decision links, and open-item IDs. Keep the prose short; let the
receipt carry the command, counts, paths, and hashes.

Use the standard receipt marker pair from the Notes System guide. Do not put a
sample receipt in this template: an example should not look like a run that
actually happened.

<!-- notes-graph-kit:receipt:start -->
```yaml
id: full-contract-suite
outcome: verified
tests:
  passed: 109
  filter: npm test (all test files)
decisions:
  - "[[Decisions/Structured Evidence Contract|Structured Evidence Contract]]"
open_items:
  - consumer-rollout
closes_open_items: []
```
<!-- notes-graph-kit:receipt:end -->

## Not Verified

## Graph Links

- Status: [[Status/Notes Graph Maintenance Status|Notes Graph Maintenance Status]]
- Decisions: [[Decisions/Structured Evidence Contract|Structured Evidence Contract]]

## Closeout 2026-09-02 14:03 PDT

- Working: Implemented evidence_format 2, current verdicts, typed receipts, artifact indexing, reciprocal Decisions, structured Status items, chronological daily outcomes, migration 0.14.0, and documentation.
- Verified: npm test passed 109/109; focused structured-evidence coverage passed; npm run notes:validate passed; git diff --check passed.
- Not verified: No consumer repository has upgraded or audited the 0.14.0 migration, and Obsidian visual rendering has not been exercised.
