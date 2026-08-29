# 79 — Filter the Timeline to Agent-Inspectable Events

**What to build:** Let a user reduce a long task timeline to the events and
authored communication that agents can inspect when reading the task.

**Blocked by:** 78 — Disclose Agent-Inspectable Task Content.

**Status:** resolved

- [x] Add an accessible timeline filter that switches between the complete
  user-facing timeline and only agent-inspectable content.
- [x] Derive membership from the same authoritative inspectability semantics
  and projections used by issue 78, including entries whose visible subparts
  have different exposure.
- [x] Filtering does not change durable task history, agent context, event
  ordering, grouping, expansion state, or the user's current timeline position
  more than necessary to reveal the selected result.
- [x] New live events enter or stay out of the filtered view according to their
  inspectability without resetting the user's chosen filter.
- [x] Empty results explain that no timeline content matches the filter, and
  the control remains understandable and operable in dark and light themes.
- [x] Keep the interaction extensible for possible event-type filters, but do
  not add speculative checkbox categories in this ticket.
- [x] Browser coverage exercises switching, mixed-visibility history, grouped
  or collapsed entries, live refresh, empty results, and both themes.

## Context

Task timelines can become long enough that relevant coordination evidence is
difficult to find. The first high-value filter is not an arbitrary event-type
taxonomy: it is the exact subset that agents themselves can inspect.

## Answer

The task timeline now has an accessible, additive `Visible to agents` filter
beside its heading. The filtered membership is derived
only from the projection-owned inspectable comment and activity IDs introduced
by issue 78. Mixed attempt records retain their grouping while removing
user-only nested events and outcomes while preserving the complete run header,
trigger context, timing, and conversation navigation needed to operate the UI.

The selection and expanded prose state survive live refreshes, and retained
timeline content is viewport-anchored across filter changes. A dedicated empty
result explains when nothing matches. Unit and browser coverage verifies
projection-derived membership, mixed grouped content, position and expansion
preservation, live inclusion and exclusion, empty results, accessibility, and
dark/light readability.
