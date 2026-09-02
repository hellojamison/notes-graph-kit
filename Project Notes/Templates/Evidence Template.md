---
title: "Evidence Template"
schema_version: 1
type: template
status: active
date: "2026-07-05"
tags:
  - template
  - notes/template
---

<!-- notes-graph-kit:scaffold:start -->
```yaml
title: Evidence Title
schema_version: 1
type: evidence
status: open
evidence_format: 2
topic: Evidence Title
verification: unverified
date: YYYY-MM-DD
tags:
  - notes/evidence
app: "My Project"
source_of_truth: false
confidence: medium
related_apps:
  - "[[Apps/My Project|My Project]]"
related_processes:
related_runbooks:
related_decisions:
verdict_decision:
follow_up:
```
<!-- notes-graph-kit:scaffold:end -->

# Evidence Title

## Current Verdict

Pending — no settled decision yet.

## Scope

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

## Not Verified

## Graph Links

- Status:
- Decisions:
