---
title: Typed Template Scaffold Contract
schema_version: 1
type: task
status: done
date: "2026-07-28"
tags:
  - notes/task
app: My Project
source_of_truth: false
confidence: medium
created_by: codex
related_apps:
  - "[[Apps/My Project|My Project]]"
related_processes:
  - "[[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]"
related_runbooks:
  - "[[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]"
related_decisions:
  - "[[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]"
last_verified: "2026-07-28"
---

# Typed Template Scaffold Contract

## Goal

Ship a consistent machine-readable template contract and document typed note creation for notes-graph-kit 0.3.0.

## Working

- All eight product templates are schema-managed `type: template` notes with exactly one marked fenced YAML scaffold.
- Scaffold defaults are type-specific: task, evidence, and incident start active; app starts current; process, runbook, decision, and release start draft.
- Fence-aware graph parsing ignores scaffold links for body validation, malformed-link checks, and inbound edges while leaving scaffold YAML available to `notes:new`.
- `notes:new` creates all eight product types, writes note/daily/config changes together, automatically routes new process notes, and fails before writing on invalid scaffolds or route collisions.
- Typed resolvers, configured routes, route relationships, and relationship validation reject notes under `Templates/`; ordinary links to template source notes remain valid.
- `notes:closeout --certify` selects `status: verified`; ordinary closeout records `status: done` in both the note and daily log.
- The template index, Start Here, Notes System, README, and agent guidance route note creation through `notes:new` and warn against manually copying scaffold metadata.
- Package and lockfile metadata identify the release as 0.3.0.

## Verification

- `npm test` passed all 56 subtests, including the 7 focused typed-creation and certification cases.
- `npm run notes:validate` passed with 0 warnings.
- `git diff --check` passed.
- `npm audit --omit=dev` found 0 vulnerabilities.

## Not Verified

- No downstream repository or existing vault has been upgraded or manually migrated.
- Template rendering and generated-note navigation have not been opened in Obsidian.
- GitHub Actions has not run because no commit or push was requested.
- Power-loss and forced-process-termination behavior remain outside the transactional-write tests.

## Tried and Failed

- The first focused `node --test tests/typed-creation.test.mjs` run passed 4 of 7 subtests. The template contract itself passed; concurrent integration still produced an evidence relationship warning, a malformed-scaffold fixture edited the outer template frontmatter instead of the scaffold, and a promoted-process warning assertion did not match validator output. These were reported to the CLI/test owner for correction.

## Risks / Follow-ups

- Normal `--upgrade` deliberately leaves vault content and existing AGENTS blocks untouched, so existing installs must merge the documented 0.3.0 template and guidance migration manually.

## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-07-28 13:25 PDT

- Working: Implemented fence-aware graph parsing, eight typed creation paths, automatic collision-safe process routing, draft warning exemptions, template isolation, and explicit certified closeout for notes-graph-kit 0.3.0.
- Verified: npm test passed 56/56; the focused typed-creation suite passed 7/7; npm run notes:validate passed with 0 warnings; git diff --check passed; npm audit --omit=dev found 0 vulnerabilities.
- Not verified: Obsidian Base visual rendering, downstream existing-vault migration, GitHub Actions, and power-loss or forced-termination atomicity were not exercised.
