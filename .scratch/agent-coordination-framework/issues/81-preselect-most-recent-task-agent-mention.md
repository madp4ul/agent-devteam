# 81 — Preselect the Most Recent Task Agent in Mention Autocomplete

**What to build:** When the user types `@` in the task comment composer, make
the most recently run applicable agent the active autocomplete suggestion so a
reply can usually be addressed without typing the agent's name.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Determine the most recent agent from authoritative task run history using
  immutable agent identity rather than display name, including completed,
  failed, and interrupted attempts as appropriate to the existing directory.
- [x] At a valid empty mention boundary, open the existing participant
  autocomplete with that agent as the active option while retaining all current
  choices and filtering behavior.
- [x] Immediate keyboard selection inserts the canonical token of the active
  agent; merely typing `@` never inserts or submits a mention by itself.
- [x] If the most recent agent is removed, unavailable, or not an applicable
  participant, fall back to the existing deterministic suggestion behavior
  without targeting another identity silently.
- [x] Partial typing, pointer choice, repeated mentions, Reply insertion,
  process-definition refresh, accessibility, and ordinary prose behavior remain
  intact.
- [x] Browser coverage proves the common immediate-selection path, multiple
  historical agents, unavailable-agent fallback, keyboard and pointer use, and
  unchanged activation semantics after submission.

## Context

Issue 35 made participants discoverable through `@` autocomplete. In normal
task discussion, a new mention most often addresses the agent that just worked
on the task, so making that agent active removes unnecessary typing without
changing who is contacted until the user selects and submits it.

## Answer

At an empty valid mention boundary, the task comment composer now selects the
participant whose immutable agent ID owns the most recently started attempt in
the task's authoritative activation history. Completed, failed, running, and
user-interrupted attempts all participate. The preference applies only while
the query is empty; partial typing retains the existing filtering and
deterministic selection behavior.

The preferred ID is validated against the current collaborator directory. If
that exact agent has been removed or is otherwise unavailable, autocomplete
falls back to its ordinary first suggestion instead of silently selecting an
older historical agent. Typing `@` still only opens the list: insertion requires
keyboard or pointer selection, and activation still requires submitting the
resulting comment.

Browser coverage verifies multiple historical agents, immediate keyboard
selection, completed, failed, and interrupted run history, unavailable-agent
fallback, pointer selection, accessibility state, and unchanged post-submit
mention activation semantics. The complete task-comment browser suite and both
TypeScript configurations pass.
