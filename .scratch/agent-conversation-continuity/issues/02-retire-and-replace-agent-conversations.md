# 02 — Retire and Replace Agent Conversations

**What to build:** Let the user retire a settled current agent conversation
with an explanation, preserve it for explicit historical continuation, and
create its fully informed replacement only when the task-and-agent pair next
receives ordinary work.

**Blocked by:** 01 — Continue Ordinary Activations in the Current Agent Conversation

**Status:** resolved

- [x] A quiet `Retire conversation` action in the conversation dialog opens an accessible confirmation form that explains the consequence and requires a non-empty user-authored reason.
- [x] Retirement is accepted only for the task-and-agent pair's current conversation while the task is unarchived and that pair has no running, queued, failed, interrupted, permission-blocked, retry-waiting, or otherwise unfinished activation.
- [x] Unfinished work keeps retirement disabled with a concise explanation; the command never interrupts, dismisses, cancels, moves, activates, or reprioritizes work implicitly.
- [x] An accepted idempotent retirement atomically records the authored reason and chronological retirement marker, appends attributable task activity, updates recent conversation activity, and removes the conversation from automatic reuse without starting an agent run.
- [x] The pair's next ordinary activation creates a replacement current conversation with the complete initial task composition plus the retirement explanation delivered once.
- [x] The retired conversation remains readable and explicitly continuable, and later follow-up messages and runs appear after the retirement marker without restoring that conversation as current.
- [x] Conversation detail identifies retired state and shows the retirement explanation at its chronological position; the replacement conversation exposes the explanation with its first activation without presenting it as a task comment or ordinary follow-up.
- [x] The task timeline shows a compact conversation-retirement event naming the actor and agent, with the authored reason behind the established disclosure interaction.
- [x] The compact Conversations list keeps current and retired conversations in one latest-activity order, displays only restrained `Retired` text on retired rows, and adds no `Current` badge to ordinary rows.
- [x] An explicit later follow-up may move a retired row upward by recent activity without removing its retired label or changing the pair's current conversation.
- [x] Retirement state, reason, current-lineage selection, idempotent results, replacement causality, and chronological history survive application restart.
- [x] HTTP, application, restart, and assembled browser coverage prove accepted and rejected retirement, replacement creation, retired continuation, task attribution, keyboard and focus behavior, and readable dark- and light-mode appearance.
- [x] The full typecheck, production build, non-browser suites, and browser suite pass without regressions to conversation continuation, recovery, process evolution, archival, live refresh, transcript evidence, or run-level token usage.

## Answer

Implemented durable, idempotent conversation retirement and automatic replacement lineage creation. Retired conversations remain explicitly continuable and recent-activity ordered, while replacements receive the complete initial composition and the retirement reason once. Added application, restart, HTTP, and assembled browser coverage for validation, chronology, accessibility, themes, replacement context, and historical follow-up ordering.
