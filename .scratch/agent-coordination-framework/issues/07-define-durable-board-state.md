# Define Durable Board State and Recovery

Type: wayfinder:grilling
Status: resolved
Blocked by: 05, 06
Parent: ../map.md

## Question

Which parts of boards, tasks, comments, relationships, activations, and agent
runs must be stored in the shared local board state, and what consistency and
recovery behavior must users be able to rely on?

## Answer

### Durable state

Use a framework-owned local relational store with two complementary forms of
record:

- current-state records optimized for reading and changing the live board; and
- immutable authored and framework records that preserve communication and
  explain how the current state was reached.

The current-state records are authoritative. The activity history is an audit
and explanation ledger, not an event-sourced reconstruction mechanism.

Persist all shared coordination facts: applied board and column identities;
tasks and their content, column, revision, archive state, attachments, comments,
relationships, and attention reasons; task activity; activations and their
strict order, reason, and source pointer; run attempts, outcomes, timing,
diagnostics, retry schedule, and Codex thread ID; attempt context; task
automation suspension; and internal idempotency and scheduling records needed
for safe recovery. Authored process-definition files, Git task workspaces, and
complete Codex transcripts remain outside this store. How a changed process
definition becomes the applied definition is delegated to **Define Process
Definition Evolution and Reloading**.

Each attempt's thread ID belongs to that attempt and its run-start activity
record because a later attempt may resume the same thread or replace it. The
task page may offer **Open in Codex** only when the installed Codex version
provides a documented, supported navigation capability. Otherwise it retains
and exposes the ID without constructing undocumented links or inspecting Codex
internals. Codex remains the owner of thread history and may make an old thread
unavailable independently of the board record.

### Consistency

One transaction applies every logical board command: it changes current state,
appends its activity, and creates any resulting activation together. Database
constraints enforce invariants such as one active run per task and strict
activation order.

Mutable task commands use optimistic revisions. A stale move or edit fails and
returns current state instead of silently overwriting concurrent user or agent
work. Naturally additive commands such as distinct comments can succeed
independently. Retriable tool and transport calls carry idempotency keys so they
cannot duplicate comments, moves, relationships, or activations.

The agent board-query contract is the bounded, explicit-column contract recorded
in **Define Board and Task Interactions**. The shared state provides its column
counts, task-overview pages, filters, and cursors without loading historical
tasks into every run.

### Ordinary crash recovery

Committed board state and queued activations survive process and machine
restarts. At startup, an attempt left active without a live executor is recorded
as a technical failure caused by interruption and follows the existing automatic
retry policy. It is not a **User interruption**. The current activation remains
at the head and every later activation keeps its order.

Delivery is at least once, not exactly once. Atomic board commands prevent
half-applied board state, but an interrupted attempt may already have changed its
task workspace or another external resource. A retry reuses the existing task
workspace. It resumes the activation's Codex thread when possible and starts a
fresh thread otherwise; losing the thread never causes the framework to discard
workspace changes.

Every attempt receives separate **Attempt context** describing its sequence
number, preceding outcome, whether it follows an interruption or failure, and
whether its Codex thread was resumed or replaced. This supplements rather than
changes the activation's immutable reason. The framework supplies these facts;
process instructions may add domain-specific recovery behavior without being
required to repeat the framework's rare-case bookkeeping.

### User interruption and continuation

The user may deliberately interrupt an active run. The framework requests
cancellation and reports **Interrupting** until execution actually stops; an
in-flight operation may not stop instantly. The attempt then ends as **User
interrupted**, not failed. It consumes no technical retry attempt, triggers no
automatic retry, preserves the activation at the head, and creates **Task
automation suspension** so later activations cannot start.

The user may edit the idle task and then explicitly **Continue**. A continuation
message is optional. Continuing creates another attempt for the same activation,
retains the original activation reason and workspace, adds the interruption and
optional message to the attempt context, and resumes the previous Codex thread
when possible with a fresh-thread fallback. Without a user message, the
framework tells the agent that the preceding attempt was interrupted and asks
it to reassess current task and workspace state before proceeding. Detailed
presentation and controls are delegated to **Define Automation Observability and
Recovery**.

### Storage failure and retention

Ordinary crashes recover automatically. Startup validates durable storage and
finishes schema migration before dispatching agents. If storage is unavailable,
inconsistent, or cannot be migrated, the framework fails closed: it performs no
agent dispatch and no board mutation, never starts with an empty replacement,
and never pretends the activity ledger can rebuild authoritative state.

The first version creates a verified backup before schema migration, preserves
damaged data, and provides a documented manual backup-and-restore procedure. It
does not need rotating snapshots, automatic corruption repair, or a dedicated
recovery UI.

Tasks and their complete coordination history have no automatic age-based
retention limit. The first version provides no permanent task deletion. An idle
task may instead be archived, including immediately after mistaken creation;
tasks with active or queued work, a failed activation awaiting recovery, or
suspended automation cannot be archived. Completion remains reaching the final
column, rejection remains a process-specific unwatched column, and neither
implicitly archives the task. Completed tasks remain visible until the user
archives them individually or in bulk. Archiving preserves the task, its column,
and its history while removing it from normal board views and agent listings.
