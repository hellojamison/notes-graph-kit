---
title: CLAUDE Instruction Parity
schema_version: 1
type: task
status: done
date: "2026-09-05"
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
last_verified: "2026-09-05"
---

# CLAUDE Instruction Parity

## Goal

Provide the same managed notes workflow in AGENTS.md and CLAUDE.md through installation, upgrade, and audited migration.

## Context

The installer previously managed only AGENTS.md; existing installations received no Claude entrypoint during upgrades.

## Changes

- Version 0.15.0 installs and upgrades missing notes instruction blocks in both root files from AGENTS-snippet.md.
- Migration 0.15.0 audits CLAUDE.md with managed refresh, exact legacy adoption, and durable rollback. Both files share fence-aware detection.
- Rendering honors full configured appRel paths, including nested and non-Apps folders.

## Verification

- `npm test`: 125/125 passed; log `/tmp/notes-claude-full-tests.log`.
- `npm run notes:context:eval`: 2/2 passed; log `/tmp/notes-claude-context.log`.
- `git diff --check`: passed.

## Not Verified

Consumer rollout, actual Claude behavior, and Obsidian visual rendering. Changes are uncommitted.

## Risks / Follow-ups

Upgrade consumers separately when requested.

## Tried and failed

- `npm run notes:search:eval`: 3/4 passed; typed-release-workflow expected top 3 but ranked 4. Reproduced unchanged on a temporary archive of HEAD (0.14.0): `/tmp/notes-claude-search-baseline.log`. Existing failure, outside this change.
- Intermediate test runs exposed stale version assertions and incorrect test expectations for snippet path formatting; corrected before the final 125/125 run.

## Graph Links

- Status: [[Status/Notes Graph Maintenance Status|Notes Graph Maintenance Status]]
- Decisions: [[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]

## Closeout 2026-09-05 22:56 PDT

- Working: Install and upgrade add missing AGENTS.md and CLAUDE.md notes blocks from one snippet; existing sections are preserved for audited migration.
- Verified: `npm test` passed 125/125; context evaluation passed 2/2.
- Not verified: No consuming repository has been upgraded; actual Claude agent behavior and Obsidian rendering have not been exercised.

## Agent Selection Revision 2026-09-05 23:01 PDT

The user narrowed installation to the file needed by the selected agent. This supersedes the earlier behavior that created both instruction files.

- Install and upgrade accept `--agent codex|claude|gemini|copilot|cursor`, save `config.agent`, and manage only its file. Legacy configs default to codex. Other agent files remain unchanged even when their markers are malformed.
- Codex and Cursor use AGENTS.md; Claude uses CLAUDE.md; Gemini uses GEMINI.md; Copilot uses .github/copilot-instructions.md. README links current official documentation for the additional formats.
- Migrations follow the saved selection, and rollback restores the prior config bytes. The shared snippet explicitly instructs agents to install only their own format.
- Not verified: actual agent loading or behavior, live consumer rollout. Changes remain uncommitted.
- Tried and failed: none in the selection-focused tests. The previously recorded search-evaluation failure remains outside this change.

- Working: `npm test` passed 144/144 (`/tmp/notes-agent-full-tests.log`); `git diff --check` passed.

## Complete Agent Adoption 2026-09-05 23:14 PDT

- Added `--agent` to unmanaged vault migration audit/apply, closing the remaining Codex-only adoption path. All five agents now have selected-file install, upgrade, adoption, refresh, and rollback coverage.
- Installed migrations retain saved selection and reject overrides; rollback uses backup state. Unmanaged audit/apply must use the same explicit agent.
- Focused verification: `node --test --test-name-pattern='unmanaged adoption selects|agent override' tests/migrate-instructions.test.mjs` passed 6/6 (`/tmp/notes-all-agents-adoption.log`).
- Not verified: loading the generated instructions in each live agent application, consumer rollout. Changes remain uncommitted.
- Tried and failed: none in this phase; the previously reproduced search-contract failure remains recorded above.

- Working: final `npm test` passed 150/150 (`/tmp/notes-all-agents-full.log`).

## 0.16.0 Compatibility Follow-up 2026-09-05 23:32 PDT

- Working: legacy/null frontmatter is normalized for retrieval, v2 evidence uses `verification` while legacy `status: verified` remains supported, and valid marked receipts/open items are indexed without admitting ordinary fenced code. Release supersession is now allowed alongside Decision-specific reciprocal rules.
- Working: `npm run notes:search:eval` passed 4/4 at top three after documenting the typed release creation workflow; `npm run notes:context:eval` passed 2/2; `npm run notes:validate` and `git diff --check` passed.
- Not verified: full regression suite, resolver behavior against a real dependency collision, and the requested PTMaestro/OverFlow disposable and live pilots. No consumer has been changed.
- Tried and failed: the old full suite still contains expectations for automatic lockfile mutation and unprotected unknown helper baselines; those need replacement regression cases for the fail-closed 0.16 behavior.

## 0.16.0 Pilot Completion 2026-09-06

- Working: full kit regression suite passed 152/152. Search contract passed 4/4, context contract passed 2/2, validation and diff checks passed.
- Working: disposable upgrade, migration apply, and rollback rehearsals completed for PTMaestro and OverFlow. Live upgrades and reviewed safe migrations followed, with durable backup IDs `20260906T071544082Z-e69e8238` and `20260906T071544627Z-08c8a032`.
- Working: PTMaestro received four missing active-process Status notes; OverFlow received one. Each pilot's three retrieval cases passed 3/3 at top three.
- Not verified: live agent loading and Obsidian rendering. Other consumers were inventory-only and remain unmodified.
