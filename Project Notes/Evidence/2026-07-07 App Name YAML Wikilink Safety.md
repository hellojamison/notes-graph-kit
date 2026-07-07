---
title: App Name YAML Wikilink Safety
schema_version: 1
type: evidence
status: done
date: "2026-07-07"
tags:
  - notes/evidence
app: My Project
source_of_truth: false
last_verified: "2026-07-07"
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

# App Name YAML Wikilink Safety


## Goal

Fix installer app-name handling so generated vault frontmatter and app wikilinks remain valid for punctuation-heavy names, and reject names with Obsidian wikilink delimiters.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Closeout 2026-07-07 00:34 PDT

- Working: Fixed app-name handling so the installer preserves punctuation-heavy app names in config/frontmatter, escapes YAML-quoted contexts, derives a safe app note filename for wikilink targets, and rejects app names containing [, ], or | before any writes. Also changed generated daily frontmatter to use the shared YAML dumper and updated validation so an app note can match by title when its filename is sanitized.
- Verified: npm test passed 11 tests; npm run notes:validate passed with 0 warnings; git diff --check passed; npm audit --omit=dev found 0 vulnerabilities. Focused temp install with app name Bad quote App quote colon Take slash One hash 1 ampersand Co installed, ran notes:new, and validated with 0 warnings; focused temp install with Bad pipe bracketed Name was rejected and left the repo empty.
- Not verified: No real downstream repo was upgraded or installed with the 0.2.6 skeleton.
