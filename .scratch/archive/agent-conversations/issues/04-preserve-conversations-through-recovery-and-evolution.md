# 04 — Preserve Conversations Through Recovery and Process Evolution

**What to build:** Make continued conversations retain honest identity and attribution through retries, restarts, runtime recovery, process-definition changes, agent removal, and task archival.

**Blocked by:** 03 — Continue a Conversation Through an Agent Run

**Status:** resolved

- [x] Technical retries, explicit Retry, permission-block continuation, and user-interruption continuation remain in the same conversation and reuse the conversation's usable current thread through existing recovery policy.
- [x] Permission blocks, technical failures, interruptions, and exhausted retries create and resolve the existing task attention states rather than introducing a conversation-only recovery system.
- [x] If Codex cannot resume a stored thread, the supported replacement path keeps the framework conversation stable, records an explicit continuity break, adopts the replacement thread for later turns, and never claims unavailable model history was retained.
- [x] Conversation ownership, authored messages, activation provenance, attempt association, latest usable thread, and queued follow-up state survive application restart without duplication.
- [x] Renaming an owning agent preserves conversation identity and continuation under that stable agent ID while presenting the current display name.
- [x] Removing the owning agent leaves retained conversation history navigable, uses the historical agent-name snapshot, disables new continuation with a concise explanation, and never substitutes another agent.
- [x] A conversation follow-up created under an earlier process version follows the framework's existing stale-activation approval behavior and receives current authoritative process composition when approved.
- [x] Archiving a task preserves the existing coordination-history contract, removes detailed transcript content as before, and prevents further continuation; this feature does not extend archived transcript retention.
- [x] Conversation commands reject wrong-task conversation IDs, archived tasks, missing conversations, missing owning agents, and unavailable continuation state with bounded actionable results.
- [x] Application and adapter scenarios cover restart, automatic and explicit recovery, replacement threads, current instructions after process evolution, missing-agent history, stale activation approval, and archival cleanup.

## Answer

Conversation recovery now stays within the ordinary activation, attempt, attention,
and stale-process lifecycle while preserving stable conversation ownership and the
latest usable thread. Automatic retry, explicit Retry, permission continuation,
user-interruption continuation, restart recovery, and approved process rebasing all
retain their original conversation and current attribution. Replacement Codex
threads remain an explicit continuity break and become the honest resume target for
later turns.

Process evolution resolves current display names by stable agent ID and falls back
to the retained historical name when an owner is removed, at which point continuation
is rejected without substitution. Archival now purges both attempt transcripts and
authored conversation-message bodies, including their durable continuation-command
response copies, while retaining coordination activity and activation history.
Application and runtime coverage exercises the recovery, restart, evolution,
replacement, rejection, and archive boundaries.
