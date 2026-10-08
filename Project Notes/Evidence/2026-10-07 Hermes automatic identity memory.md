---
title: Hermes automatic identity memory
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

# Hermes automatic identity memory

## Goal

Pin the memory skill at startup and close the automatic-save gap for explicitly stated identity facts.

## Context

The user reported Hermes asking permission to save an explicitly stated name. Runtime readback showed skills.auto_load was empty. The earlier policy named preferences/corrections but did not explicitly name identity facts as immediate save triggers. A bounded worker audit was incomplete; coordinator review confirmed the gap in the source.

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

The initial isolated behavior test used the macOS /var alias and the CLI rejected the symlinked memory home. Correcting the test home to its real absolute path resolved that environment failure; Hermes then saved the name without a remember request or confirmation. No runtime hook or background recorder was added. The first test response claimed native retention after the toolbox error; acceptance is based on the actual toolbox record from the corrected test, not that claim.

## Graph Links

- Status: [[Status/Notes Graph Maintenance Status|Notes Graph Maintenance Status]]
- Decisions: [[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]

## Closeout 2026-10-07 21:36 PDT

- Working: Pinned agent-memory-toolbox in default Hermes skills.auto_load, previously empty, and installed skill v1.1.1 with explicit during-turn identity fact saves before replying. Updated the existing SOUL activation block. Saved and verified Jamison in the real hermes profile using the user-provided conversation as source.
- Verified: Hermes config readback confirms the pinned skill. Skill validation passed. A real isolated Hermes session, with normal auto-load and only the introduction Hi, my name is Jamison, saved a toolbox record without asking for permission; the record was inspected independently.
- Not verified: Existing active chats may retain earlier session-start instructions until reloading the skill or starting a new session. The live test covers one identity fact, not every future model response.
