---
title: Proactive Hermes personal memory
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

# Proactive Hermes personal memory

## Goal

Make Hermes automatically recall and retain useful personal memory during normal tasks, with persistent startup activation.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Graph Links

- Status: [[Status/Notes Graph Maintenance Status|Notes Graph Maintenance Status]]
- Decisions: [[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]

## Closeout 2026-10-07 21:28 PDT

- Working: Skill v1.1.0 proactively recalls at task start, retains durable preferences and corrections during turns, and reviews lessons at closeout without routine confirmation. Installed matching skill and startup asset. Appended one marked activation cue to global Hermes SOUL.md while preserving prior content and a local backup.
- Verified: Skill frontmatter validator and the existing isolated portable lifecycle test passed. Installed skill and assets match authoritative source; SOUL startup marker is unique and prior identity content is preserved.
- Not verified: A live Hermes model session was not exercised. New sessions load the activation cue; automatic calls remain agent behavior guided by instructions rather than a deterministic runtime hook.
