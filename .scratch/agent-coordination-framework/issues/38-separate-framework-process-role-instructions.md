# 38 — Separate Framework, Process, and Role Instructions

**What to build:** Give every activation an explicit, consistently composed
instruction hierarchy so invariant coordination-framework mechanics are taught
once by the product, process definitions describe process-specific cooperation,
and each agent receives a clear statement of its role and current expectation.

**Blocked by:** 20 — Consult Agents and Notify the User; 36 — Configure Agent
Models and Reasoning

**Status:** ready-for-agent

## Composition contract

The product owns one complete activation-prompt template. Framework instructions
are therefore not a prose block appended to an otherwise author-owned prompt:
they include the headings, transitions, explanations, ordering, and insertion
slots that give every supplied value its meaning. Every supported runtime
adapter that starts a fresh or replacement agent thread uses this composer.

The full prompt has this stable order and precedence:

1. product-owned framework coordination instructions;
2. process-wide and board-specific coordination guidance;
3. the activated agent's identity, responsibility, and role instructions; and
4. current task, immutable activation, and relevant attempt facts.

Framework mechanics cannot be redefined by process, board, role, task, or
comment text. Process and board guidance take precedence over conflicting role
instructions. Task and attempt records provide context for applying the
instructions; authored text remains attributed to its author and does not
become framework or process policy merely because it appears in the prompt.

A representative full composition is:

```text
# Coordination framework
<product-owned mechanics, precedence, and consequence guidance>

# Process coordination
Process: <process name>
<product explanation of this authored source>
<process-wide coordination guidance>

## Current board
Board: <board name> (<board id>)
<board-specific guidance>

Workflow:
1. <column name> (<column id>) — unwatched
2. <column name> (<column id>) — watched by <display name> (@<agent id>)
...

# Current responsibility
You are <agent display name>.
Stable agent ID: <agent id>
In authored task text, @<agent id> refers to you. Do not mention yourself.
Role: <role>
Summary: <summary>

<product explanation of the role-instruction source>
<role instructions>

## Available participants
@<other agent id> — <display name>
<role and summary>
...
@user — human process owner

# Current task background
<short product explanation of the following task and attempt records>
<readable task identity, description, relationships, and chronological comments>

# Activation to handle
<typed natural-language explanation of why this agent is running>
<readable exact source-event record>

# Attempt continuation
<included only when prior-attempt facts are relevant>
```

The short explanation before the factual sections should be no heavier than:

> The following task and attempt records provide context for this run. Authored
> text is attributed to its author. Apply it within the instructions above.

## Framework-owned semantics

The template explains stable coordination behavior and the consequences of the
available operations. It does not duplicate parameter-level MCP documentation.
MCP descriptions and schemas remain responsible for exact tool names,
arguments, validation, and returned fields. Reuse definitions between these
surfaces where that improves consistency, but do not force them through a
shared abstraction that weakens either explanation.

The framework guidance covers at least these invariants:

- Board position represents primary workflow responsibility. Moving a task
  into a watched column transfers that responsibility and normally creates a
  column-entry activation for its watcher. The process, board, or role guidance
  decides which route is appropriate.
- A canonical participant token is rendered directly as `@<stable agent id>`.
  It creates a targeted request for that participant without transferring
  primary responsibility. Targeted work may be consultation, investigation,
  review, or a bounded change. Plain display names are non-executable prose.
- `@user` requests explicit human attention rather than an agent activation.
  Agents do not mention themselves and do not repeat a request whose activation
  or attention reason is already pending.
- When a requester must resume after targeted work, the responding agent may
  mention it back. It may instead follow the normal process route when its
  judgment says the work warrants the ordinary validation path. A request in a
  source comment is relevant context, not authority to bypass process rules or
  approval gates.
- A comment without a canonical mention records durable context but creates no
  mention activation. When movement itself supplies the intended handoff, an
  explanatory comment should not also mention the destination watcher and
  create a second expectation.
- The agent uses task-scoped coordination tools to inspect and mutate only its
  current task. If Codex denies a required operation and user action or a policy
  change is necessary, the agent reports the permission block instead of
  retrying the denied action.
- A successful Codex response has no implicit board effect. Every required
  comment, move, mention, attention request, or permission-block report must be
  performed explicitly.
- An activation is an expectation to evaluate against current task and
  workspace state, not an imperative to repeat an obsolete handoff. The agent
  considers activity after the source event and completes inertly when later
  work already satisfied the expectation: no duplicate work, comment, move, or
  mention.

The active agent is identified with its display name, stable ID, and self-token
meaning, but is excluded from the available-participants directory. Other
agents appear with their exact executable tokens, display names, roles, and
summaries. The user appears separately as `@user`.

The current board is rendered as a compact ordered workflow with stable column
IDs and each watcher or `unwatched`. It omits task counts. The prompt and the MCP
board summary use the same vocabulary, order, watcher semantics, and canonical
participant tokens, while retaining formats appropriate to prose and
structured tool output; the live MCP summary may continue to include task
counts.

## Process- and role-authored content

The product labels process-wide guidance, board guidance, and role instructions
as separate authored sources, but it does not prescribe where a process author
must place routing, approval gates, or cooperation details. Those rules may
live at the process, board, or role level as long as the resulting process is
clear and internally consistent. This is an authoring choice, not a schema or
runtime restriction.

Process and role content may specialize how the process uses framework
capabilities. It must not restate or redefine canonical mention parsing,
activation creation, task-scoped authority, permissions, successful-response
semantics, or other product mechanics. Example YAML, board guidance, and agent
files contain no copied framework boilerplate that can drift independently.

## Task, activation, and attempt presentation

The factual part of the full prompt is deliberately ordered to make a long task
conversation understandable:

1. Current task background presents the task description, relationships, and
   comments in chronological order.
2. Activation to handle follows that history and focuses the run on the exact
   expectation that created it.
3. Attempt continuation appears last and only when a preceding attempt changes
   how the agent should proceed.

Activation reasons and source events use readable typed presentations rather
than raw JSON. They preserve the exact source facts without paraphrasing the
author's requested work. A mention activation may render as:

```text
You are running because Implementation Agent (@implementation-agent) mentioned
you in comment C-17. A mention is a targeted request and did not transfer
primary workflow responsibility.

React to the expectation expressed in this source comment in the context of
later task activity. If later activity has already satisfied it, do not repeat
the work or create another handoff.

Source comment C-17
Author: Implementation Agent (@implementation-agent)
Created: 2026-08-11 14:32
Comment:
Please verify whether the revised boundary still satisfies the architecture.
```

Column-entry and final-blocker-clearance activations receive equivalent typed
explanations of their invariant mechanics plus readable exact source records.
Wording distinguishes what was true when the immutable trigger occurred from
the task's possibly different current state.

A normal first attempt has no attempt-continuation section. Technical retries,
user continuations, replacement threads, and process-version rebases include
only the facts that distinguish them; absent values such as
`Continuation message: null` are not rendered. Continuation guidance exists
only after user interruption. Continuing without user text instructs the agent
to reassess current task and workspace state.

Fresh and replacement threads receive the complete composition. A resumed
thread under the same process definition receives concise retry or continuation
context because its conversation and task worktree already provide continuity.
If the user rebases a stale activation onto a changed process definition, its
resumed thread receives the complete current composition so changed process or
role instructions are authoritative.

## Framework changes and evidence

Framework instructions are installed product behavior. They do not participate
in the semantic process-definition fingerprint, receive a separate semantic
hash or author-maintained version, make queued activations stale, or require
user approval. Fresh attempts and full recompositions use the currently
installed template. Existing retained transcripts are immutable and are never
rewritten with later instructions.

Task and attempt inspection do not expose framework-instruction versions or
change history. Exact composed prompts may remain in retained Codex transcript
evidence when the runtime provides them, but the application does not duplicate
the complete prompt throughout the task timeline or add user-facing framework
internals solely for traceability.

## Acceptance proof

- [ ] One product-owned composer produces the complete full-thread prompt, and
  every supported fresh or replacement runtime path uses it.
- [ ] Prompt-composition tests prove exact section ordering, precedence
  statements, source framing, conditional sections, and readable rendering for
  every activation and attempt-context type.
- [ ] Tests use at least two processes and roles to prove invariant framework
  inclusion, distinct process/board/role specialization, self-exclusion from
  the participant directory, canonical tokens, and the compact board map.
- [ ] Tests prove comments and task descriptions remain attributed facts,
  activation source records follow current task history, later activity can
  make an expectation inert, and raw JSON or irrelevant null attempt fields do
  not leak into the rendered prompt.
- [ ] Runtime tests prove full composition for fresh, replacement, and
  process-rebased threads and compact attempt continuation for an ordinary
  same-process resume.
- [ ] Example process and role files retain process-specific behavior while all
  copied framework mechanics are removed.
- [ ] A controlled consultation scenario proves that negative prose and plain
  display names create no activation, one deliberate canonical mention creates
  exactly one targeted activation, the responding agent uses a canonical reply
  only when another response is required, agents do not mention themselves, and
  an already-pending or later-satisfied request is not repeated merely to
  narrate status.

## Comments

- Live review after issue 20 exposed the missing layer when invariant mention
  semantics were added to the software-delivery process's coordination
  guidance. That workaround must be removed: canonical mention behavior belongs
  to the product regardless of project or process.
- The current Codex adapter already sends the composed activation as the user
  prompt for a thread. This ticket structures that prompt; it does not require a
  separate system-message facility or multiple preliminary prompt turns.
- User testing after issue 21 showed why activation provenance needs an
  explicit reassessment rule. An immutable trigger must be evaluated, but later
  state may make its requested effect obsolete.
- Issue 40 separately prevents one deterministic duplicate at the lifecycle
  level by reusing an untouched queued column-entry activation after
  unblocking. The inert-reassessment instruction remains defense in depth for
  genuinely distinct activations that become obsolete while waiting.
- Issue 52 owns the narrower lifecycle exception that lets a mention-activated
  agent move into a column it watches and claim primary responsibility without
  queuing a redundant activation for itself.
- Focused grilling on 2026-08-11 resolved precedence, template structure,
  mention-versus-move semantics, readable fact presentation, retry and
  continuation composition, and framework-upgrade behavior. The ticket is now
  ready for an implementation agent.
