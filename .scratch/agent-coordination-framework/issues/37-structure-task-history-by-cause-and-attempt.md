# 37 — Structure Task History by Cause and Attempt

**What to build:** Redesign task history so a user can understand the causal
story of work—what triggered an agent, what it did, what it said, and what
happened next—without scrolling through a full-size card for every small
technical event or losing the underlying audit evidence.

**Blocked by:** 19 — Inspect and Control a Task; 20 — Consult Agents and Notify the User;
24 — Recover Failed and Permission-Blocked Attempts; 25 — Interrupt Tasks and Pause the Process;
32 — Observe Task Activity and Running Attempts Live; 47 — Reshape Task Details Around Agent Activity

**Status:** resolved

- [x] Implement the clarified independent-attempt presentation directly in the
  assembled task-details UI. Optimize for reconstructing the process, not for
  maximizing the number of visible ledger rows.
- [x] Represent each attempt, including each retry, as one coherent block. Its
  header shows the actual agent plus current or final status; a finished block
  shows its end time, duration, and stored user-readable outcome. Meaningful
  agent-authored comments and domain actions from the attempt follow
  newest-first. Its footer links backward to the older trigger and shows the
  attempt start time. The transcript remains available from the block.
- [x] Correlate agent-authored comments with their originating attempt through
  explicit provenance when necessary; do not guess solely from timestamps or
  the author's agent ID.
- [x] Fold derived consequences into the event that caused them where possible:
  a mention comment can say which agent it requested, without forward-tracking
  that request's queued, running, or completed state. A later attempt links
  backward to the comment or movement that triggered it. Avoid separate
  full-size entries for activation queued, attempt started, attempt completed,
  or other lifecycle facts already expressed by the attempt block.
- [x] Preserve standalone presentation for events without a containing attempt
  or visible cause, including user comments, pre-attempt startup failures,
  recovery actions, process changes, and exceptional diagnostics.
- [x] Keep the complete authoritative activity, activation, attention, attempt,
  and provenance records durable without reproducing the raw ledger in the
  user-facing timeline. The timeline deliberately omits lifecycle IDs and raw
  start/completion records when their meaning is already expressed more clearly
  by a grouped attempt. Presentation grouping must not change durable ordering
  or domain semantics.
- [x] Canonical participant mentions are visually prominent within comments,
  and a compact consequence within the full comment representation says which
  agent was requested. The consequence does not track or link forward to the
  resulting attempt; that newer attempt owns the backward `Triggered by` link.
  Coordinate this presentation with issue 35 rather than implementing two
  incompatible mention renderers.
- [x] Dense histories remain navigable with keyboard and assistive technology;
  authored outcomes and comments use a roughly four-line collapsed preview with
  accessible inline Show more and Show less controls. Mention consequences stay
  visible outside the collapsed prose, and following a trigger link focuses and
  expands its source when necessary. Expansion survives live refresh.
- [x] Present the task timeline newest-first by top-level record start: comments
  and standalone events use their occurrence time, while attempts use their
  start time and do not move when they finish. Inside an attempt, authored
  comments and meaningful actions appear newest-first. A user comment made
  during an attempt therefore appears above that attempt without being grouped
  into or attributed to it. Preserve authoritative chronological ordering in
  storage; this is a narrative projection rather than a fully interleaved
  rendering of every ledger event.
- [x] Browser scenarios cover comment-triggered consultation, move-triggered
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
- The user chose direct implementation in the assembled task-details UI instead
  of an isolated prototype because live use will provide better design evidence.
- Live review after issue 32 found that ongoing supervision would be easier when
  the latest task history is immediately visible. Include newest-first narrative
  ordering in the grouped timeline rather than changing the current flat
  timeline separately.
- The surrounding task-details layout is being cleaned up separately in issue
  47. Revisit this ticket with the user after that layout is available and
  before implementing the grouped timeline; do not infer Task Timeline grouping
  or interaction decisions from the surrounding page design.
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
- Retries remain separate attempt blocks. A retry links backward to the failed
  preceding attempt as its trigger rather than repeating the original comment,
  movement, or column-entry trigger. The presentation does not call every retry
  automatic because user recovery can also produce a later attempt.
- Follow-up live use found four small navigation and readability gaps. Preserve
  the visible timeline record across authoritative polling, render timestamps as
  live relative time with exact time still available, make movements subtly
  distinct from authored comments, and link the Move task panel to the movement
  that established the current column. Project user-authored prompt records
  under the canonical agent-facing identity `user` and tell agents explicitly
  that the actionable user mention is `@user`.

- [x] Keep the visible top-level timeline record nearest the viewport center at
  the same viewport-relative position when polling inserts or expands history.
- [x] Use responsive live relative timestamps while retaining the exact local
  date and time as machine-readable and hover-accessible context.
- [x] Give task movements a restrained visual treatment distinct from comments
  without changing the attempt-block design.
- [x] Link the Move task panel to the durable movement that established the
  current column when such an event exists.
- [x] Correct runtime prompt projection and coverage so internal persistence
  identities never enter agent context and agents address the user with `@user`.
- Final visual review kept source focus semantics but removed the unexplained
  yellow pointer-focus frame. Ordinary pointer focus is quiet, keyboard focus
  uses the timeline's muted blue, and following a causal link gives its source a
  short blue target highlight. Comments and movements use related pale amber and
  blue backgrounds without additional left accent bars. Attempt ownership is
  emphasized in the header; attempt number joins status and timing, nested
  comments simply say `Commented`, and requested-agent consequences use muted
  continuation styling rather than link-like green emphasis.

## Answer

Task history is now a narrative projection built from durable comments,
activities, activations, and attempts. Each attempt and retry appears as one
coherent, start-positioned block with readable status and outcome, newest-first
authored work, transcript access, a start-time footer, and a backward trigger
link. Lifecycle rows already expressed by the block are folded away, while user
comments, startup failures, recovery actions, and exceptional diagnostics stay
standalone.

Agent-authored comments and movements now carry explicit attempt provenance.
Canonical mentions are emphasized, requested-agent consequences remain visible,
and authored prose uses an accessible four-line preview whose expansion survives
live refresh. The projection and rendering keep raw identifiers, stack traces,
and duplicate lifecycle records out of the ordinary timeline without removing
their authoritative stored evidence.

Verification passed all 125 runnable non-browser tests, with the credentialed
real-Codex scenario skipped, all 37 browser scenarios, TypeScript typechecking,
and the production build. Live visual review passed at desktop and narrow
viewport sizes.

The live-use follow-up now anchors the visible top-level or nested timeline
record nearest the viewport center across polling updates. Timeline timestamps
update from seconds through minutes, hours, and days while retaining exact local
time in their semantic markup and hover text. Movement records use the existing
card design with a restrained blue arrow and accent, and Move task links to the
latest durable movement into the current column. The runtime prompt projects
user-authored trigger and comment records as the canonical `user` identity and
names only `@user` as the human mention token; persistence identities never enter
agent context.

The final styling refinement preserves the established attempt-card design while
reducing competing lines and labels. Pointer, causal-target, desktop, and narrow
viewport states passed focused browser coverage and live visual review without
browser warnings; typechecking and the production build also passed.

Nested attempt comments and movements now render as full-width amber or blue
bands against the attempt card's inner edges. The attempt-history and per-event
separator lines, inset margins, and inner corner rounding were removed because
the event backgrounds already communicate their structure. Consecutive event
bands meet directly, while outcome and footer spacing retain the larger
narrative sections.
