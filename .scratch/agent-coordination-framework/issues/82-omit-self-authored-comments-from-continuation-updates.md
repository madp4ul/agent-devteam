# 82 — Omit Self-Authored Comments from Continuation Updates

**What to build:** When an agent conversation resumes, exclude task comments
that the same agent authored during its preserved conversation from the
framework's summary of changes since that agent last ran.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Identify comment authors by immutable agent identity and relate each
  comment to the conversation state already preserved by the resumed Codex
  thread; do not rely on display names or textual mention content.
- [ ] Omit an agent's own already-known comments only from incremental
  continuation updates. Keep user comments and comments from every other agent
  in chronological order with their existing provenance.
- [ ] Do not remove the comments from durable task history, the browser
  timeline, agent tool results, activation sources, or a fresh/replacement
  thread's complete current task context.
- [ ] Preserve a self-authored comment when the resumed thread cannot be shown
  to have received or retained it; prefer harmless repetition over silently
  withholding unknown context.
- [ ] Comments added by the same agent in a different task conversation are
  handled according to whether this resumed conversation already observed
  them, rather than filtered solely because the stable author matches.
- [ ] Runtime and application coverage exercises same-agent comments, other
  agents, user comments, interleaving, resumed versus fresh threads, missing
  baselines, and activation-source comments.

## Context

The framework supplies resumed agents with changes that happened since their
previous run. Because the Codex conversation history is now preserved, an agent
already knows about comments it authored during that conversation; repeating
them consumes context and can misleadingly present the agent's own action as
new external information.
