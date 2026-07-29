---
title: Templates
schema_version: 1
type: index
status: active
date: 2026-06-03
tags:
  - notes/templates
---

# Templates

Copy these templates for new structured notes.

- [[Task Note Template]]
- [[App Template]]
- [[Process Template]]
- [[Runbook Template]]
- [[Evidence Template]]
- [[Decision Record Template]]
- [[Incident Note Template]]
- [[Release Note Template]]

All templates include a `schema_version: 1` frontmatter block. App, Process, Runbook, and Evidence templates are direct-copy notes with their intended product `type`. Task, Decision, Incident, and Release templates are wrappers; use `notes:new` for tasks/evidence or copy the inner scaffold and set the intended `type`.

After copying, replace `title`, `type`, `date`, `status`, tags, and graph relationships with values for the new note. Add `last_verified` only after checking mutable claims, and set `source_of_truth` and `confidence` to match the evidence. Keep copied notes on the schema contract unless the note is intentionally legacy or disposable.
