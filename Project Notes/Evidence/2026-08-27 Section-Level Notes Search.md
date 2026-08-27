---
title: Section-Level Notes Search
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

# Section-Level Notes Search

## Goal

Add deterministic section-level BM25 retrieval with typed filters and installed-repo support.

## Context

The graph had deterministic routing and validation but no ranked retrieval across larger vaults.

## Changes

- Added a read-only `notes:search` command with section-level BM25 scoring.
- Added repeatable type/status filters, date and result limits, JSON output, template exclusion, and fenced-code exclusion.
- Installed the search script and npm command into target repos and bumped the managed-script kit version to 0.5.0.
- Decoupled the 0.5.0 managed-script version from the latest vault migration target, which remains 0.4.0.

## Verification

- Focused `node --test tests/search.test.mjs`: 4/4 tests passed.
- Real vault search `npm run notes:search -- "rollback migration" --limit 3`: returned ranked section paths, headings, metadata, scores, and excerpts.
- Focused installer/migrator regression selection: 5/5 tests passed after the version-boundary correction.

## Not Verified

- Retrieval relevance on large consumer vaults has not been evaluated.
- Performance thresholds for adding an incremental index have not been measured.

## Risks / Follow-ups

- Search scans canonical Markdown on every invocation; this is intentionally simple for 0.5.0 but may become slow at substantially larger vault sizes.
- BM25 lexical retrieval will not match conceptually related notes that share no useful terms.

## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-08-27 01:15 PDT

- Working: Read-only section-level BM25 search is installed as notes:search with deterministic ranking, filters, JSON output, and no generated cache.
- Verified: npm test passed 78/78; focused search passed 4/4; focused version/migration regressions passed 5/5; real vault query returned ranked sections.
- Not verified: Retrieval relevance and scan performance on large consumer vaults were not measured.
