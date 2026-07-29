---
title: Cumulative Upgrade Migration Guidance
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

# Cumulative Upgrade Migration Guidance

## Goal

Make upgrades surface every cumulative vault migration required between the installed and current kit versions.

## Context

The previous upgrader only said that vault content was untouched and to run the validator. The authoritative README contained separate 0.2.16 and 0.3.0 migration sections, but neither the installer output nor the README made clear that a direct version jump must apply every intervening vault migration. `kitVersion` cannot safely suppress older guidance because it records installed scripts, not completed vault work.

## Changes

- Added an ordered vault-migration catalog to the installer.
- Made every upgrade and upgrade dry-run print all migration sections applicable to the destination kit, the exact authoritative README path, and the reason the checklist is cumulative.
- Kept the output conservative for already-stamped repositories: a `0.3.0` stamp still lists 0.2.16 and 0.3.0 because the stamp does not prove either vault migration was applied.
- Reordered the README migration sections chronologically and documented the direct `0.2.15` to `0.3.x` case.
- Bumped package and lockfile metadata to 0.3.1.

## Verification

- `npm test` passed all 58 tests.
- New unit coverage proves migration selection by destination version, chronological ordering, invalid-version rejection, the exact README path, and the `kitVersion` limitation notice.
- New integration coverage proves both `0.2.15` and already-stamped `0.3.0` targets receive the complete 0.2.16 plus 0.3.0 checklist during a read-only dry-run.
- `npm run notes:validate` passed with zero warnings.
- `npm audit --omit=dev` found zero vulnerabilities.
- `git diff --check` passed.
- Installer help reports kit version 0.3.1.

## Not Verified

- No real downstream repository was upgraded with 0.3.1.
- GitHub Actions has not run because this work is not committed or pushed.

## Tried and Failed

- The initial free-form route `version aware cumulative upgrade migration instructions` did not match a configured alias; the explicit `notes graph` route resolved correctly.
- The first design idea used only the installed `kitVersion` to choose migrations. That is unsafe because an earlier scripts-only upgrade can advance the stamp without migrating the vault, so the implementation intentionally lists every applicable migration for the destination version.
- The first post-closeout validation rejected a reverse link from the process note because `related_evidence` cannot target a `type: task` note. Removing that invalid reverse link restored the graph; the task note already supplies the valid process relationship.

## Risks / Follow-ups

- The checklist tells an operator or coding agent exactly what to apply, but normal upgrade remains vault-untouched by design.
- Future vault-changing releases must add a chronologically ordered entry to `VAULT_MIGRATIONS` and a matching README heading.
## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-07-28 14:44 PDT

- Working: Notes Graph Kit 0.3.1 upgrades now print the complete cumulative vault-migration checklist, the exact authoritative README path, and the kitVersion limitation so agents cannot silently miss an older vault migration.
- Verified: npm test passed 58/58; migration unit and dry-run integration coverage passed; notes validation, dependency audit, installer help/version, and git diff checks passed.
- Not verified: No real downstream repository was upgraded with 0.3.1, and GitHub Actions has not run because no commit or push was requested.
