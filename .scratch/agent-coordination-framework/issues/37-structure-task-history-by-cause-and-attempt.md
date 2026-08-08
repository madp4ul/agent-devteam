# 37 — Structure Task History by Cause and Attempt

**What to build:** Redesign task history so a user can understand the causal
story of work—what triggered an agent, what it did, what it said, and what
happened next—without scrolling through a full-size card for every small
technical event or losing the underlying audit evidence.

**Blocked by:** 19 — Inspect and Control a Task; 20 — Consult Agents and Notify the User;
24 — Recover Failed and Permission-Blocked Attempts; 25 — Interrupt Tasks and Pause the Process;
32 — Observe Task Activity and Running Attempts Live

**Status:** open

- [ ] Prototype and compare a small number of causal-group presentations before
  marking the issue ready-for-agent. Optimize for reconstructing the process,
  not for maximizing the number of visible ledger rows.
- [ ] Represent each attempt as one coherent block beginning with the actual
  agent and trigger, containing its transcript entry point and agent-authored
  comments from that run, and ending with its outcome, duration, and resulting
  handoff or failure. Retries remain distinguishable attempts.
- [ ] Correlate agent-authored comments with their originating attempt through
  explicit provenance when necessary; do not guess solely from timestamps or
  the author's agent ID.
- [ ] Fold derived consequences into the event that caused them where possible:
  a mention comment can say which activation or user-attention request it
  created, and a task-moved event can say which watching-agent activation it
  queued. Avoid separate full-size entries that merely restate those effects.
- [ ] Preserve standalone presentation for events without a containing attempt
  or visible cause, including user comments, pre-attempt startup failures,
  recovery actions, process changes, and exceptional diagnostics.
- [ ] Keep every authoritative activity, activation, attention reason, attempt,
  and source link inspectable through expansion or a technical-detail view even
  when the default narrative folds or summarizes it. Presentation grouping must
  not change durable ordering or domain semantics.
- [ ] Canonical participant mentions are visually prominent within comments,
  and their activation or attention consequence is understandable without
  searching surrounding ledger entries. Coordinate this presentation with
  issue 35 rather than implementing two incompatible mention renderers.
- [ ] Dense histories remain navigable with keyboard and assistive technology;
  collapsed summaries announce meaningful counts and state instead of hiding
  failures or pending attention.
- [ ] Browser scenarios cover comment-triggered consultation, move-triggered
  handoff, user attention, successful attempts, retries, startup failure,
  interruption, and a long task history where comments remain easy to find.

## Comments

- Live review after issue 20 found the current timeline dominated by separate
  entries such as activation queued, attention requested, attempt started, and
  attempt completed. Those facts are useful, but their equal visual weight
  obscures the much rarer authored comments and makes the process story hard to
  reconstruct.
- Accidental canonical mentions also produced repeated agent and self-agent
  activations, amplifying the visual flood. This ticket presents causal history;
  preventing accidental requests belongs to process guidance and issue 35's
  mention interaction.
- This is intentionally not the next implementation ticket. It needs the later
  attempt/recovery event shapes and a focused UI prototype before implementation.
