# 78 — Disclose Agent-Inspectable Task Content

**What to build:** Make the task detail page consistently communicate which
content agents can inspect through coordination tools and which content exists
only for the user interface.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Define inspectability from the authoritative agent-facing task
  projections and tool contracts, including timeline entries and meaningful
  subparts whose visibility differs from their containing surface. Do not
  maintain a second hand-written event list that can silently drift.
- [x] Give every inspectable element a consistent, visually quiet marker;
  absence of the marker means the element is not exposed to agents.
- [x] Hovering or focusing the marker explains in plain language that the
  associated information is available to agents through their coordination
  tools. The explanation must not imply that every agent has already read it.
- [x] Markers remain attributable when timeline entries are grouped, collapsed,
  refreshed, or displayed inside conversation-related task surfaces.
- [x] The affordance is keyboard and screen-reader accessible, uses the shared
  centered SVG icon pattern for icon-only controls, and remains subordinate to
  primary task content in dark and light themes.
- [x] Application and browser coverage proves representative inspectable and
  user-only content, tooltip access, refresh stability, and appearance in both
  themes.

## Context

The task detail page records more operational information than agents receive
when they inspect a task. Without an explicit distinction, users cannot know
which facts are shared coordination context and which are private diagnostic or
interface detail.

## Answer

The complete user task-detail projection now carries disclosure metadata built
directly from `inspect_task`, `list_task_activity`, and
`list_task_attachments`: agent-facing field names plus durable comment,
relationship, activity, conversation-message, and attachment IDs. The browser
therefore does not classify activity types independently, and the same IDs are
available for the timeline filter planned by issue 79.

Task identity, description, current column, current coordination state,
attention, relationships, comments, immutable activity, and matching
conversation subparts now use one quiet robot-message SVG marker. Hover and
keyboard focus show the explanation that agents *can* inspect the associated
information through coordination tools. Attempt metadata and outcomes,
transcript-only evidence, conversation indexes and cost, workspace state,
controls, and conversation-private attachment metadata remain unmarked.
Grouped attempt comments and activity keep their own markers, as do repeated
comments and follow-up messages in conversation overlays.

Application coverage verifies projection-derived membership, including the
conversation-message/attachment boundary. Browser coverage verifies positive
and negative examples, hover and focus access, live-refresh stability, centered
SVG geometry, narrow-layout containment, and readable dark/light appearance.
