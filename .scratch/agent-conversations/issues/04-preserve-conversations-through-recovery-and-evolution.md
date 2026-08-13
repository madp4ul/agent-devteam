# 04 — Preserve Conversations Through Recovery and Process Evolution

**What to build:** Make continued conversations retain honest identity and attribution through retries, restarts, runtime recovery, process-definition changes, agent removal, and task archival.

**Blocked by:** 03 — Continue a Conversation Through an Agent Run

**Status:** ready-for-agent

- [ ] Technical retries, explicit Retry, permission-block continuation, and user-interruption continuation remain in the same conversation and reuse the conversation's usable current thread through existing recovery policy.
- [ ] Permission blocks, technical failures, interruptions, and exhausted retries create and resolve the existing task attention states rather than introducing a conversation-only recovery system.
- [ ] If Codex cannot resume a stored thread, the supported replacement path keeps the framework conversation stable, records an explicit continuity break, adopts the replacement thread for later turns, and never claims unavailable model history was retained.
- [ ] Conversation ownership, authored messages, activation provenance, attempt association, latest usable thread, and queued follow-up state survive application restart without duplication.
- [ ] Renaming an owning agent preserves conversation identity and continuation under that stable agent ID while presenting the current display name.
- [ ] Removing the owning agent leaves retained conversation history navigable, uses the historical agent-name snapshot, disables new continuation with a concise explanation, and never substitutes another agent.
- [ ] A conversation follow-up created under an earlier process version follows the framework's existing stale-activation approval behavior and receives current authoritative process composition when approved.
- [ ] Archiving a task preserves the existing coordination-history contract, removes detailed transcript content as before, and prevents further continuation; this feature does not extend archived transcript retention.
- [ ] Conversation commands reject wrong-task conversation IDs, archived tasks, missing conversations, missing owning agents, and unavailable continuation state with bounded actionable results.
- [ ] Application and adapter scenarios cover restart, automatic and explicit recovery, replacement threads, current instructions after process evolution, missing-agent history, stale activation approval, and archival cleanup.

