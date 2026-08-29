# Architecture overview

The Agent Coordination Framework is a local application that coordinates
role-focused coding agents through configurable boards. A user defines the
workflow in a Git repository, supervises it in a browser, and retains all task,
agent-run, and workspace state on the same machine.

This document is a map of the implemented system, not an inventory of source
files or a complete behavioral reference. Use [CONTEXT.md](../CONTEXT.md) for
domain language, the [ADRs](adr/) for decision history, and the focused guides
linked below for detailed contracts and operations.

## Architecture at a glance

```mermaid
graph LR
    User["User"] --> Browser["Browser adapter"]
    Browser -->|localhost HTTP| Host["Host application"]
    Process["Process definition"] --> Host
    Host --> Core["Coordination core"]
    Core -->|reads and writes| State["Coordination database"]
    Core --> Automation["Automation"]
    Automation --> Workspaces["Git task workspaces"]
    Automation --> Codex["Codex agent runs"]
    Codex -->|project tools| MCP["Scoped MCP adapter"]
    MCP --> Host
```

The framework is one host-native Node application served on localhost. The
browser interface and agent-facing MCP tools are adapters around the same
coordination core. The core owns all workflow rules and authoritative changes;
neither adapter writes state independently.

Codex remains the agent runtime. The framework supplies task and process
context, an isolated Git workspace, and scoped coordination tools, but it does
not reimplement models, sessions, authentication, or general coding tools.

## Major parts

### Host and user interface

The host is the composition and lifecycle boundary. It resolves project state,
loads the process definition, starts the coordination core, serves the React
browser application, and exposes local HTTP endpoints.

The browser is a presentation adapter. It provides boards, task details,
history, transcripts, automation controls, and accessible task movement. The
browser and host share the request and response contracts for that local
transport, while the host maps decoding and status codes. Neither side owns
workflow or automation policy.

The local HTTP adapter remains framework-free and keeps browser and
project-scoped agent authorization/capability boundaries explicit. Project-owned
routing uses a shared typed literal/named-segment dispatcher beneath separate
browser and authenticated agent route-set composition; request/response codecs
remain transport mechanics, and routes receive only their coherent capability
subset. This organization does not introduce middleware or another application
authority. [ADR 0016](adr/0016-keep-the-local-http-adapter-framework-free-until-platform-needs-emerge.md)
defines the observable product and maintenance conditions that justify
reconsidering a focused router or full web framework, plus the proof required
before adoption.

### Coordination core

`CoordinationApplication` is the shared command-and-query boundary for every
user and agent interaction. It applies task, relationship, activation,
attention, archival, and process-evolution rules, and exposes projections for
inspection.

Complete user-facing board and task-detail read projections are assembled
inside this boundary before the web adapter serializes them. The adapter does
not reconstruct those authoritative views by coordinating lower-level queries.

Each command workflow owns its SQLite transaction and records the state change,
activity provenance, projection updates, notifications, and idempotent response
that apply to that workflow together. Focused internal modules participate on
the same database connection; they do not open independent transactions or
become additional state owners. This is the central architectural choice: the
UI and agents collaborate through one authoritative model rather than through
separate state that must later be reconciled.

### Durable state

SQLite stores the live coordination model: boards, tasks, comments,
relationships, activity, activations, agent conversations, conversation
attachment metadata, attempts, attention,
notifications, and automation state. User-facing projections aggregate those
facts without becoming another source of truth or duplicating attempt-owned run
evidence. Conversations retain their task, owner, activation, thread, and
activity lineage across retries and replacement threads. Each current
task-and-agent conversation also retains authoritative delivery progress for
task descriptions, comments, and activity so later activations receive new
task context once across restart. Continuation is one
authoritative command, and archival preserves the lineage, its final aggregated
cost snapshot, and the cumulative thread checkpoints needed for later cost
continuation while removing detailed transcript, authored-message, and replay
content.
Settled current conversations can be retired atomically with an attributable
reason. Retired lineages remain durable and explicitly continuable, while the
next ordinary activation creates the pair's replacement and receives that
reason once with its complete initial task composition.

Conversation attachment bytes live beside SQLite in a framework-owned content
store under the same bound project state root. Pending uploads are temporary;
submission binds their metadata to one authored message in the continuation
transaction. The immutable originals survive restart and conversation
retirement, while task archival removes both authored messages and their
content. Startup clears abandoned uploads and disposable runtime projections.

The database is outside the project checkout and is kept with the task
workspaces in one bound project state root. Startup validates that retained
state rather than silently replacing or adopting inconsistent data.

### Automation and agent runtime

Automation turns committed activation records into agent runs. It preserves the
order of activations for each task, prevents overlapping runs on one task, and
allows independent tasks to run concurrently. Automation always starts paused
and proceeds only after the user resumes it.

For each run, the Codex adapter starts or resumes a thread in the task's Git
workspace. A per-attempt MCP adapter lets that agent inspect relevant project
coordination state and mutate only its current task. Every activation belongs to
a durable task-scoped agent conversation. Ordinary activation reasons select
the current conversation for the stable task-and-agent pair, while explicit
user follow-ups select their addressed conversation, including a retired one.
Retirement removes only automatic selection; the next ordinary activation
creates the replacement current conversation. Activations and retries
remain distinct inside that lineage, and each attempt's messages and tool
activity remain separately attributable run evidence. A first activation gets
the complete current task composition; each later distinct activation gets a
fresh authoritative bootstrap plus task context not previously delivered to
that conversation. Incremental delivery omits an owning agent's comment only
when immutable attempt, conversation, and thread provenance proves the resumed
Codex thread already retains it; missing provenance, another conversation, and
thread replacement preserve or restore the comment. The attempt-scoped MCP
adapter can recover the complete current operating context without accepting
task or agent scope from the model.
When the runtime must replace a thread, it records that loss of continuity and
adopts the replacement as the conversation's next resume target.
Codex `turn.completed` usage is a cumulative thread snapshot that includes every
metered model call. Automation retains that raw snapshot, but prices a resumed
attempt only after subtracting the preceding trustworthy snapshot on the same
thread so attempt evidence remains attributable. It also snapshots the price
used when an attempt settles. For a conversation total, the newest monotonic
cumulative snapshot is the authoritative checkpoint for each thread whose
snapshotted price stayed stable; replacement threads contribute separate
checkpoints. At price boundaries or when a checkpoint is not trustworthy, the
projection falls back to the isolated attempt costs. This preserves historical
rates, pending evidence, and known-cost lower bounds without repeatedly adding
cumulative snapshots.
After a completed Codex turn, the runtime also reads the newest matching
`token_count` record from that thread's local Codex rollout. It adapts Codex's
latest active-context tokens, model context window, and percentage calculation
into optional attempt evidence. The conversation projection exposes only the
newest measurement for its current thread; the browser does not infer context
fill from cumulative cost counters. Missing or changed rollout evidence removes
the optional meter without affecting the run outcome.

Before an attachment-bearing run starts, automation projects that
conversation's surviving originals into an attempt-scoped directory outside
the Git workspace. The prompt identifies all scoped files, current supported
images are also sent as native Codex image input, and the Codex sandbox receives
read/write access only to that projection. The projection is removed when the
attempt settles; no client filename selects a framework path.

### Git task workspaces

Each task receives one isolated Git worktree, initially detached at the
process-defined starting reference and reused across all of that task's runs.
The framework provisions and verifies the workspace; the process and its agents
decide how branches, commits, and handoffs are managed.

Workspace identity spans the coordination database, filesystem directory, and
Git worktree registration. These are validated together because disagreement
between them can make an agent operate on the wrong work.

Host-side archival first matches the database workspace path to the task's
framework-owned location and its primary-repository worktree registration.
Only then do Git commands executed inside that worktree receive its exact path
as process-local `safe.directory` configuration. The trust applies to that Git
subprocess only; the host never broadens it to the workspace root or writes
global or repository Git configuration.

Archival keeps workspace inspection separate from removal. Dirty state and a
non-durable commit remain user-correctable safety outcomes; invalid
registration, rejected ownership trust, a worktree lock, unexpected inspection
failure, and actual removal failure remain distinct host outcomes. The task is
marked archived only after Git reports successful worktree removal.

## State ownership

| State | Owner | Location |
| --- | --- | --- |
| Workflow structure and agent instructions | User and project | Version-controlled process files in the project repository |
| Boards, tasks, activity, activations, run history, notification policy, and eligible notification occurrences | Coordination framework | SQLite in the bound project state root |
| Conversation attachment originals | Coordination framework | Framework-owned content store in the bound project state root |
| Task implementation work | Process and agents | One Git worktree per task in the same state root |
| Appearance, notification consent, and operating-system permission | Browser and operating system | Browser-local storage and browser permission state |

The project repository is bound to its state root through repository-local Git
configuration. The database, attachment content store, and task worktrees form one recovery and relocation
unit; live coordination state is not stored in the primary checkout or inside
an agent's task workspace.

## End-to-end flow

1. A user or agent submits a command through its adapter.
2. The coordination core validates the command and commits the state change,
   immutable activity, and any resulting activation atomically.
   For a follow-up, streamed pending uploads are bound to its authored message
   in that same command; an attachment-only message is valid.
3. When automation is running, it claims the next eligible activation for a
   task and prepares or verifies that task's Git workspace.
4. Codex receives the activation reason plus current structural and workspace
   context. A conversation's first activation receives the complete task and
   operating composition; a later activation receives its authoritative
   bootstrap and only newly delivered task text and activity. Retries retain
   their activation's composed context and separate attempt facts. Surviving
   attachments from that conversation are projected into the run's scoped
   file directory, with current supported images also supplied as native image
   input.
5. The agent works in the task workspace and coordinates through its scoped MCP
   tools. Tool commands return to the same coordination core used by the user.
6. The framework records the attempt outcome and transcript. A successful run
   does not move the task implicitly; workflow changes require an explicit
   command from the user or agent.

Notification delivery follows the same authority boundary: a task command or
actionable run failure evaluates the durable process policy while recording the
event and persists an eligible occurrence. Open browser clients poll forward
from a cursor, advance past every observation whether or not local delivery is
available, and make one best-effort operating-system delivery attempt. Opening
or reloading a client starts at the current cursor, so missed or silenced
occurrences are never replayed. Settings mutates policy through
`CoordinationApplication`; browser permission and Appearance never enter the
coordination database.

## Architectural principles

- **One authority:** all coordination commands and queries pass through the
  application boundary; UI, MCP, and runtime adapters do not write SQLite
  directly.
- **Transaction locality:** the workflow making an authoritative decision owns
  its SQLite transaction; shared internal mechanics participate in that
  transaction without becoming another authority.
- **Durable provenance:** stable process identities, activation reasons,
  activity, and attempt history are retained rather than inferred later.
- **Explicit workflow:** agent completion does not imply board movement, and
  process changes are not silently applied to stale work.
- **Isolated work:** each task has its own verified Git workspace, while shared
  coordination state remains outside every workspace.
- **User-controlled execution:** startup is paused, interruption and permission
  blocks are visible, and recovery requires an explicit supported action.
- **Fail closed:** inconsistent binding, storage, process, or workspace state
  produces an inspectable configuration error instead of automatic repair.
- **Adapter discipline:** React owns presentation, Codex owns agent execution,
  and MCP owns tool transport; domain and automation rules stay in the core.

## Further detail

- [Process-definition reference](process-definition-reference.md) documents the
  YAML authoring and validation contract.
- [Agent MCP tool reference](agent-mcp-reference.md) documents the agent-facing
  tools and response shapes.
- [Project-state backup and restore](project-state-backup-and-restore.md)
  documents the recovery unit and operating procedure.
- [Development setup](development-setup.md) documents the source toolchain and
  local startup procedure.
- [ADR 0016](adr/0016-keep-the-local-http-adapter-framework-free-until-platform-needs-emerge.md)
  records the local HTTP routing decision and its framework-reconsideration
  boundary.
- [Architecture decisions](adr/) explain why the product owns its board, runs
  host-native, uses React and Vite, binds state beside the project, and relocates
  state through an offline command.

## Keeping this overview current

Update this document when a major component, authoritative boundary, state
owner, or end-to-end flow changes. Keep source-level structure in the code,
external contracts in their reference documents, operating instructions in
their guides, and the reasoning for durable choices in ADRs. A feature that fits
the architecture above does not need to be added here merely because it exists.
