---
title: Personal agent memory toolbox
schema_version: 1
type: task
status: done
date: "2026-10-07"
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
last_verified: "2026-10-07"
---

# Personal agent memory toolbox

## Goal

Add a standalone local toolbox for personal agent-specific memories across projects and conversations.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Graph Links

- Status: [[Status/Notes Graph Maintenance Status|Notes Graph Maintenance Status]]
- Decisions: [[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]

## Closeout 2026-10-07 19:23 PDT

- Working: Standalone agent-memory.cjs and npm memory command provide explicitly selected per-agent local stores, extensible kinds, sources, tags, revision history, expiry, bounded context, archive/forget, export and validation. Runs from non-Git folders without dependencies. Existing worker-adapter changes preserved.
- Verified: Local command-only TESTER: node --test tests/agent-memory.test.mjs passed all 14 tests. Host npm test -> node --test tests/*.test.mjs passed all 198 tests after worker sandbox npm/process restrictions were identified. git diff --check passed. Resolver findings and history helper/mutation evidence reviewed against current source; captured source SHA matches. Acceptance logs and manifest saved under artifacts/personal-agent-memory-2026-10-07.
- Not verified: No MCP server, automatic conversation capture/context injection, shared-profile recall, import, encryption or semantic retrieval. No permanent personal memory profile initialized and no global agent instructions changed. Qwen discovery/trace jobs found the shared model busy and used bounded Luna fallback. First history audit needed helper scope; corrected receipt remains source evidence, not certification.

## Acceptance Receipts

<!-- notes-graph-kit:receipt:start -->
```yaml
id: personal-memory-acceptance
outcome: verified
tests:
  filter: node --test tests/agent-memory.test.mjs
  passed: 14
artifacts:
  - path: artifacts/personal-agent-memory-2026-10-07/focused-tests.log
    sha256: 590e5664b80fa939cf59c1f6f9a34d7049c5a5cc39583f9371365ec6ab96af72
```
<!-- notes-graph-kit:receipt:end -->

<!-- notes-graph-kit:receipt:start -->
```yaml
id: personal-memory-regressions
outcome: verified
tests:
  filter: npm test -> node --test tests/*.test.mjs
  passed: 198
artifacts:
  - path: artifacts/personal-agent-memory-2026-10-07/full-suite.log
    sha256: 965585efece0023f80512a1c74f6ec81d50d77f3341a4d68529351ed00f55127
```
<!-- notes-graph-kit:receipt:end -->
