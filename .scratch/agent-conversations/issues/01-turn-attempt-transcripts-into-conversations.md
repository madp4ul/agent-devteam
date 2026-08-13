# 01 — Turn Attempt Transcripts into Conversations

**What to build:** Give every framework-started agent conversation a durable, task-scoped identity owned by one specific agent, and replace the attempt-only transcript experience with a read-only conversation that remains attributable to its individual runs.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] A fresh ordinary activation creates one durable conversation associated with its task, immutable owning-agent ID, historical agent-name snapshot, originating activation, and current Codex thread when that identity becomes available.
- [ ] Attempts and their retained transcript evidence are associated with the conversation without duplicating attempt-scoped messages, tools, diagnostics, timing, outcome, or token usage into a second evidence store.
- [ ] Retries of one activation remain in its conversation, while a distinct unrelated activation starts a distinct conversation and does not inherit hidden Codex context.
- [ ] A task-scoped conversation-detail query returns the originating activation, ordered run boundaries, retained attempt evidence, owning-agent information, and continuation availability needed by user-facing callers.
- [ ] Existing timeline transcript actions are renamed to **View Conversation** and open the conversation containing the selected attempt.
- [ ] The conversation view identifies the owning agent and renders the existing run evidence read-only without regressing copyable thread identity, token usage, tool summaries, diagnostics, or command-output disclosure.
- [ ] Basic conversation identity and read projections survive application restart under the repository's current pre-release persistence policy.
- [ ] Application and browser tests cover fresh versus retry grouping, separate activations, task scoping, conversation opening from the timeline, and preservation of the existing transcript evidence behavior.

