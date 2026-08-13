# 02 — Add the Compact Task Conversation Index

**What to build:** Let the user reach every conversation for the current task from a compact history-and-access section at the bottom of the task detail page's right column, without scanning the full timeline.

**Blocked by:** 01 — Turn Attempt Transcripts into Conversations

**Status:** ready-for-agent

- [ ] A task-scoped conversation-index query returns only the conversation identity, current or historical owning-agent display information, concise generated label or preview, recent-activity ordering data, and continuation availability needed by the compact list.
- [ ] The task detail page shows a **Conversations** section at the bottom of its right column and omits the section or presents an intentional empty state when the task has no conversations.
- [ ] Each conversation appears as one compact row containing the agent name and short generated label or preview; ordinary idle history carries no extra badges, counts, timing, usage, or visible status text.
- [ ] The entire row is one keyboard-operable, visibly focusable navigation target that opens the selected conversation without a separate View button.
- [ ] Conversations are ordered by descending latest activity and reorder after later durable conversation activity.
- [ ] Multiple conversations owned by the same agent remain distinguishable through their generated labels or previews.
- [ ] Historical conversation navigation remains available when its owning agent is no longer present, while the index exposes that continuation is unavailable without substituting another agent.
- [ ] Responsive browser coverage proves that the compact section remains in the intended right-column reading order on wide layouts and in the established task-detail reading order on narrow layouts.

