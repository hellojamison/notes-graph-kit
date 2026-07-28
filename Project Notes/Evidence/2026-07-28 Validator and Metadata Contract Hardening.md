---
title: Validator and Metadata Contract Hardening
schema_version: 1
type: task
status: done
date: "2026-07-28"
tags:
  - notes/task
app: My Project
source_of_truth: false
last_verified: "2026-07-28"
confidence: medium
created_by: project-notes-cli
related_apps:
  - "[[Apps/My Project|My Project]]"
related_processes:
  - "[[Processes/Notes Graph Maintenance|Notes Graph Maintenance]]"
related_runbooks:
  - "[[Runbooks/Codex Notes Workflow|Codex Notes Workflow]]"
related_decisions:
  - "[[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]"
---

# Validator and Metadata Contract Hardening

## Goal

Make wikilink resolution path-safe and deterministic, align the shipped vault metadata contract, and harden note lifecycle, routing, and installer failure behavior for kit 0.2.16.

## Context

- The validator previously retried every missing path by basename, so fabricated folder paths such as `Totally/Made Up/_README` resolved to an unrelated template index.
- Root schema-managed notes and templates were outside the broken-body-link gate, leaving five nonexistent folder-index links in `Notes System.md` undetected.
- Ten of seventeen shipped Markdown seeds/templates lacked `schema_version`, `date`, and `tags`.
- Closeout coerced unquoted dates into timestamps and appended duplicate closeout/daily records on retries.
- Task templates lacked body Graph Links, fallback routes referenced absent processes, and alias collisions silently selected the first route.
- Installer force, target, AGENTS detection, version, and serial-write behavior could overwrite vault customizations, install into the wrong directory, or leave a partial installation.

## Changes

- Replaced the basename index's last-write-wins value with sorted candidate arrays and added detailed resolved, missing, and ambiguous outcomes.
- Restricted slash-containing targets to full vault-relative path matches; folderless targets resolve only when their basename is unique.
- Extended body-link checks to schema-managed, template, structured, filename-daily, and typed-daily notes while preserving flat legacy compatibility.
- Added five missing folder indexes, migrated all shipped seed/template Markdown to schema version 1, documented graph metadata and the manual existing-vault migration, and bumped the kit to 0.2.16.
- Added resolver, route, relationship, body-scope, fresh-install schema, and folder-index regression coverage.
- Preserved unquoted frontmatter dates as strings without dropping legacy YAML merge/type behavior; dumping normalizes date fields, and the validator rejects timestamp-shaped schema dates.
- Added task Graph Links with a fence-aware append fallback and made repeated closeout fail before either note or daily-log mutation.
- Reduced fallback routes to the shipped Notes Graph Maintenance process and added detailed, deterministic route ambiguity plus duplicate-alias validation.
- Excluded Templates globally from all five note dashboards while preserving useful direct-copy template types and removing false verification placeholders.
- Added managed AGENTS markers with fence-aware legacy detection, explicit vault overwrite consent, exact Git-root validation, upgrade flag/version guards, and rollback-capable transactional writes.
- Added preflight protection for symlinked/non-regular targets and parents, preserved replacement file modes, retained backups when rollback is incomplete, and made post-commit cleanup failures warnings rather than false rollback claims.
- Documented the exact existing-install migration for indexes, schema metadata, templates, Bases, dates, and legacy AGENTS blocks.

## Working

- Fresh installs receive the complete schema-managed skeleton, all five folder indexes, all eight templates, template-safe Bases, and a managed AGENTS block.
- Existing vault files are skipped unless both `--force` and `--force-vault` are present; normal upgrade remains vault-untouched.
- Date-only metadata, Graph Links fallback, repeat-closeout refusal, strict command arguments, deterministic routes, target guards, and transactional rollback are covered by regression tests.

## Verification

- `npm test` passed all 49 subtests.
- `npm run notes:validate` passed with 0 warnings.
- `git diff --check` passed.
- `npm audit --omit=dev` reported 0 vulnerabilities.
- Focused live probes confirmed `Totally/Made Up/_README` is missing, explicit `Decisions/_README` resolves correctly, and bare `_README` is ambiguous with sorted candidates.
- Fresh-skeleton inventory confirmed 22 shipped Markdown files and 22 schema-managed files.
- Failure injection before commit, after backup, during nested writes, at the AGENTS write, and after commit restored the original tree byte-for-byte with no staging residue.
- Git-root tests covered a normal root, nested-path rejection with and without the escape hatch, a linked worktree, an intentional non-Git install, filesystem root, and the user home directory.
- Independent read-only reviews found and then cleared lifecycle, route, YAML compatibility, fence parsing, installer rollback, symlink, permission, and SemVer edge cases.

## Not Verified

- No downstream repository was upgraded or manually migrated to 0.2.16.
- The new vault indexes and error messages were not visually opened in Obsidian.
- GitHub Actions has not run because no commit or push was requested.
- Power-loss, `SIGKILL`, rollback-failure backup retention, and post-commit staging-cleanup warning paths were not induced against a real filesystem failure.

## Risks / Follow-ups

- Normal `--upgrade` remains vault-untouched, so existing installs must follow the documented manual migration before the stricter validator can pass if they retain the old missing folder-index links.
- Tried and failed: the initial free-form notes route did not match a configured alias, so the explicit `notes-graph-maintenance` route was used.
- Tried and failed: the first full test run passed 29 of 30 tests but the new unit fixture omitted `noteByRel`; adding the production-shaped map made the suite pass 30 of 30.
- Tried and failed: the first combined documentation patch used stale README context and applied nothing; it was reapplied against the current section text.
- Tried and failed: the first expanded safety suite passed 44 of 46 tests; one upgrade test invoked the installer from the target directory, and the worktree fixture inherited an installed skeleton. Correcting those fixtures produced a clean run.
- Tried and failed: the first 47-test green implementation still had review-discovered edge cases in exact-path route precedence, legacy YAML merges, fenced headings, rollback cleanup, target symlinks, nested Git escape handling, file modes, and large SemVer values. Those cases were fixed and added to the 49-test suite.

## Closeout 2026-07-28 12:36 PDT

- Working: Strict links and metadata, canonical dates, task Graph Links, idempotent closeout, deterministic routes, template-safe Bases, managed AGENTS detection, explicit vault overwrite consent, exact target guards, and rollback-capable installer writes are implemented in unreleased kit 0.2.16.
- Verified: npm test passed 49/49; npm run notes:validate passed with 0 warnings; git diff --check passed; npm audit --omit=dev found 0 vulnerabilities; fresh inventory found 22/22 schema-managed Markdown files; independent reviews cleared the corrected edge cases.
- Not verified: No downstream vault was upgraded or migrated; Obsidian visual behavior, GitHub Actions, power-loss/forced-termination behavior, and real rollback/cleanup filesystem failures were not exercised; no commit or push was requested.
