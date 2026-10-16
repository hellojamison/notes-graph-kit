---
title: Optional local repository worker adapter
schema_version: 1
type: evidence
status: done
evidence_format: 2
topic: Optional local repository worker adapter
verification: unverified
date: "2026-10-05"
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
verdict_decision: "[[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]"
follow_up: null
created_by: project-notes-cli
last_verified: "2026-10-05"
---

# Optional local repository worker adapter

## Current Verdict

Optional worker adapter implemented and validated on this Mac; ordinary installs remain disabled and worker completion requires coordinator acceptance.

Decision: [[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]

## Scope

Add opt-in local worker routing, handoff receipts, diagnostics and lifecycle controls without enabling workers on ordinary install.

## Inventory

## Validation

## Receipts

<!-- notes-graph-kit:receipt:start -->
```yaml
id: optional-workers-host-and-live-validation
outcome: verified
tests:
  filter: npm test -> node --test tests/*.test.mjs
  passed: 184
artifacts:
  - path: artifacts/worker-adapter-0.18/notes-graph-worker-tests.log
    sha256: 2737a36bb53ebf8ac8bdda93da64bac9b0b051d181da536d657dce0bdfd70692
  - path: artifacts/worker-adapter-0.18/notes-graph-worker-validation.json
    sha256: 04a9493933f2ccaa1335560d5295daeff846ccf3ff84785388b4755258c2fc8e
  - path: artifacts/worker-adapter-0.18/notes-graph-worker-final-review.json
    sha256: dccd598ca9139bcd42a2579b0579f5d6e3fc840c3ef73e9c2ff8015aa89722e2
```
<!-- notes-graph-kit:receipt:end -->

Add one marked YAML receipt per meaningful run. Each receipt has a stable `id`,
an `outcome`, and any applicable `tests.filter`, artifact `path`/`sha256`,
`git_sha`, decision links, and open-item IDs. Keep the prose short; let the
receipt carry the command, counts, paths, and hashes.

Use the standard receipt marker pair from the Notes System guide. Do not put a
sample receipt in this template: an example should not look like a run that
actually happened.

## Not Verified

## Graph Links

- Status: [[Status/Notes Graph Maintenance Status|Notes Graph Maintenance Status]]
- Decisions: [[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]

## Closeout 2026-10-05 21:20 PDT

- Working: Version 0.18 optional read-only worker adapter, external host registration, explicit repo opt-in, fresh packet-linked receipts, lifecycle controls and bounded authorized cloud routing.
- Verified: The npm test gate passed with exact filter node --test tests/*.test.mjs; search and context contracts passed. Real Qwen SCOUT and filtered TESTER receipts were reviewed. A touch probe was denied by the read-only sandbox and created no source file.
- Not verified: Kit MCP/front-door packaging, direct IMPLEMENTER integration and live cloud dispatch are outside this first release. A stalled LM Studio request needed a manual same-model reload; no never-stall guarantee. Existing notes baseline still flags two stale current guides, independently reproduced without the adapter note.
