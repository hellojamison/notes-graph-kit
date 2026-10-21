---
title: Local LLM pipeline summary 2026-10-19 to 20
schema_version: 1
type: evidence
status: open
evidence_format: 2
topic: local LLM coder, gate and PR pipeline state after 2026-10-19/20
verification: unverified
date: "2026-10-20"
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
verdict_decision: null
follow_up: null
created_by: project-notes-cli
---

# Local LLM pipeline summary 2026-10-19 to 20

## Current Verdict

As of 2026-10-20 21:30 PDT: KAT 4-bit is the default local coder and the only live PR reviewer; resident uncensored Ornith is the automatic fallback coder. Docs-only PR auto-merge is enabled but had made no merge yet; code-PR merging stays dry-run because neither model clears the planted-defect bar (≥9/12 any-of-3, 0 control alarms). Open: the two-pass Ornith experiment. Sources are under `~/Documents/Projects/local-llm-audit/` (abbreviated `LLA/`); memory notes are under `~/.claude/projects/-Users-jamisonrabbe-Documents-Projects-local-llm-audit/memory/` (`MEM/`).

## Scope

Record the 2026-10-19/20 local-LLM model, agent-rule, PR-pipeline and evidence state with sources. This is a summary of other agents' records. It is not policy: the authoritative rules are in `LLA/merge-agent-instructions-2026-10-19.md`.

## Inventory

### Model setup

- Default coder: `kat-coder-v2.5-dev-optiq` (KAT-Coder-V2.5-Dev 4-bit). The v14 decision (`LLA/v14-switch-decision-2026-10-19.md`) recorded a 7–0 pass-rate win over Qwen3-Coder-Next 4-bit (p = 0.016) and ~23 GB resident vs ~43 GB. The v16 decision (`LLA/v16-ornith-decision-2026-10-19.md`) kept KAT over Ornith 4-bit: 8/8 vs Ornith 5/8.
- Qwen 4-bit was deleted on 2026-10-19, freeing ~45 GB (`LLA/fallback-ornith-2026-10-19.md`).
- Fallback coder: `ornith-1.5-35b-a3b-uncensored-mlx`. This is the resident Hermes personal model, on its own gate slot (`MEM/kat-busy-ornith-fallback.md`). The 4-bit `ornith-1.5-35b-a3b-mlx` is not resident and must not be loaded.
- Both models are loaded at 262144 context with TTL disabled, and dual residency is approved (`MEM/dual-resident-ok.md`, `MEM/gate-revisions-shared-with-hermes.md`).
- Gate revisions:
  - **v22** `2026-10-19-retire-qwen-v22`: returns HTTP 410 `retired_model` for every Qwen coder key.
  - **v23/v24**: Jamison's Hermes personal-Ornith change.
  - **v25** `2026-10-19-kat-ornith-dual-resident-v25`: allows KAT and Ornith to be resident together.
  - **v26**: what it changed is not recorded in `LLA/`.
  - **v27** `2026-10-20-per-model-slots-v27`, deployed 02:08 PDT: one slot per model, and KAT is no longer blocked by Hermes phone windows (`LLA/gate-v27-per-model-slots-2026-10-20.md`).
  - **v28** `2026-10-20-no-unload-cancel-v28`, deployed 03:17 PDT: a cancel drains the request instead of unloading the model, and workers enforce a 30 s minimum request budget (`LLA/gate-v28-no-unload-cancel-2026-10-20.md`).
  - **v29** `2026-10-20-context-262k-v29`, deployed ~19:45 PDT: accepts 262K readiness and stops evicting a model whose context is ≥ the requested one (`MEM/merge-agent-readiness.md`).
- Worker HTTP 400 "No user query found" from 01:22 to 03:01 PDT was fixed by `local-worker/message_shape.py` (`LLA/worker-template-400-fix-2026-10-20.md`).

### Agent rules now in force

All of these are in `LLA/merge-agent-instructions-2026-10-19.md` and `MEM/*.md`:

- **Implementation-first:** a 1-4 file change with a defining test goes to the local write job first. Each result is logged to `LLA/local-draft-survival.jsonl`.
- **KAT busy:** jobs fall back automatically to Ornith. Defer only when both slots are busy or a phone window is open.
- **PRs:** no draft PRs. Legacy draft PRs and feature slices stay In Progress in Asana; Needs Review means ready.
- **CI:** `workflow_dispatch` only, on the self-hosted runner `mac-studio-m5`, with the shared lock `~/.ci-locks/mac-studio.lock` (`LLA/self-hosted-runner-2026-10-19.md`, `MEM/ci-minimal.md`).
- **OF-3:** OverFlow timing/polling tests are skipped in CI (`LLA/failing-tests-triage-2026-10-19.md`).
- **Pro Tools:** it is always on. Never block on it; check memory pressure instead.
- **GitHub API:** REST-only `gh api` because the shared token hits GraphQL limits. Do not reshape PRs to fit GitHub's 20k-line/300-file diff limits.
- **Models:** agents never load, unload or switch models, and never edit the gate or routing.

### PR pipeline

From `LLA/pr-tool/README.md` and `LLA/pr-tool-v2-verdicts-2026-10-19.md`:

- **v2 verdicts:** derived on the host from citation-first findings; the model never picks a verdict.
- **Citations:** line-id citations (`L0417 | +…`), resolved by the tool.
- **Calibrated gate:** number normalisation, error vocabulary, and fuzzy identifier matching at ≥8 characters within edit distance 2.
- **Large PRs:** PRs with more than 8 files are chunked code-first, with docs not sent. Large PRs are rebuilt from per-file patches.
- **Comments:** advisory comments only (marker `<!-- local-pr-review`), live since 2026-10-19 23:38 PDT (`MEM/pr-pipeline-comment-stage.md`).
- **Poller:** the LaunchAgent `local.pr-review-poller` runs every 10 min.
- **Merging:** docs-only auto-merge (`pr_merge.py`) has been live since ~18:45 PDT; `pr-tool/merge-enabled.json` has scope `docs_only`. Code PRs are dry-run only.
- **Asana:** pipeline merges queue to `pr-tool/asana-pending.jsonl` for Luna to close out.

### Evidence

- **Scorecard** (`LLA/pr-tool/reconciliation-summary.json`, scored 2026-10-20T18:52Z):
  - 37 PRs reviewed, 35 outcomes known.
  - Local-accept precision 0.9667, with 1 false accept (OverFlow #24) and 3 false rejects.
  - Valid-answer rate 0.8649; Opus agreement 0.8857 (35 compared); policy 33/33.
  - Contract success 39/79.
- **Planted defects:** 12 frozen mutations × 3 seeds, plus controls.

  | Round (source) | KAT | Ornith |
  |---|---|---|
  | (a) `LLA/planted-defect-test-2026-10-20.md`, 4 mutations | 0/4 kept; 1 correct diagnosis dropped on format | – |
  | (b) `…-20b.md` | 1/12 kept | – |
  | (c) `…-20c.md`, line-ids | 9/36 per run, 6/12 any-of-3, 1/12 control alarms | – |
  | (d) `LLA/planted-defect-ornith-vs-kat-2026-10-20.md`, shipped gate | median 84 s per review | 11/36 per run, 6/12 any-of-3, 0 control alarms, median 236 s |
  | (d), calibrated re-score | unchanged | 17/36, 8/12, 0 control alarms |

  Neither model reached the 9/12 bar.
- **First local write merged:** OverFlow #35 (merge `6d9f68b`, ~08:20 PDT), a 1-line KAT fix for OF-2 (`LLA/local-coder-skill-usage-2026-10-15.md`, `MEM/local-coder-first.md`).
- **Draft survival** (`LLA/local-draft-survival.jsonl` at 21:30 PDT): 2 of 18 local drafts survived, both written by Ornith. KAT wrote 8, and none survived.

### Open items

- **two-pass:** the Ornith two-pass experiment (`LLA/pr-tool/validation/planted-2026-10-20e-twopass/`) started at 20:11 PDT. At 21:27 it was still waiting on a busy KAT slot before its first run (`run.log`, `waits.jsonl`).
- **of3-clock:** OF-3 needs an injected-clock fix before those tests can be un-skipped.
- **agents-md:** the uncommitted AGENTS.md edits were reported in primary checkouts but not observed (see Validation).
- **behind-main:** primary checkouts are far behind `origin/main` (counts in Validation).
- **hermes-resident-check:** the Hermes `resident_worker` single-model check was deliberately left alone. Not inspected here.
- **remote-login:** remote agent access needs Jamison to enable Remote Login on the Mac Studio (`LLA/remote-agent-access-2026-10-20.md`).

## Validation

Read-only checks run 2026-10-20 ~21:27–21:35 PDT:

- **Gate:** `curl 127.0.0.1:8081/health` returned revision `2026-10-20-context-262k-v29`, two slots (KAT and uncensored Ornith), both idle, `phone_priority_seconds` 0.
- **Merges:** `merge-log.jsonl` has 0 rows with `merged_by: "local-pipeline"`, and `asana-pending.jsonl` does not exist. Docs-only auto-merge is enabled, but no pipeline merge has happened yet. Luna made the latest merges (ptx #139/#140/#142, OverMarker #13, OverFlow #40).
- **Primary checkouts behind `origin/main`:**

  | Checkout | Commits behind |
  |---|---|
  | ptxExtractor | 355 |
  | OverFlow | 67 |
  | OverCue | 21 |
  | OverMarker | 19 |
  | PTMaestro | 9 |
  | notes-graph-kit, OverBus, OverSync | 1 each |

- **AGENTS.md:** `git status -- AGENTS.md CLAUDE.md` is clean in ptxExtractor, OverFlow, OverCue, OverBus, OverSync and PTMaestro. OverMarker has an untracked `CLAUDE.md`.

## Receipts

None. This note summarises existing reports and adds no new runs.

## Not Verified

- The v23/v24/v26 gate contents and the exact deploy times of v25 and v29. Only v29 being live was checked.
- The scorecard and planted-defect numbers were copied from their reports, not recomputed.
- Whether the docs-only merge path works end to end. No pipeline merge has happened.
- The Hermes `resident_worker` check, and whether the reported uncommitted AGENTS.md edits exist in some other checkout.

## Graph Links

- Status: [[Status/Notes Graph Maintenance Status|Notes Graph Maintenance Status]]
- Decisions: [[Decisions/Notes Graph Adoption Policy|Notes Graph Adoption Policy]]
- Previous local-worker note: [[Evidence/2026-10-15 Agent memory diagnostics and repo retrieval rollout|Agent memory diagnostics and repo retrieval rollout]]
