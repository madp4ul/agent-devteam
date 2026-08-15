# 02 — Add the Compact Task Conversation Index

**What to build:** Let the user reach every conversation for the current task from a compact history-and-access section at the bottom of the task detail page's right column, without scanning the full timeline.

**Blocked by:** 01 — Turn Attempt Transcripts into Conversations

**Status:** resolved

- [x] A task-scoped conversation-index query returns only the conversation identity, current or historical owning-agent display information, concise generated label or preview, recent-activity ordering data, and continuation availability needed by the compact list.
- [x] The task detail page shows a **Conversations** section at the bottom of its right column and omits the section or presents an intentional empty state when the task has no conversations.
- [x] Each conversation appears as one compact row containing the agent name and relative latest activity; ordinary idle history carries no extra badges, counts, usage, or visible status text.
- [x] The entire row is one keyboard-operable, visibly focusable navigation target that opens the selected conversation without a separate View button.
- [x] Conversations are ordered by descending latest activity and reorder after later durable conversation activity.
- [x] Multiple conversations owned by the same agent remain temporally ordered, while their retained generated labels remain available as row metadata.
- [x] Historical conversation navigation remains available when its owning agent is no longer present, while the index exposes that continuation is unavailable without substituting another agent.
- [x] Responsive browser coverage proves that the compact section remains in the intended right-column reading order on wide layouts and in the established task-detail reading order on narrow layouts.

## Answer

Agent conversations now persist a concise originating-request label and a
monotonic durable activity order. The task-scoped compact projection returns
only index metadata, resolves current versus historical owning-agent display
names, and reports continuation availability without loading attempt evidence.

Task details render the projection as a quiet **Conversations** panel at the
bottom of the supporting column. Each full row is a focusable button that opens
the retained conversation; tasks without conversations omit the panel.
Application coverage proves ordering, reordering, retained same-agent labels,
and rename/removal behavior through process evolution. Browser coverage proves
whole-row keyboard navigation plus wide and narrow layout geometry.

## Comments

### User review — 2026-08-15

The compact panel now acts as a quiet temporal overview beside the task
timeline. On wide layouts it remains sticky below the task header while the
timeline scrolls; narrow layouts keep it in normal document flow. Visible row
metadata uses relative latest activity instead of repeating the task title for
ordinary conversations. The retained generated label still identifies the
conversation through row metadata and remains available to later conversation
work. Rows continue to open the conversation directly while timeline-jump
navigation remains an explicit follow-up decision rather than an assumption.

Following UI review, every compact row now presents only the agent name at the
left and relative latest activity at the right on the same line. Generated
labels remain retained as row metadata and tooltips, but request previews and
task-title labels are intentionally not rendered in the compact overview.

