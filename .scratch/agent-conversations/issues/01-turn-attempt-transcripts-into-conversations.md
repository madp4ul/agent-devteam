# 01 — Turn Attempt Transcripts into Conversations

**What to build:** Give every framework-started agent conversation a durable, task-scoped identity owned by one specific agent, and replace the attempt-only transcript experience with a read-only conversation that remains attributable to its individual runs.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] A fresh ordinary activation creates one durable conversation associated with its task, immutable owning-agent ID, historical agent-name snapshot, originating activation, and current Codex thread when that identity becomes available.
- [x] Attempts and their retained transcript evidence are associated with the conversation without duplicating attempt-scoped messages, tools, diagnostics, timing, outcome, or token usage into a second evidence store.
- [x] Retries of one activation remain in its conversation, while a distinct unrelated activation starts a distinct conversation and does not inherit hidden Codex context.
- [x] A task-scoped conversation-detail query returns the originating activation, ordered run boundaries, retained attempt evidence, owning-agent information, and continuation availability needed by user-facing callers.
- [x] Existing timeline transcript actions are renamed to **View Conversation** and open the conversation containing the selected attempt.
- [x] The conversation view identifies the owning agent and renders the existing run evidence read-only without regressing copyable thread identity, token usage, tool summaries, diagnostics, or command-output disclosure.
- [x] Basic conversation identity and read projections survive application restart under the repository's current pre-release persistence policy.
- [x] Application and browser tests cover fresh versus retry grouping, separate activations, task scoping, conversation opening from the timeline, and preservation of the existing transcript evidence behavior.

## Answer

Ordinary activations now create durable task-scoped agent conversations with an
immutable owner snapshot and originating activation. Retry attempts aggregate
through the conversation projection while their transcript items, usage,
timing, outcomes, and thread references remain in the existing attempt-owned
records. The timeline opens the containing read-only conversation through
**View conversation**, including owner attribution, ordered run boundaries,
copyable current thread identity, token usage, tool output, and diagnostics.

Application coverage proves fresh-versus-retry grouping, distinct activations,
task scoping, and restart persistence. Browser coverage proves timeline access,
owner and run presentation, retained evidence behavior, narrow content
containment, and live refresh scroll behavior.
