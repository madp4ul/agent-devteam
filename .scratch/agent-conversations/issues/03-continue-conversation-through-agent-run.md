# 03 — Continue a Conversation Through an Agent Run

**What to build:** Add a composer to a completed conversation so the user can ask its owning agent a follow-up that resumes the existing Codex context and executes as a fully attributable framework run.

**Blocked by:** 01 — Turn Attempt Transcripts into Conversations

**Status:** resolved

- [x] The conversation view provides a compact multiline follow-up composer when continuation is available and retains the entered body when submission fails.
- [x] Submitting a non-empty follow-up transactionally persists the authored conversation message, appends immutable task activity, and creates exactly one `user-follow-up` activation pointing to that message.
- [x] Retrying the same transport submission with its idempotency key does not duplicate the authored message, activity, activation, or eventual run.
- [x] The activation targets the conversation's immutable owning agent rather than the task's current column watcher, and accepting it does not move the task or transfer primary workflow responsibility.
- [x] The follow-up joins the task's ordinary activation order and obeys existing blockers, process pause, task suspension, stale-process handling, one-active-run-per-task, and cross-task concurrency behavior.
- [x] Dispatch uses the owning agent's current process instructions, the conversation's current Codex thread as the resume target, and the task's verified existing workspace.
- [x] Every follow-up attempt receives a fresh task-, agent-, and attempt-scoped coordination MCP authorization that is revoked through the existing attempt lifecycle.
- [x] The user message and new run appear in the conversation, while the activation, attempt, actions, timing, outcome, and recovery state appear through the ordinary task timeline and projections.
- [x] Successful submission clears the composer and updates the open conversation without requiring the user to close and reopen it.
- [x] Application, runtime-adapter, and assembled browser tests prove same-thread resumption, same-workspace execution, immutable agent ownership across a column change, fresh coordination authorization, ordering, and timeline attribution.

## Answer

Implemented durable conversation follow-ups through the ordinary activation and attempt lifecycle. The completed conversation now accepts idempotent authored messages, resumes the immutable owner's current runtime instructions in the existing task workspace and Codex thread, preserves causal timeline attribution, and reports replacement-thread continuity honestly when resumption is unavailable. Application, runtime, HTTP, browser, appearance, restart, and assembled end-to-end coverage exercise the flow.
