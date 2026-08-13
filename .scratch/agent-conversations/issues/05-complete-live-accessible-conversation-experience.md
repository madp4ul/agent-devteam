# 05 — Complete the Live and Accessible Conversation Experience

**What to build:** Finish the conversation experience with restrained live status, readable multi-run history, reliable navigation, and accessible responsive behavior while keeping the sidebar primarily a compact history surface.

**Blocked by:** 02 — Add the Compact Task Conversation Index; 03 — Continue a Conversation Through an Agent Run; 04 — Preserve Conversations Through Recovery and Process Evolution

**Status:** ready-for-agent

- [ ] The conversation view presents authored follow-ups and run evidence in chronological order with visible but compact boundaries between individual attempts.
- [ ] A running conversation incorporates newly completed messages and changing tool evidence without losing prior durable history or duplicating attempt items.
- [ ] Live refresh preserves the reader's position when inspecting older content and follows appended content only while the reader is already near the bottom.
- [ ] Conversation rows show no dot for ordinary idle history, a small green dot while that conversation is running, and a small yellow dot when its participating work needs attention.
- [ ] Needs-attention presentation takes precedence over running when both meanings could otherwise apply, and dots expose accessible labels and tooltips without permanent visible status text.
- [ ] Missing-agent, archived, unavailable-thread, queued, pending-submission, and rejected-submission states provide sufficient explanation in the conversation view without expanding compact sidebar rows into status cards.
- [ ] Opening a conversation from either its sidebar row or any participating timeline attempt reaches the same conversation and preserves useful selected-run context when practical.
- [ ] Keyboard navigation, focus management, backdrop and close behavior, semantic labels, error announcements, and composer operation meet the interaction conventions already established by task details and the transcript overlay.
- [ ] Light and dark appearances keep conversation content, compact rows, dots, focus states, disabled continuation, and errors readable without turning secondary navigation into visually dominant blocks.
- [ ] The assembled browser acceptance flow creates or selects a task conversation, opens it through the compact index, submits a follow-up, observes live running content and status, completes the agent run, verifies timeline attribution, and reopens the retained conversation after refresh.
- [ ] The full typecheck, production build, application tests, and browser suite pass with no regression to existing task details, timeline, recovery, archival, transcript, token-usage, responsive, or dark-mode behavior.
