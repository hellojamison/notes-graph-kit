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

<!-- notes-graph-kit:managed:templates-index:start -->
These are CLI-managed source templates for structured notes:

- [[Task Note Template]]
- [[App Template]]
- [[Process Template]]
- [[Runbook Template]]
- [[Evidence Template]]
- [[Decision Record Template]]
- [[Incident Note Template]]
- [[Release Note Template]]
- [[Status Note Template]]

Create notes through `notes:new`:

```bash
npm run notes:new -- --title "Title" --type task --process notes-graph-maintenance --summary "Goal"
```

Supported types are `task`, `evidence`, `app`, `process`, `runbook`, `decision`, `incident`, `release`, and `status`. Task, evidence, and status notes require `--process`; it is optional for the other types. A process can have exactly one Status note.

Each template note is itself `type: template`. Its single marked YAML scaffold defines the generated note metadata, and `notes:new` removes that scaffold from the finished note body. Do not copy or edit the scaffold into a destination note manually.

Generated notes begin with type-appropriate status and tags. Add `last_verified` only after checking mutable claims, and set `source_of_truth` and `confidence` to match the evidence.

Evidence uses `status: open|done`, one `topic`, and a first `## Current Verdict`; its detailed runs belong in structured receipt blocks. Put settled verdicts in Decision records, use reciprocal `supersedes` / `superseded_by` links when they change, and use the Status note's structured Open Items list for unresolved work.

This index's kit-owned guidance is enclosed by `notes-graph-kit:managed:templates-index` markers. Keep repo-specific template links or instructions outside the marker pair so an audited migration can preserve them.
<!-- notes-graph-kit:managed:templates-index:end -->
