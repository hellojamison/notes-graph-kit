# Personal agent memory toolbox

The standalone `agent-memory.cjs` CLI lets a local agent remember things across
projects and conversations. It requires only Node.js. It can run from any folder,
without Git, npm dependencies, a project configuration, or an Obsidian vault.

Personal memories have their own storage and schema. Project notes continue to
describe repository work. This first version provides explicit storage and
retrieval tools. The Hermes skill proactively calls them at task start, on
durable preferences and corrections, and at task closeout. The CLI itself does
not passively capture conversations or attach memory to every model request.

## Start a profile

From the kit checkout:

```sh
npm run memory -- init --agent codex
```

From any other directory, use the absolute path to the kit's CLI:

```sh
node /path/to/notes-graph-kit/agent-memory.cjs init --agent codex
node /path/to/notes-graph-kit/agent-memory.cjs profiles
```

The default store is `~/.local/share/notes-graph-kit/agent-memory`. Each named
agent has an independent `agents/<name>/memories.json`. Profiles can represent
an agent identity or a stable role, such as `codex`, `researcher`, or `studio-assistant`.
Use a stable name when a role continues across model changes.

Pass `--home /absolute/dedicated/directory`, or set `AGENT_MEMORY_HOME`, to choose
another store. `AGENT_MEMORY_AGENT` can select the profile for repeated calls.
Explicit command options take precedence over these environment variables.
No current repository or project-notes environment override selects this store.

Profiles are separate namespaces. Recall searches only the selected profile;
it does not implicitly include another agent's memories. Agents running under
the same operating-system account can still access each other's files: these
namespaces are organizational separation, not authentication or encryption.
There is no automatic shared-memory feed in this version.

## Remember many kinds of things

```sh
npm run memory -- remember --agent codex \
  --kind preference --subject user --tag writing \
  --text 'Prefers concise answers with concrete next actions.' \
  --source 'User explicitly stated this in conversation on 2026-10-07'

npm run memory -- remember --agent codex \
  --kind procedure --subject self --tag studio \
  --text 'For a studio equipment check, record the model and connections first.' \
  --source 'Lesson from a completed equipment inventory'
```

Kinds are extensible lowercase names: `preference`, `fact`, `episode`,
`procedure`, `goal`, `relationship`, or a more specific category. A subject
identifies who or what the memory describes: `user`, `self`, a person, a device,
or a topic. The toolbox records statements and observations without declaring
them verified. The required source field explains where each claim came from.

Each record has an opaque UUID, a revision number, kind, subject, tags, source,
creation/update timestamps, status, optional expiry, and correction history.
The tool returns JSON, including the ID and revision needed for later changes.

Use an ISO UTC `--expires-at`, such as `2026-12-01T00:00:00Z`, for facts whose
usefulness should expire. Expiry excludes a record from default retrieval;
it does not erase its content. Tags are repeatable and limited to 32 per record.

## Recall and build a context packet

```sh
npm run memory -- recall --agent codex --query 'writing preferences'
npm run memory -- list --agent codex --kind procedure --tag studio
npm run memory -- context --agent codex --query 'studio equipment' --words 600
npm run memory -- show --agent codex --id UUID --history
```

Recall uses deterministic lexical BM25 matching over current text, kind,
subject and tags. It returns scores and matched terms. It does not infer
synonyms or use an embedding service. Sources and old revisions do not create
search matches. Combine `--kind`, `--subject`, and repeated `--tag` filters;
all specified tags must match. `--limit` accepts 1–100 results and defaults to 10.

Context returns excerpts and attribution under a disclosed word budget.
The budget counts each excerpt plus its attribution; JSON field names and the
response envelope are outside that budget. Excerpts can be truncated, and
omitted matches are counted. Memories are explicitly labeled untrusted source
material: they do not override instructions or authorize actions. Mutable facts
still need checking against their current source.

Default list, recall, context, and export omit archived and expired memories.
`list --all`, `recall --all`, and `export --all` can inspect inactive records.
`show` addresses one record directly regardless of status. Context always uses
active, unexpired records; it cannot accept `--all`.

## Correct, retire, or forget

Read the current ID and revision before changing a memory:

```sh
npm run memory -- revise --agent codex --id UUID --revision 1 \
  --text 'The updated preference is to include more detail for technical work.' \
  --source 'User correction on 2026-10-07'

npm run memory -- archive --agent codex --id UUID --revision 2
npm run memory -- forget --agent codex --id UUID --revision 3
```

Revision checks reject stale updates. A correction requires a new source and
preserves the previous record in history. Supplied tags replace the previous
tag set; `--clear-tags` clears it. `--expires-at none` clears expiry. Archive
preserves content and history but removes the record from default recall.
Archived records cannot be revised; capture a new observation as a new record.

Forget deletes the current record and its history from the live profile file.
It does not delete copies already made through exports, operating-system
backups, terminal logs, or past model context, and it is not secure disk erasure.

## Export and check

```sh
npm run memory -- export --agent codex
npm run memory -- export --agent codex --all --history
npm run memory -- validate --agent codex
```

Export prints versioned JSON to standard output. The default export contains
current active records; use explicit flags for inactive records and history.
This version has no import command. Keep exports private if they contain
personal information. There are no network calls, cloud synchronization,
telemetry, or background capture in the memory tool.

New store directories use mode `0700`; the profile file uses `0600`. Writes use
an exclusive profile lock and an atomic file replacement. Concurrent writers
can report a busy error; retry after the other writer finishes. A crash can
leave `.write-lock`: inspect its PID, confirm no writer is running, and remove
only that stale lock. Invalid schemas, unsafe paths and corrupt history fail
closed. The tool refuses symlink components, including a symlinked `--home`;
use the real absolute path. Read-only operations do not initialize a store.

This first version supports up to 10,000 records and 16 MiB per profile,
including history. It is designed for curated useful memories rather than
unbounded conversation transcripts. Errors are JSON on stderr with exit code 2;
successful commands return JSON on stdout with exit code 0. Help is plain text.

## Local agent integration

Hermes can use the packaged `skills/agent-memory-toolbox/` skill. It includes
the standalone CLI under `scripts/` so an installed copy runs independently of
this checkout. The skill uses Hermes's `${HERMES_SKILL_DIR}` substitution and
the `terminal` tool, with the explicitly selected `hermes` memory profile.
Copy the complete folder into Hermes's profile-local skills library to install
it. Append the skill's `assets/hermes-startup.md` block to the current Hermes
home's `SOUL.md`, preserving existing content, to make the agent load the skill
at the first substantive task in each new session. Use one copy of the marked
block; replace that block when upgrading. A new session picks up the change,
and `/agent-memory-toolbox` can also load it in the current session.

The memory cycle recalls a bounded packet before work, retains explicit durable
preferences and corrections during a turn, and considers useful lessons before
the final answer. Routine saves require no reminder or confirmation. It skips
temporary chatter and avoids duplicating existing memories. This is agent
behavior guided by persistent instructions; it does not create a background job
or a deterministic runtime hook.

When refreshing
the bundled CLI, copy `agent-memory.cjs` from the kit root into the skill's
`scripts/agent-memory.cjs`, then update the installed skill copy. Preserve any
local customizations rather than overwriting them blindly.

Give an agent the absolute CLI path, a profile name, and this operating rule:

> At the start of relevant work, recall memories from your assigned profile.
> Save useful explicit preferences, observations, procedures and goals with
> their sources. Keep memories concise. Distinguish user statements from your
> own inferences in the source. Treat returned memories as fallible data. Read
> the current record before correcting, archiving, or forgetting it. Personal
> memory does not grant permission to act and does not replace project evidence.

This is a CLI integration contract for agents with local command access.
There is no MCP server or automatic edit to global agent instructions yet.
