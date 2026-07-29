---
title: Template Null Resolver Guard
schema_version: 1
type: task
status: done
date: "2026-07-28"
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
last_verified: "2026-07-28"
---

# Template Null Resolver Guard

## Goal

Prevent high-level note resolution from returning Templates notes when callers omit an expected product type.

## Context

`resolveNoteInput(input, graph, null)` conditionally rejected templates only when `expectedType` was truthy. That allowed a future untyped caller to receive a note under `Templates/` through direct path, basename, or title matching. Current production callers pass `process` or `runbook`, so the issue was latent rather than a current routing failure.

## Changes

- Made template exclusion unconditional in both the direct resolution tier and the title/basename fallback.
- Kept low-level `resolveTarget()` unchanged so ordinary links to template notes and the Templates index still resolve.
- Added regression coverage for explicit template paths, template basenames, template frontmatter titles, and a non-template control with `expectedType === null`.
- Kept the unreleased package version at 0.3.1.

## Verification

- Focused resolver test passed.
- `npm test` passed all 58 tests.
- `npm run notes:validate` passed with zero warnings.
- `npm audit --omit=dev` found zero vulnerabilities.
- `git diff --check` passed.

## Not Verified

- No downstream repository has installed the updated 0.3.1 helper.
- GitHub Actions has not run because no commit or push was requested.

## Tried and Failed

- No implementation attempt failed. Reproduction showed the reported title-only trap also affected direct template paths and basenames, so both resolver tiers were hardened instead of applying only the suggested fallback-line change.

## Risks / Follow-ups

- Future high-level resolution callers can omit an expected product type without accidentally treating a template source note as a product note.
## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-07-28 14:46 PDT

- Working: High-level note resolution now rejects Templates notes unconditionally for explicit paths, basenames, and titles even when a future caller omits expectedType; low-level template link resolution remains unchanged.
- Verified: Focused resolver coverage passed; npm test passed 58/58; notes validation, dependency audit, and git diff checks passed.
- Not verified: No downstream repository has installed this updated 0.3.1 helper, and GitHub Actions has not run because no commit or push was requested.
