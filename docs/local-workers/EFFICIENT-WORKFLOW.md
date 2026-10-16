# Qwen-first execution checklist

Follow ASTRA-INSTRUCTIONS.md for ownership, evidence, runtime and safety rules.
This checklist replaces repeated historical qualification appendices at startup.

1. Choose one factual question or authorized change. Supply exact known anchors,
   scope, omissions and what would constitute evidence. For unknown code, discover
   first, then trace. Never duplicate an active worker's investigation.
2. From the installed local-worker directory, dispatch read-only work with:
   `.venv/bin/python route-worker.py --repo ABS --role SCOUT --phase trace
   --evidence-goal source --task "one question" --handoff-input relative/file
   --handoff-acceptance "required observed fact" --output NEW_ABSOLUTE_RECEIPT`.
   In the LM Studio bridge use its scoped local_worker MCP tool; nested shell
   sandboxes fail. Notes handoff and mandatory source review remain enabled.
3. For substantial authorized coding, read CODING-WORKFLOW.txt and prepare a clean
   non-main worktree. Use coding-worker.py --allow-write with 1–4 exact write files
   and exact JSON-argv commands. Do not route an incomplete write to Luna.
4. Predetermined tests use TESTER --test-results-only and exact --test-command;
   add --isolated-tests only when needed. Read the recorded exit/totals. Do not
   repeat a passing unchanged test for reassurance. Host environment failures
   are explicit limitations to fix, not model conclusions.
5. Consume the compact receipt once. Inspect decisive evidence/diff independently;
   distinguish source, package, installed, native and remote proof. Reconcile
   scope/source drift locally. Genuine incomplete read-only work gets at most one
   bounded Luna fallback, preserving residual questions and prior observations.
6. Record accepted findings through the repo's notes helpers, preserving failed
   attempts and unverified boundaries. No worker PASS automatically certifies notes.
7. Record review and task outcome, then preserve evidence and remove finished
   task-owned temporary checkouts after checking status and active use.

Receipt assessment (redirect verbose scorecard output to a local artifact):

```sh
.venv/bin/python investigation_scorecard.py --review-any ABSOLUTE_RECEIPT \
  --verdict correct --useful-finding accepted --finding-source qwen \
  --used-by-coordinator used --correction none --note 'Actual reviewed scope.'
```

Choose truthful partial/incorrect/rejected/unknown values when applicable.
Task outcome is separate from worker correctness:

```sh
.venv/bin/python ../task_outcomes.py --thread-id CHAT_ID --turn-id latest \
  --verdict accepted --category repository-maintenance --note 'Actual outcome.'
.venv/bin/python ../measure-worker-usage.py --thread-id CHAT_ID --last 5 \
  --output /absolute/report.json
```

Metrics are on demand, not a scheduler. Completed-turn joins may lag the active
turn; disclose missing usage and unmatched work. Never infer savings from token
percentages or relabel diagnostics as production.

Detailed implementation protocol: CODING-WORKFLOW.txt. Narrow legacy writes:
OFFLOAD-WORKFLOW.md. Notes packet details: NOTES-HANDOFF.md. Queue/runtime limits:
../inference-gate/README.md. Historical coordinator policies: policy-history/.
Consult only the relevant reference for a concrete gap; do not load the entire
historical corpus into every repository task.
