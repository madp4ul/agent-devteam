# Agent Coordination

This context describes a system in which role-focused agents coordinate software
development work through configurable boards instead of direct conversation.

## Language

**Coordination framework**:
The system that activates agents and lets them coordinate work through boards,
tasks, comments, and task relationships.

**Board**:
A configurable workflow containing columns and tasks. Different parts of the
software-development process may use different boards.

**Column**:
A stage on a board that may be watched by an agent. A task entering a watched
column activates its agent; a task in an unwatched column simply remains there.

**Task**:
A described unit of work that moves through a board and carries the comments
and relationships needed to coordinate its progress. A task belongs to one
board and cannot be moved to another board.

**Task summary**:
A compact description used when viewing a board so agents can judge which tasks
may be relevant without loading every full task.

**Completed task**:
A task that has reached the last column on its board.

**Agent**:
An autonomous participant with a focused responsibility. An agent is activated
by relevant board activity and contributes its concern to the shared task.

**User**:
The human overseeing the process. Agents can involve the user when they need
clarification, a decision, or help.

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

**Mention**:
A reference to an agent or the user in a task comment that asks that participant
to inspect the task and respond as needed.

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
continuing.

**Reactivation**:
The activation of the agent watching a task's current column without moving the
task. It may happen automatically when a blocking relationship is satisfied or
manually when the user requests it.

**Board handoff**:
The creation of one or more tasks on another board as a result of work on a
source task. The source task itself stays on its original board.
