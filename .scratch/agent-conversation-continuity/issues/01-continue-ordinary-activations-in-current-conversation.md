# 01 — Continue Ordinary Activations in the Current Agent Conversation

**What to build:** Make every ordinary activation for one task-and-agent pair
continue that pair's current agent conversation, while supplying authoritative
new activation context without automatically repeating unbounded task text.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Column-entry, agent-mention, and blocker-clearance activations for the same task and stable agent ID join that pair's current conversation; another task or agent never shares that lineage.
- [ ] Every activation remains a distinct, strictly ordered, attributable run with its own source, attempt evidence, outcome, timing, token usage, workspace authorization, and recovery state.
- [ ] A pair without a current conversation creates one whose first activation receives the complete current initial task composition, including the full task description and all authored comments.
- [ ] A later ordinary activation resumes the current conversation and receives a compact authoritative activation bootstrap, bounded current structural facts, its exact source, and task description changes, comments, and activity not previously delivered to that conversation.
- [ ] Authored mention comments and follow-up messages are supplied in full, while a source already present in complete initial task history is identified without duplicating its body.
- [ ] Unchanged unbounded task descriptions and comments are not automatically repeated, and durable delivery progress survives restart without omitting or duplicating intervening task information.
- [ ] Prompt composition explicitly distinguishes a new activation in a resumed conversation from another attempt of the same activation; retries, interruption continuation, process rebasing, and replacement-thread recovery retain their existing semantics.
- [ ] Every distinct activation restores the minimum product-owned bootstrap and makes current activation, task, process, board, and role direction authoritative over conflicting inherited history.
- [ ] A read-only attempt-scoped coordination tool returns the complete current framework, process, board, owning-role instructions, and relevant participant identity without accepting arbitrary task or agent scope.
- [ ] Explicit user follow-ups continue their selected conversation, while ordinary conversation reuse does not move the task, transfer responsibility, coalesce activations, or change strict task ordering.
- [ ] Compact conversation navigation and conversation detail show several ordinary activations and their run boundaries in the same lineage without regressing polling, scroll preservation, recovery, archival, or usage attribution.
- [ ] Application, runtime-adapter, MCP, restart, and assembled browser coverage prove the complete behavior; representative real Codex SDK verification exercises long-lived continuation through compaction and operating-context recovery.
- [ ] The architecture inspection map and any affected durable domain documentation describe the implemented conversation-selection and activation-context authority accurately.

