# 78 — Disclose Agent-Inspectable Task Content

**What to build:** Make the task detail page consistently communicate which
content agents can inspect through coordination tools and which content exists
only for the user interface.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Define inspectability from the authoritative agent-facing task
  projections and tool contracts, including timeline entries and meaningful
  subparts whose visibility differs from their containing surface. Do not
  maintain a second hand-written event list that can silently drift.
- [ ] Give every inspectable element a consistent, visually quiet marker;
  absence of the marker means the element is not exposed to agents.
- [ ] Hovering or focusing the marker explains in plain language that the
  associated information is available to agents through their coordination
  tools. The explanation must not imply that every agent has already read it.
- [ ] Markers remain attributable when timeline entries are grouped, collapsed,
  refreshed, or displayed inside conversation-related task surfaces.
- [ ] The affordance is keyboard and screen-reader accessible, uses the shared
  centered SVG icon pattern for icon-only controls, and remains subordinate to
  primary task content in dark and light themes.
- [ ] Application and browser coverage proves representative inspectable and
  user-only content, tooltip access, refresh stability, and appearance in both
  themes.

## Context

The task detail page records more operational information than agents receive
when they inspect a task. Without an explicit distinction, users cannot know
which facts are shared coordination context and which are private diagnostic or
interface detail.
