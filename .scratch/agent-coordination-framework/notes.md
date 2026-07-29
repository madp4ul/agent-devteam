# Agent Coordination Framework — Initial Idea

## Problem

Working with coding agents currently requires frequent human involvement. The
user must coordinate the back-and-forth, review results, and protect software
quality. Giving all of those responsibilities to one agent is not trusted to
work well because that agent must keep too many concerns in mind.

## Core idea

Use several agents, each with a focused responsibility, and let them coordinate
through the same kind of visible work-management tools used by software teams:
boards, columns, tasks, comments, and mentions. Agents should communicate
through this shared work record rather than through direct agent-to-agent
conversation.

The framework watches board activity:

- When a task enters or appears in a watched column, the agent assigned to that
  column is activated.
- The agent inspects the task, performs its part of the work, records useful
  information on the task, and may move the task.
- Moving the task to another column can activate the agent responsible for the
  next stage.
- Mentioning an agent in a task comment activates that agent to inspect the
  task and decide whether it has work to do.

## Guided but flexible processes

A configured process should encourage the normal path through the columns, but
agents should be able to deviate when a task needs something different. For
example, an agent may mention another agent to request an opinion instead of
only moving the task forward.

## Human boundary

Humans are not specially assigned to columns. If no agent watches a column, no
agent is activated when a task enters it. The task simply waits there. This
allows the user to review the task and decide whether to move it to done without
requiring a separate kind of human assignment in the framework.

## Interfaces

The user needs a board interface comparable in usefulness to Jira, Azure
DevOps, or GitHub. Existing board implementations may be reusable; otherwise
they can provide design inspiration. Whether reuse is practical remains an open
research question.

Agents also need an interface suited to their work. They need to be able to:

- inspect the whole board through task titles or short summaries;
- inspect a task, its content, comments, and relationships together;
- move a task to any column on its board;
- add comments;
- create child tasks; and
- discover and mention other agents or the user.

These capabilities should preserve the agents' freedom to follow or reasonably
deviate from the configured process.

The user's board interface also provides a manual reactivation action. It sends
a task to the agent watching its current column without moving the task. This
is a recovery mechanism for cases where work could continue but an expected
automatic trigger did not run.

The board overview should not load every full task into an agent's context.
Titles or short task summaries should help an agent notice possibly related
work. The agent can then inspect a relevant task in detail.

## Configuration and experimentation

The framework must not hardcode the process. Boards, columns, agents, roles, and
the assignment of agents to columns should be freely configurable so the
process can be tested and refined over time.

One shared process spans all of its boards. This gives implementation agents
enough context about earlier requirements work, for example, to know when a
product or requirements agent may help. The process configuration describes
the boards, coordination rules, and participating agents.

Every agent has a name, full instructions for its own work, and a short summary
that other agents can use to understand its responsibility. Agents can discover
the names and summaries of collaborators across the whole process without
receiving every collaborator's full instructions.

## Multiple boards

The whole software-development process should not be forced onto one board. A
board may cover early product and requirements work, for example. Its result
may be several implementation tasks on another board. A one-to-many handoff is
a natural place to separate processes into different boards.

A task never moves from one board to another. A handoff creates one or more new
tasks on the destination board. The new tasks may refer back to the source task,
including through ordinary text when no dedicated relationship is needed.

## Agent-managed context

Agents should judge whether they can finish a task within their available
context. If a task is too large, an agent may split it into child tasks. The
framework therefore needs parent-child relationships between tasks.

## Task relationships and dependencies

Relationships between tasks have types. In addition to parent-child
relationships, a task may depend on another task whose result it needs before
it can continue. Agents can see a task's relationships when inspecting it and
may add a dependency after discovering related work elsewhere on the board.

A relationship may block a task from continuing. When that relationship becomes
satisfied, the framework must reactivate the blocked task by activating the
agent watching its current column. Examples include:

- The task being depended on is completed, allowing the dependent task to
  continue.
- The last unfinished child task is completed, allowing the parent task to
  continue.

The framework therefore needs to observe relationship changes as well as column
changes and mentions. A blocked task must not rely on an agent remembering to
return to it later.

A task is complete when it reaches the last column on its board. A dependency
is satisfied when the task being depended on reaches that final column. The
relationship does not need to name a completion column separately.

## Mentions and activation

When one agent mentions another agent to ask for information, the mentioned
agent is activated. A simple current idea is that the responding agent mentions
the original agent in its reply, activating that agent again. This follows the
same visible mention pattern in both directions. It is not yet settled whether
the framework should also support a more automatic reply or subscription
trigger.

Agents may also mention the user when they need clarification, a decision, or
help. The process should encourage this explicit escalation rather than leaving
a task stalled or having an agent guess.

## Still open

This file records the initial idea, not settled product decisions. The
Wayfinder conversation will clarify the exact destination, behavior,
boundaries, and success criteria before implementation is planned.
