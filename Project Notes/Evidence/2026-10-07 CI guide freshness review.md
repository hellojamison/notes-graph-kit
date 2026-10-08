---
title: CI guide freshness review
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

# CI guide freshness review

## Goal

Resolve the CI freshness regression by reviewing current process and runbook guidance and validating the existing baseline.

## Context

GitHub CI run 37724509879 passed the tests and retrieval checks but failed the unchanged stats baseline because the two current guides were last verified on July 5. Reviewed their guidance against repository instructions, the adoption decision, npm scripts, and the CI workflow.

## Changes

Refreshed only the reviewed process and runbook verification dates. Added the complete local CI checklist and the requirement for a real review before refreshing dates. Preserved notes-stats-baseline.json and unrelated pending worker changes.

## Verification

Validated a snapshot containing only the changes being committed: npm ci, npm test, search and context evaluations, stats baseline comparison, notes graph validation, git diff --check, and npm audit --omit=dev all passed. The baseline reports zero stale current guides; audit reports zero vulnerabilities. Validator retains three historical freshness warnings for the app hub, adoption decision, and entrypoint, outside this baseline metric.

<!-- notes-graph-kit:receipt:start -->
```yaml
id: ci-guide-freshness-local-validation
outcome: verified
tests:
  filter: npm test -> node --test tests/*.test.mjs
  passed: 189
  failed: 0
```
<!-- notes-graph-kit:receipt:end -->

## Not Verified

The subsequent GitHub run is pending at closeout.

## Risks / Follow-ups

Review guides again before the 90-day freshness threshold; do not refresh dates automatically. Initial validation rejected dated task links in related_evidence, and installation tests showed those links would also break because dated work logs are excluded from starter vaults. Removed the links; the complete suite and graph gates passed afterward.

## Graph Links

- Status: [[Status/Notes Graph Maintenance Status|Notes Graph Maintenance Status]]
- Decisions: [[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]

## Closeout 2026-10-07 21:12 PDT

- Working: Reviewed Notes Graph Maintenance and Codex Notes Workflow against AGENTS.md, Notes System.md, the adoption decision, committed npm scripts, and .github/workflows/ci.yml. Updated their last_verified to the local review date and documented every CI check in the runbook. Preserved the stats baseline.
- Verified: The local command-only worker reproduced the same two stale guides reported by GitHub run 37724509879. Manual review confirmed existing guidance and command names match current source.
- Not verified: The subsequent GitHub run is pending; all local CI checks passed on the scoped snapshot.
