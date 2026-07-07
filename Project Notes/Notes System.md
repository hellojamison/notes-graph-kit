---
title: Notes System
tags:
  - notes
  - process
schema_version: 1
type: runbook
status: active
date: 2026-06-03
area:
  - notes
related_apps:
  - "[[Apps/My Project|My Project]]"
---

# Notes System

project notes are an operational memory system, not a diary. The notes should make future work faster by recording what changed, why it changed, what proved it, and what remains unverified.

## Core Rules

- Daily notes stay at the vault root as `YYYY-MM-DD.md` and capture chronological project status.
- CLI-created task and evidence work logs live under `Evidence/` so one dated operational trail captures both planned work and proof.
- Focused task notes can stay at the vault root when they already exist, but new larger work should use the matching folder below or the CLI-managed `Evidence/` work-log folder.
- Every substantive task should update one task-specific note and today's daily note.
- Separate `Working`, `Not verified`, and `Tried and failed`. Do not let assumptions read like facts.
- Production issues must cite direct evidence: logs, routes, database rows, migration rows, package hashes, notarization output, or exact commands.
- Notes are a map, not the source of truth. If a route, DB row, package, or live app may have changed, verify it directly before relying on an old note.
- Keep release commits scoped. Do not stage SDK caches, generated build output, `.codex`, `dist`, or unrelated note churn by accident.

## Metadata Contract

New structured notes should include frontmatter with `schema_version: 1`.

Required properties:

- `title`: human-readable note title.
- `type`: one of `index`, `app`, `task`, `process`, `runbook`, `decision`, `incident`, `evidence`, `daily`, `release`, `audit`, `known-good`, or `template`.
- `status`: one of `draft`, `active`, `in-progress`, `blocked`, `verified`, `stale`, `superseded`, `partial`, `current`, `done`, `complete`, `implemented`, `investigating`, `investigated`, `fixed-uncommitted`, `packaged`, or `archived`.
- `date`: creation or task date in `YYYY-MM-DD` form.
- `tags`: Obsidian tags.

Recommended properties:

- `area`: short list such as `packaging`, `licensing`, `sdk`, `notes`, or `release`.
- `last_verified`: date when mutable claims were last checked.
- `freshness`: use `reverify-before-use` when the note contains facts that can drift.
- `superseded_by`: wikilink or path when a note is replaced.
- `related_apps`, `related_processes`, `related_runbooks`, `related_decisions`, `related_incidents`, and `related_evidence`: wikilinks to connected notes, grouped by target type.

Use this contract for new notes. Older notes do not need a bulk migration unless they become active again.

## Status Rules

- `draft`: captured but not ready to rely on.
- `active`: current work or maintained guidance.
- `current`: canonical seed note or maintained entrypoint for the active notes graph.
- `blocked`: work cannot proceed without an external input or decision.
- `verified`: evidence has been checked and recorded.
- `stale`: useful history, but reverify before use.
- `superseded`: replaced by a newer note or decision.

Any `verified` or `known-good` note that contains mutable facts should include `last_verified`.

## Folder Layout

- [[Decisions/_README|Decisions]]: lightweight architecture and product decisions.
- [[Incidents/_README|Incidents]]: production or tester failures, root cause, mitigation, and prevention.
- [[Releases/_README|Releases]]: packaged builds, notarization, Sparkle metadata, hashes, upload status, and release notes.
- [[Runbooks/_README|Runbooks]]: repeatable commands and operational procedures.
- [[Known-Good/_README|Known-Good]]: current verified baseline facts, supported versions, and known-good commands.
- [[Dashboards/_README|Dashboards]]: Bases and generated indexes for open loops, stale notes, and operational review.
- [[Templates/_README|Templates]]: copyable note templates.
- `Evidence/`: dated task and evidence work logs created by `notes:new`.

## Validation

Run the notes validator before handing off note-system changes:

```bash
npm run notes:validate
```

The validator is `scripts/validate-project-notes-graph.cjs`. It checks schema-managed frontmatter, typed relationship links, Bases YAML, malformed wikilinks, and broken body links in structured notes and daily notes. Legacy notes without frontmatter are preserved as warnings so existing history does not need a bulk rewrite.

## Task Note Shape

Use this structure for new task notes unless a shorter bullet note is enough:

```md
---
title: Task Name
schema_version: 1
type: task
status: active
date: YYYY-MM-DD
area:
  - area-name
tags:
  - notes/task
freshness: reverify-before-use
---

# Task Name

## Goal
What are we trying to accomplish?

## Context
Relevant files, routes, commands, decisions, or prior failures.

## Changes
What changed and where.

## Verification
Commands run, logs checked, browser routes tested, artifacts produced.

## Not Verified
What still needs proof.

## Risks / Follow-ups
Known gaps or cleanup.
```

## Daily Note Shape

Daily notes should stay compact:

```md
---
title: YYYY-MM-DD
schema_version: 1
type: daily
status: active
date: YYYY-MM-DD
tags:
  - notes/daily
---

# YYYY-MM-DD

- HH:MM: Concise status. Working: what was verified. Not verified: what was not checked.
```

## What Good Looks Like

```md
- 00:22: Fixed live `/admin/demos` outage. Vercel logs showed `NeonDbError: column demo_activations.email does not exist`. Applied migration `0009`, verified column exists as nullable `text`, redeployed clean code. Not verified: authenticated browser render.
```

That is better than:

```md
- Fixed demos page.
```
