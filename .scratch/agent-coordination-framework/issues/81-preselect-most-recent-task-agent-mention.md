# 81 — Preselect the Most Recent Task Agent in Mention Autocomplete

**What to build:** When the user types `@` in the task comment composer, make
the most recently run applicable agent the active autocomplete suggestion so a
reply can usually be addressed without typing the agent's name.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Determine the most recent agent from authoritative task run history using
  immutable agent identity rather than display name, including completed,
  failed, and interrupted attempts as appropriate to the existing directory.
- [ ] At a valid empty mention boundary, open the existing participant
  autocomplete with that agent as the active option while retaining all current
  choices and filtering behavior.
- [ ] Immediate keyboard selection inserts the canonical token of the active
  agent; merely typing `@` never inserts or submits a mention by itself.
- [ ] If the most recent agent is removed, unavailable, or not an applicable
  participant, fall back to the existing deterministic suggestion behavior
  without targeting another identity silently.
- [ ] Partial typing, pointer choice, repeated mentions, Reply insertion,
  process-definition refresh, accessibility, and ordinary prose behavior remain
  intact.
- [ ] Browser coverage proves the common immediate-selection path, multiple
  historical agents, unavailable-agent fallback, keyboard and pointer use, and
  unchanged activation semantics after submission.

## Context

Issue 35 made participants discoverable through `@` autocomplete. In normal
task discussion, a new mention most often addresses the agent that just worked
on the task, so making that agent active removes unnecessary typing without
changing who is contacted until the user selects and submits it.
