---
title: Existing Vault Migration Toolkit
schema_version: 1
type: evidence
status: done
date: "2026-07-28"
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
created_by: project-notes-cli
last_verified: "2026-07-28"
---

# Existing Vault Migration Toolkit

## Scope

Add safe audit, apply, and rollback tooling for existing Obsidian vaults and older kit installations.

## Inventory

- Added `migrate-notes-graph.cjs` with strict `audit`, `apply`, and `rollback` commands, stable JSON/human reports, documented exit codes, explicit mapping promotion, non-Git backup requirements, and exact conflict acceptance.
- Added cumulative migration modules for 0.2.16, 0.3.0, and 0.4.0. Planning uses a coalesced virtual filesystem so later template contracts supersede transitional writes.
- Added independent `vaultMigrationState`, semantic compliance inspection, frozen 0.2.15/0.2.16/0.3.0 fixtures with SHA-256 manifests, managed documentation sections, Base filter composition, template scaffold merging, and byte-preserving ordinary-note adoption.
- Added durable before/after hash and mode manifests, local Git exclusion, transactional target writes, created-file/directory removal, post-migration edit refusal, and rollback mode restoration.
- Refactored the validator into a callable sorted report API while preserving the existing CLI.
- Updated installer script-directory casing, runtime `js-yaml` and lockfile metadata, exact upgrade audit guidance, and fresh-install migration-state stamping.

## Validation

- `npm test`: 74/74 tests passed.
- `npm run notes:validate`: passed with 0 warnings and 0 errors.
- `git diff --check`: passed.
- `npm audit --omit=dev`: found 0 vulnerabilities.
- Migration coverage proved unmanaged audit is read-only; safe apply is idempotent; rollback restores bytes and POSIX modes; arbitrary legacy notes stay byte-identical; frontmatter-free mappings preserve their body; frozen historical variants migrate cumulatively; exact opt-in preserves custom prose; Bases and optional scaffold fields survive; uppercase `Scripts/` works; and `npm ci --omit=dev` can load `js-yaml`.
- Failure injection before the backup manifest and during target replacement restored the target byte-for-byte and removed incomplete backups.
- Independent safety review verified apply/rollback preimage guards, custom seed acceptance, cumulative state blocking, truthful report state, preserved-legacy classification, and single-section legacy AGENTS adoption.

## Not Verified

- Obsidian Base rendering was not opened in Obsidian.
- No downstream project repository or production vault was migrated.
- GitHub Actions has not run because no commit or push was requested.
- Power-loss, forced process termination, extended attributes, and timestamp restoration are outside the documented transaction/rollback guarantees.

## Tried and Failed

- The first end-to-end audit exposed non-idempotent template-guide handling; the managed-section supersession logic was corrected and the second audit now reports a true no-op.
- Early rollback left migration-created empty directories; backup manifests now record those directories and rollback removes them only after preflight proves no later files were added.
- The first historical-fixture apply treated exact older guide sections as customized conflicts; checked-in fingerprints now distinguish known shipped bytes from local customization.
- The first custom-merge fixture introduced a new typed-link validation error; the prospective validator correctly blocked all writes until the fixture supplied valid legacy type metadata.
- The first safety review found a planning-to-commit race, overbroad seed-path trust, premature migration attestation, prospective state mislabeled as applied, and incomplete legacy reporting. Each received a focused regression test before the full gate was rerun.
- A final rollback test initially parsed an intentionally corrupted config before checking its recorded post-migration hash. Hash preflight now runs first, preserving the specific non-mutating rollback refusal.
## Graph Links

- App: [[Apps/My Project|My Project]]
- Process: [[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]
- Runbook: [[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]

## Closeout 2026-07-28 18:54 PDT

- Working: Notes Graph Kit 0.4.0 now audits, safely adopts, transactionally migrates, and durably rolls back unmanaged or older customized vaults without rewriting ordinary legacy notes.
- Verified: npm test passed 74/74; notes validation passed with 0 warnings; git diff checks and dependency audit passed; fixture, fresh-install no-op, dry-run, npm ci --omit=dev, concurrent-edit refusal, failure-injection, idempotence, and rollback tests passed. Tried and failed cases are recorded in the evidence note.
- Not verified: No downstream vault was migrated; Obsidian Base rendering, GitHub Actions, power-loss behavior, timestamps, and extended attributes were not verified.
