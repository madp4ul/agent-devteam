# 37 — Structure Task History by Cause and Attempt

**What to build:** Redesign task history so a user can understand the causal
story of work—what triggered an agent, what it did, what it said, and what
happened next—without scrolling through a full-size card for every small
technical event or losing the underlying audit evidence.

**Blocked by:** 19 — Inspect and Control a Task; 20 — Consult Agents and Notify the User;
24 — Recover Failed and Permission-Blocked Attempts; 25 — Interrupt Tasks and Pause the Process;
32 — Observe Task Activity and Running Attempts Live; 47 — Reshape Task Details Around Agent Activity

**Status:** open

- [ ] Prototype and compare a small number of causal-group presentations before
  marking the issue ready-for-agent. Optimize for reconstructing the process,
  not for maximizing the number of visible ledger rows.
- [ ] Represent each attempt, including each retry, as one coherent block. Its
  header shows the actual agent plus current or final status; a finished block
  shows its end time, duration, and stored user-readable outcome. Meaningful
  agent-authored comments and domain actions from the attempt follow
  newest-first. Its footer links backward to the older trigger and shows the
  attempt start time. The transcript remains available from the block.
- [ ] Correlate agent-authored comments with their originating attempt through
  explicit provenance when necessary; do not guess solely from timestamps or
  the author's agent ID.
- [ ] Fold derived consequences into the event that caused them where possible:
  a mention comment can say which agent it requested, without forward-tracking
  that request's queued, running, or completed state. A later attempt links
  backward to the comment or movement that triggered it. Avoid separate
  full-size entries for activation queued, attempt started, attempt completed,
  or other lifecycle facts already expressed by the attempt block.
- [ ] Preserve standalone presentation for events without a containing attempt
  or visible cause, including user comments, pre-attempt startup failures,
  recovery actions, process changes, and exceptional diagnostics.
- [ ] Keep the complete authoritative activity, activation, attention, attempt,
  and provenance records durable without reproducing the raw ledger in the
  user-facing timeline. The timeline deliberately omits lifecycle IDs and raw
  start/completion records when their meaning is already expressed more clearly
  by a grouped attempt. Presentation grouping must not change durable ordering
  or domain semantics.
- [ ] Canonical participant mentions are visually prominent within comments,
  and a compact consequence within the full comment representation says which
  agent was requested. The consequence does not track or link forward to the
  resulting attempt; that newer attempt owns the backward `Triggered by` link.
  Coordinate this presentation with issue 35 rather than implementing two
  incompatible mention renderers.
- [ ] Dense histories remain navigable with keyboard and assistive technology;
  authored outcomes and comments use a roughly four-line collapsed preview with
  accessible inline Show more and Show less controls. Mention consequences stay
  visible outside the collapsed prose, and following a trigger link focuses and
  expands its source when necessary. Expansion survives live refresh.
- [ ] Present the task timeline newest-first by top-level record start: comments
  and standalone events use their occurrence time, while attempts use their
  start time and do not move when they finish. Inside an attempt, authored
  comments and meaningful actions appear newest-first. A user comment made
  during an attempt therefore appears above that attempt without being grouped
  into or attributed to it. Preserve authoritative chronological ordering in
  storage; this is a narrative projection rather than a fully interleaved
  rendering of every ledger event.
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
  preventing accidental requests belongs to issue 38's framework instructions
  and issue 35's mention interaction.
- This is intentionally not the next implementation ticket. It needs the later
  attempt/recovery event shapes and a focused UI prototype before implementation.
- Live review after issue 32 found that ongoing supervision would be easier when
  the latest task history is immediately visible. Include newest-first narrative
  ordering in the causal-group prototypes rather than changing the current flat
  timeline separately.
- The surrounding task-details layout is being cleaned up separately in issue
  47. Revisit this ticket with the user after that layout is available and
  before starting its required causal-group prototypes; do not infer Task
  Timeline grouping or interaction decisions from the surrounding page design.
- Clarification after issue 47 selected independent attempt blocks with backward
  causal links instead of nested causal episodes. A trigger is rendered once at
  its source: agent actions remain in the originating attempt, while the newer
  resulting attempt links back with `Triggered by`. There is no forward link
  from an older trigger to the later attempt.
- Attempt blocks are positioned by start time. Their top represents the newest
  attempt boundary: a completed attempt shows completion time, fixed duration,
  status, and the stored outcome in the same place for success, technical
  failure, permission blocking, or user interruption. The footer shows the
  start time and backward trigger link without repeating the trigger timestamp,
  which remains visible at its source.
- The ordinary attempt block exposes only View transcript. Copy thread ID stays
  in the transcript viewer. Activation IDs, raw lifecycle records, exact source
  references, stack traces, and a technical-details control do not belong in
  the timeline merely because the durable database retains them. Deliberately
  authored technical text remains available as authored prose and follows the
  same compact preview behavior as other comments or outcomes.
- Retries remain separate attempt blocks. An automatic retry links backward to
  the failed preceding attempt as its trigger rather than repeating the
  original comment, movement, or column-entry trigger.
