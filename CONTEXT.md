# Agent Coordination

This context describes a system in which role-focused agents coordinate software
development work through configurable boards instead of direct conversation.

## Language

**Coordination framework**:
The system that activates agents and lets them coordinate work through boards,
tasks, comments, and task relationships.

**Agent runtime**:
The existing coding-agent system that provides models, sessions, context, and
development tools. The coordination framework uses this runtime rather than
reimplementing it.

**Board**:
A configurable workflow containing columns and tasks. Different parts of the
software-development process may use different boards.

**Board state**:
The shared current state of boards, tasks, comments, relationships, and
activations. It is stored outside agent project workspaces so every run sees
the same state.

**Project repository**:
The local Git repository whose work is coordinated by a process.

**Task workspace**:
An isolated Git working tree provisioned by the coordination framework for one
task and reused by all of its agent runs until archival. The process, not the
framework or agent runtime, controls branches, ancestry, commits, and merge
targets.
_Avoid_: Agent workspace, project workspace

**Task workspace starting ref**:
A process-defined Git reference that the coordination framework resolves when
provisioning a task workspace. The workspace starts detached at that commit so
the referenced branch remains available to other working trees.

**Column**:
A stage on a board that may be watched by an agent. A task entering a watched
column activates its agent; a task in an unwatched column simply remains there.
Moving a task to another watched column transfers primary responsibility to
that column's agent. Every entry creates an activation, including creation in a
watched column, re-entry into a column, and entry into a column watched by the
currently active agent. Processes are responsible for avoiding unintended
self-handoff loops.

**Task**:
A described unit of work that moves through a board and carries the comments
and relationships needed to coordinate its progress. A task is on one board at
a time.

**Task ID**:
A generated identifier used to refer to a task from comments and external
resources.

**Task overview**:
A compact read projection of a task's title, column, blocking state,
relationships, and run state. Board views and agent tools use it to provide
orientation without loading the task's full content.

**Task activity history**:
The chronological record of immutable framework events that affect a task,
including movements, relationship changes, activations, and run outcomes.
Comments are authored communication rather than framework events, even if an
interface later presents both in one timeline.

**Completed task**:
A task that has reached the last column on its board.

**Archived task**:
A task retained with its complete coordination history but omitted from normal
board views and agent task listings. Archiving is independent of the task's
workflow column and is not deletion or completion.

**Agent**:
An autonomous participant with a focused responsibility. An agent is activated
by relevant board activity and contributes its concern to the shared task.

**Agent run**:
One active execution of an agent for a task. Several runs of the same agent may
work on different tasks concurrently, but a task has at most one active run.
Each run handles one activation so it can focus on that activation's distinct
expectation. Moving the task during a run does not end that run; any activation
caused by the move waits in the task's activation order until the current run
finishes. Successful completion has no implicit workflow effect: the task stays
where the agent left it, and the next queued activation may begin. A failed run
pauses activation processing for that task and preserves all later activations
in their existing order until the failure is explicitly resolved.

**Activation**:
A request for an agent to inspect and act on a task because a relevant event
occurred. Activations for a task are handled individually in strict
chronological order; an activation waits while that task already has an active
run. The coordination framework does not reprioritize, cancel, or supersede
queued activations when later events change the task. The addressed agent
receives the current task state and decides whether the original request still
requires action. Its target agent is fixed when the activation is created and
is not re-resolved when the run begins.

**Activation reason**:
The typed cause of an activation together with an immutable pointer to the
exact source event, supplied to the agent run alongside the task's current
state. The coordination framework preserves this provenance without generating
its own interpretation of the expected work.

**Attempt context**:
Framework-supplied facts about a run attempt, including its sequence number,
whether it follows an interruption or failure, the preceding outcome, whether
its Codex thread was resumed or replaced, and any continuation message from the
user. It does not change the activation reason. When an interrupted activation
is continued without a user message, it tells the agent to reassess the current
task and workspace state before proceeding.

**User interruption**:
The deliberate termination of an active run attempt by the user. It preserves
the activation for later continuation, suspends further automation for the
task, and does not count as a technical failure or automatic retry attempt.

**Task automation suspension**:
A user-controlled hold that prevents a task's preserved activation order from
advancing. Interrupting an active run creates this hold; only an explicit user
action continues the interrupted activation.

**Activation retry**:
A new run attempt for a failed activation. It retains the activation's original
reason and source location while reading the task's current state, including
comments added since the failure. Retrying does not create a new activation.
Only technical failures reported by the agent runtime are eligible for automatic
retry; the coordination framework does not interpret a normally completed run
to judge whether its process outcome was adequate. Each activation receives one
framework-wide retry policy of three total automatic attempts with capped
exponential backoff. This operational policy is not process-configurable. Each
explicit user retry begins a fresh cycle of up to three attempts for the same
activation.

**Activation dismissal**:
An explicit user decision to abandon a failed activation. Dismissal records that
its expectation was not fulfilled and allows the task's preserved activation
order to continue.

**User**:
The human overseeing the process. Agents can involve the user when they need
clarification, a decision, or help.

**Needs attention**:
A task condition requiring explicit user action because the user was mentioned
or an agent run failed and awaits recovery. Being in an unwatched column alone
does not create this condition.

**Role**:
The configurable responsibility given to an agent within a process.

**Agent instructions**:
The full guidance an agent receives for carrying out its own role.

**Agent summary**:
A short description of an agent's responsibility that helps other agents know
when to involve it.

**Agent directory**:
The names and summaries of the agents available to collaborate in a process.

**Process**:
The shared rules for how agents coordinate across all boards. It describes the
preferred routes through boards and columns while allowing justified
deviations.

**Process definition**:
The version-controlled project files that define boards, columns, agents,
roles, instructions, and coordination rules. They exclude live board state.

**Mention**:
A reference to an agent or the user in a task comment that asks that participant
to inspect the task and respond as needed. A mention requests assistance without
transferring primary responsibility, so the mention itself does not move the
task. During the resulting run, the mentioned agent may change the task,
including moving it, when the process calls for that action. The coordination
framework does not enforce role-specific restrictions on those capabilities.
A comment creates at most one activation for each agent it mentions; when it
mentions several agents, their activations enter the task's order by textual
mention order. Mentioning the user creates a notification rather than an agent
activation. An agent mention creates an activation regardless of whether the
task's current column is watched, unwatched, or final.

**Attention reason**:
A typed cause of a task needing user attention, currently a user mention or a
failed agent run. Each reason is resolved independently through an explicit
action appropriate to its cause.

**Parent task**:
A task whose work has been divided into smaller child tasks.

**Child task**:
A smaller task created from a parent task so its work can fit within an agent's
available context.

**Dependency**:
A typed relationship showing that one task needs the outcome of another task
before it can continue. The relationship is satisfied when the task being
depended on reaches the last column on its board.

**Blocking relationship**:
A task relationship whose unresolved condition prevents a task from
continuing. Satisfying one blocking relationship is recorded in the task
activity history but does not activate the task while another blocking
relationship remains unresolved.

**Reactivation**:
The activation of the agent watching a task's current column without moving the
task. It happens automatically when the task transitions from blocked to fully
unblocked, or manually when the user requests it. Manual reactivation creates a
fresh activation for an idle task; it is distinct from retrying a failed
activation. It is available only when the task is in a watched column, has no
active or queued activation, and is not paused on a failed activation.

**Board handoff**:
A transition in which work on one board leads to work on another, normally by
creating one or more new tasks while the source task stays in place.
