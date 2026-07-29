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

These are CLI-managed source templates for structured notes:

- [[Task Note Template]]
- [[App Template]]
- [[Process Template]]
- [[Runbook Template]]
- [[Evidence Template]]
- [[Decision Record Template]]
- [[Incident Note Template]]
- [[Release Note Template]]

Create notes through `notes:new`:

```bash
npm run notes:new -- --title "Title" --type task --process notes-graph-maintenance --summary "Goal"
```

Supported types are `task`, `evidence`, `app`, `process`, `runbook`, `decision`, `incident`, and `release`. Task and evidence notes require `--process`; it is optional for the other types.

Each template note is itself `type: template`. Its single marked YAML scaffold defines the generated note metadata, and `notes:new` removes that scaffold from the finished note body. Do not copy or edit the scaffold into a destination note manually.

Generated notes begin with type-appropriate status and tags. Add `last_verified` only after checking mutable claims, and set `source_of_truth` and `confidence` to match the evidence.
