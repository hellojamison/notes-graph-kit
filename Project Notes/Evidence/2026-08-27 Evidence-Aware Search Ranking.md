---
title: Evidence-Aware Search Ranking
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

# Evidence-Aware Search Ranking

## Goal

Add bounded authority adjustments to lexical search while preserving relevance-first behavior and transparent scores.

## Context

Pure BM25 treated every matching section as equally authoritative even though the graph already distinguishes verified evidence, current decisions, operational guides, and daily logs.

## Changes

- Added a bounded authority multiplier after positive BM25 matching.
- Boosted verified evidence, current decisions, current runbooks/processes, packaged releases, and resolved incidents by explicit small amounts.
- Applied a modest daily-note penalty while leaving tasks neutral.
- Capped combined authority at 1.25, including `source_of_truth: true`.
- Exposed lexical score, authority multiplier, authority reasons, and combined score in JSON; text output shows the score calculation.

## Verification

- Search coverage passed as part of `npm test`: 6/6 search tests passed.
- Equal-text evidence/daily fixture ranks verified evidence first while retaining identical BM25 scores.
- Unrelated-query fixture proves authority does not create a result without positive lexical relevance.
- Direct policy tests cover evidence, decision, runbook, process, release, incident, task, daily, and the multiplier cap.
- `npm test`: 80/80 tests passed, including installer, migration, validator, typed creation, and search coverage.
- `npm audit --omit=dev` initially found CVE-2026-59870 in `js-yaml` 4.3.0; `npm audit fix` updated the lockfile to 4.3.2, after which audit reported 0 vulnerabilities and `npm test` again passed 80/80.
- Real vault search displayed BM25, authority multiplier, combined score, and ranked excerpts.

## Not Verified

- Ranking quality has not been evaluated against a labeled query set from consumer vaults.
- The multiplier values are conservative policy defaults, not empirically optimized weights.

## Risks / Follow-ups

- Metadata can still be wrong; the multiplier is deliberately bounded so frontmatter cannot overwhelm substantially stronger lexical evidence.
- Future weight changes should use fixed relevance judgments rather than subjective inspection of one query.

## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-08-27 01:18 PDT

- Working: Search now applies a bounded and disclosed authority multiplier only after positive BM25 relevance.
- Verified: npm test passed 80/80; all 6 search tests passed; equal-text, unrelated-query, policy-class, and cap regressions passed; real vault output exposed the calculation.
- Not verified: Consumer-vault relevance judgments and empirical optimization of multiplier values were not performed.
