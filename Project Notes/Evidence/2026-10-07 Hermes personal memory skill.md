---
title: Hermes personal memory skill
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

# Hermes personal memory skill

## Goal

Package and install a discoverable Hermes skill for the standalone personal agent memory toolbox.

## Context

## Changes

## Verification

## Not Verified

## Risks / Follow-ups

## Graph Links

- Status: [[Status/Notes Graph Maintenance Status|Notes Graph Maintenance Status]]
- Decisions: [[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]

## Closeout 2026-10-07 19:58 PDT

- Working: Created skills/agent-memory-toolbox/SKILL.md with bundled scripts/agent-memory.cjs and installed an exact copy at ~/.hermes/skills/productivity/agent-memory-toolbox. Hermes lists it local and enabled. Initialized the empty hermes profile in the external personal memory store. Instructions cover bounded recall, attributed saves, corrections, archive and explicit forgetting.
- Verified: Skill-creator quick_validate.py succeeds under the installed worker Python on the host. node --test tests/hermes-memory-skill.test.mjs passes one end-to-end portable bundle lifecycle test: init, save, context, revise/history, archive, export, forget and validate from unrelated cwd, with another-agent env selection overridden explicitly. Installed skill and CLI bytes match canonical source; bundle matches root CLI. No sample personal facts seeded.
- Not verified: Hermes LLM decision-making was not forward-tested. New session skill selection is expected; no running conversation prompt prefix was modified. Hermes repo lacks notes handoff config/helper, so worker convention lookup stopped without a source conclusion; local and official skill docs supplied conventions. Worker sandbox could not read the skill-creator validator; host validation succeeded without dependency installation.

## Commit Validation

The isolated staged source passed the full suite after including the existing synthetic-fixture freshness helper. Worker-adapter implementation and version changes remain outside this commit.

<!-- notes-graph-kit:receipt:start -->
```yaml
id: personal-memory-staged-release
outcome: verified
tests:
  filter: npm test -> node --test tests/*.test.mjs
  passed: 189
artifacts:
  - path: artifacts/personal-agent-memory-2026-10-07/staged-suite.log
    sha256: 7126c166a11eec268b9f139f28ec407a6e33d36b77b0492bb65fd1932b4cec3e
```
<!-- notes-graph-kit:receipt:end -->
