# Agent Conversation Continuity

Type: specification
Status: ready-for-agent
Source: [Evaluate One Conversation per Agent and Task](../agent-conversations/issues/06-evaluate-one-conversation-per-agent-and-task.md)

## Problem Statement

The coordination framework currently starts a separate agent conversation for
every unrelated ordinary activation. Real project use shows that repeated
activations of the same agent on the same task usually continue the same body of
work: a task returns to the agent's watched column, another participant answers
a request and mentions the agent back, review sends work back, or later task
activity asks the agent to extend or repair its earlier result.

Starting a new conversation in those cases discards useful reasoning,
observations, and interaction history. The task record remains authoritative
coordination state, but agents must over-document it to compensate for lost
runtime context, and a response comment cannot restore everything the returning
agent knew when it made the request.

Automatic continuity also creates risks the current lifecycle was not designed
to manage. A long-lived conversation can inherit stale assumptions, undergo
runtime compaction, and accumulate repeated copies of unbounded task
descriptions and comments if each activation receives the current full task.
The user needs the benefit of continuity without relying on compacted history to
preserve operating instructions, silently filling context with duplicate task
text, or losing a deliberate escape from a misleading lineage.

## Solution

Give each task-and-agent pair one **current agent conversation**. Every ordinary
activation reason for that pair joins the current conversation, while retries
and explicit follow-ups retain their existing lineage behavior. A resumed
ordinary activation receives a compact authoritative framework bootstrap, its
exact activation source, bounded current structural facts, and task text and
events that have not previously been delivered to that conversation. Unchanged
unbounded task text is not repeated.

A new conversation receives the complete initial task context used today. This
applies to the pair's first conversation and to a replacement created after the
user retires the current conversation. Long-form current framework, process,
board, and role instructions remain available through one read-only,
attempt-scoped coordination tool so an agent can recover exact operating
context after compaction or when inherited instructions appear incomplete or
contradictory.

Let the user perform **conversation retirement** after the task-and-agent pair
has no running or otherwise unfinished activation. Retirement keeps the old
conversation intact and explicitly continuable, removes it from automatic
reuse, records a required explanation, and does not activate the agent. The
pair's next ordinary activation creates a replacement conversation with full
initial task context plus that explanation. Retired conversations remain in the
same recent-activity-ordered history and are identified with restrained text.

## User Stories

1. As a user, I want repeated work by the same agent on the same task to retain its conversation, so that the agent can use its earlier reasoning and observations.
2. As a user, I want a response mention to return an agent to the conversation in which it requested that response, so that the answer has its intended context.
3. As a user, I want returning a task to an agent's watched column to continue that task-and-agent conversation, so that rework does not begin from an artificial blank slate.
4. As a user, I want blocker-clearance work to continue the owning agent's current task conversation, so that released work retains relevant history.
5. As a user, I want continuity to apply consistently across ordinary activation reasons, so that conversation selection is predictable.
6. As a user, I want different agents on one task to retain different conversations, so that one role does not inherit another role's hidden reasoning.
7. As a user, I want different tasks handled by the same agent to retain different conversations, so that unrelated work cannot contaminate context.
8. As a user, I want every activation to remain a distinct attributable run, so that conversation continuity does not collapse activation provenance or attempt evidence.
9. As a user, I want retries and interruption continuations to remain in their activation's conversation, so that technical recovery preserves the existing logical exchange.
10. As a user, I want an explicit follow-up to continue the selected conversation, so that I can question a specific historical run in its original context.
11. As a user, I want an explicit follow-up to a retired conversation not to restore automatic reuse, so that my retirement decision remains effective.
12. As a user, I want the exact source comment included in full when a mention activates an agent, so that the request is not truncated or paraphrased.
13. As a user, I want a new conversation to receive the complete current task description and all current comments, so that it begins with the same task understanding as an initial conversation today.
14. As a user, I want a source comment represented only once in one activation context, so that complete task history does not duplicate the exact request.
15. As a user, I want a resumed conversation to receive comments added since its previous activation, so that it learns what happened while another participant acted.
16. As a user, I want each newly authored comment delivered at most once automatically to one conversation, so that repeated activation context does not multiply unbounded text.
17. As a user, I want a changed task description delivered after the change without repeating unchanged prior descriptions, so that current intent is available without needless context growth.
18. As a user, I want intervening task events supplied in chronological order, so that the returning agent can understand how the current state arose.
19. As a user, I want small current structural facts supplied on every distinct activation, so that inherited history cannot obscure the current task, column, revision, or request.
20. As a user, I want the new activation clearly authoritative over contradictory inherited history, so that later direction wins over stale premises.
21. As a user, I want framework bootstrap instructions restored on every distinct activation, so that compaction cannot remove the minimum rules required to handle the turn safely.
22. As a user, I want the bootstrap to remain compact, so that protecting instruction continuity does not itself dominate the context window.
23. As a user, I want the agent to be able to inspect its complete current operating context, so that summarized or obsolete framework, process, board, and role instructions can be recovered exactly.
24. As a user, I want operating-context inspection to be read-only and scoped to the current attempt, so that it cannot disclose another role's instructions or mutate coordination state.
25. As a user, I want current process and role instructions to remain authoritative after process evolution, so that conversation continuity does not preserve obsolete operating policy.
26. As a user, I want compaction to remain ordinary runtime context management inside one conversation, so that it does not create misleading duplicate product conversations.
27. As a user, I want an unusable runtime thread to retain the framework conversation's existing continuity-break behavior, so that technical replacement remains honest and navigable.
28. As a user, I want to retire a settled current conversation, so that later ordinary work can avoid stale, misleading, or excessively anchored context.
29. As a user, I want retirement to require an explanation, so that the replacement agent understands why the prior lineage was deliberately excluded.
30. As a user, I want retirement not to run the agent immediately, so that ending a lineage does not invent work I have not requested.
31. As a user, I want retirement unavailable while that task-and-agent pair has unfinished activations, so that I do not discard context before seeing the work it will produce.
32. As a user, I want to use existing interruption, dismissal, and recovery actions before retirement, so that abandoning unfinished work remains explicit.
33. As a user, I want the next ordinary activation after retirement to create the replacement conversation, so that a new lineage begins only when real work exists.
34. As a user, I want the replacement conversation to receive the retirement explanation once, so that it can avoid recreating the discarded approach without repeatedly revisiting that decision.
35. As a user, I want the retired conversation preserved unchanged, so that its historical reasoning and evidence remain inspectable.
36. As a user, I want to ask a later follow-up in a retired conversation, so that I can still ask why an earlier action was taken.
37. As a user, I want the retirement event to remain at its chronological position before later follow-ups, so that the conversation history remains truthful.
38. As a user, I want conversation retirement available from the conversation dialog, so that the action is attached to the lineage it affects.
39. As a user, I want the retirement form to explain its consequence and require my reason, so that I do not retire a conversation accidentally or ambiguously.
40. As a user, I want the dialog to explain why retirement is temporarily unavailable, so that unfinished work does not look like a broken control.
41. As a user, I want a retired conversation identified in its dialog, so that I know ordinary activations will not return to it.
42. As a user, I want retired conversations marked with quiet text in the compact Conversations list, so that same-agent lineages remain distinguishable without turning history into a dashboard.
43. As a user, I want current conversations to remain visually undecorated, so that ordinary history stays quiet.
44. As a user, I want retired and current conversations kept in the same latest-activity order, so that explicit later follow-ups still surface recent history.
45. As a user, I want the retirement explanation visible at the retirement point in the old conversation, so that later readers understand why automatic reuse ended.
46. As a user, I want the retirement explanation visible with the replacement conversation's first activation, so that the new lineage's starting premise is inspectable.
47. As a user, I want conversation retirement recorded in the task timeline, so that this coordination decision remains attributable outside the dialog.
48. As a keyboard or assistive-technology user, I want retirement controls, explanations, status text, and confirmation behavior to remain operable and announced, so that the escape hatch is not mouse-only.
49. As a user, I want retired presentation readable in dark and light modes without visually dominating primary task actions, so that historical status remains appropriately quiet.
50. As a user, I want conversation reuse, retirement, replacement, and delivery progress to survive application restart, so that continuity does not depend on one host process.
51. As a user, I want duplicate retirement submissions handled idempotently, so that transport retries cannot create multiple events or replacement explanations.
52. As a user, I want current test state to remain disposable, so that this pre-release redesign does not spend effort migrating experimental conversations.
53. As a user, I want run-level timing and token usage to remain attributable to each attempt, so that a longer conversation does not blur the cost and outcome of individual activations.

## Implementation Decisions

### Conversation lineage

- Replace the rule that every ordinary activation creates a conversation with a
  task-and-agent continuity rule. At most one non-retired conversation is
  current for a task-and-agent pair; all ordinary activation reasons reuse it.
- Conversation ownership remains one immutable stable agent ID and one task ID.
  Sharing a task does not share model context between agents, and one agent's
  conversations remain separate across tasks.
- Conversation selection is independent of activation reason. Column entry,
  agent mention, and blocker clearance all use the pair's current conversation.
  A user follow-up continues the explicitly selected conversation, including a
  retired conversation, and never changes which conversation is current.
- Activations, attempts, transcripts, outcomes, timing, token usage, source
  events, and strict task order remain distinct and attributable inside the
  shared conversation lineage.
- Automatic retry, explicit retry, permission continuation, and user
  interruption continuation preserve their existing same-activation
  conversation behavior.
- Runtime thread replacement after a failed resume remains a continuity break
  inside the same framework conversation. Compaction remains runtime context
  management and does not create a new framework conversation.
- Current pre-release coordination state is disposable. The implementation may
  replace the schema and start with empty state rather than migrate existing
  multiple conversations for one task-and-agent pair.
- Do not add dedicated behavior or acceptance coverage for removing and later
  restoring the same stable agent ID. Existing identity semantics may apply
  naturally, but this edge case does not justify feature work.

### Activation context delivery

- A new conversation receives the complete current initial task composition:
  task identity, full current description, relationships, unfinished
  coordination state, and every current authored comment. A replacement
  conversation after retirement uses the same composition plus the retirement
  explanation.
- A resumed conversation does not receive the full task composition again. It
  receives a compact current structural orientation, the exact activation
  reason and source, and task description changes, authored comments, and task
  events not previously delivered to that conversation.
- Authored source text is never shortened merely to satisfy a nominal context
  budget. A source mention comment or user follow-up is supplied in full.
- The source is rendered once in an activation composition. When the source
  comment is also part of a new conversation's complete comment history, the
  composition identifies it as the activation source without duplicating its
  body.
- Persist enough task-context delivery progress per conversation to survive
  restart and deterministically include intervening information once. The
  implementation may choose the internal cursor representation, but it must
  cover authored comments, task-description changes, and immutable task
  activity in chronological order.
- Advance delivery progress only for context actually composed for a dispatched
  distinct activation. A failed transport retry must not manufacture missing or
  duplicate authored context.
- The framework does not generate semantic summaries of authored comments or
  task descriptions for this feature. Complete new authored text is preferable
  to lossy interpretation; unchanged text is omitted.
- Distinguish a new activation in a resumed conversation from another attempt
  of the same activation. Thread continuity alone is not sufficient to choose
  the activation composition.

### Operating instructions and compaction

- Supply a compact, product-owned activation bootstrap on every distinct
  activation, including resumed conversations. It states the current activation
  contract, makes the new activation authoritative over conflicting inherited
  history, requires reassessment of current task and workspace state, and
  explains how to recover complete operating instructions.
- Do not automatically repeat the complete long-form framework, process, board,
  role, and participant composition on every resumed ordinary activation. A new
  or replacement conversation still receives the full current composition.
- Add one read-only coordination tool that returns the complete current
  framework, process, board, owning-agent role and instructions, and relevant
  participant identity needed by the current attempt. It accepts no arbitrary
  task or agent identity and uses the attempt's existing scope.
- The bootstrap directs the agent to use the operating-context tool when
  inherited instructions appear incomplete, summarized, obsolete, or
  contradictory. Correct minimum activation handling does not depend on the
  agent detecting a compaction event because the bootstrap itself is refreshed.
- Current process and agent instructions are authoritative. Existing stale
  activation approval and process-rebase behavior continues to supply the
  required current composition rather than executing obsolete instructions.
- Retain the TypeScript Codex SDK and its start, resume, compaction, and thread
  persistence behavior. Do not introduce direct Responses or App Server
  integration solely to control or inspect compaction.
- Validate compaction as part of implementation and representative real-runtime
  use rather than through a throwaway prototype. The feature may be corrected
  iteratively if current SDK or model behavior reveals a gap.

### Conversation retirement

- Add an idempotent user command that accepts the task, current conversation,
  non-empty retirement explanation, user actor, and idempotency key.
- Retirement is available only for the pair's current conversation while the
  task is unarchived and that task-and-agent pair has no running, queued,
  failed, interrupted, permission-blocked, retry-waiting, or otherwise
  unfinished activation. Work for other agents does not by itself retire or
  replace this pair's conversation.
- The user resolves unfinished work through the existing interruption,
  dismissal, retry, attention, and recovery flows. Retirement does not
  implicitly interrupt, dismiss, cancel, move, or reprioritize anything.
- An accepted retirement atomically marks the conversation retired from
  automatic reuse, retains the authored explanation and chronology, appends
  immutable task activity, advances conversation recent activity, and records
  an idempotent result. It creates no activation, attempt, workspace action, or
  Codex thread.
- After retirement the task-and-agent pair temporarily has no current
  conversation. Its next ordinary activation creates a replacement, records the
  causal retirement, receives the explanation once, and then becomes current
  for later ordinary activations.
- The retired conversation remains readable and accepts explicit user
  follow-ups under the existing continuation validation and activation order.
  Those activations and later evidence appear after the retirement marker and
  never promote the retired conversation back to current.
- Retirement is a chronological conversation event, not a terminal history
  boundary. Its marker remains at the time of retirement even when later
  explicit continuation adds messages and runs.

### Queries and user interface

- Extend compact conversation rows and conversation detail with retirement
  state. Keep the list ordered by latest durable activity across current and
  retired conversations.
- A retired row shows only a small, muted `Retired` text label in addition to
  the existing compact content and status indicator. Current conversations gain
  no `Current` badge. Explicit continuation may move a retired row upward
  without removing its label.
- Show retired state and the chronological retirement explanation inside the
  conversation dialog. Later explicit follow-ups and runs render after that
  marker in normal history order.
- Add a quiet textual `Retire conversation` action to the conversation dialog
  header. It opens a confirmation form that explains the consequence and
  requires the retirement explanation.
- Disable retirement while the pair has unfinished activations and provide a
  concise reason. Do not hide or disable ordinary historical navigation merely
  because the conversation is retired.
- Append a compact task-timeline event naming the user, owning agent, and
  retirement. Put the authored explanation behind the timeline's established
  disclosure behavior rather than expanding ordinary history by default.
- Show the retirement explanation with the replacement conversation's first
  activation context without presenting it as a new task comment or ordinary
  conversation follow-up.
- Preserve existing dialog focus, Escape, backdrop, opener restoration,
  polling, scroll-restoration, follow-at-bottom, composer, error announcement,
  and idempotent submission behavior.
- The retirement action and state use accessible semantics and restrained dark-
  and light-mode presentation consistent with the Conversations panel's role as
  supporting history rather than a primary task action.

### Architecture

- Keep `CoordinationApplication` as the public command-and-query authority. The
  existing focused conversation command and projection modules remain the
  locality for retirement and current-lineage behavior and participate in the
  caller-owned SQLite transaction.
- Deepen activation-context composition so its interface receives explicit
  conversation and activation semantics instead of deriving them from whether
  a runtime thread is resumed. Keep runtime start/resume/replacement mechanics
  in the Codex adapter.
- Conversation context delivery progress is authoritative coordination state,
  not runtime transcript state. Attempt transcripts remain inspectable evidence
  and are not duplicated into task-context history.
- The coordination MCP adapter remains a transport around the application
  boundary. The new operating-context tool exposes current attempt-scoped read
  behavior without becoming another process or instruction authority.
- Update the architecture inspection map and record an ADR if implementation
  confirms a hard-to-reverse, surprising trade-off beyond the domain decisions
  already captured in the glossary.

## Testing Decisions

- Test external coordination behavior rather than private SQL, helper calls, or
  prompt-string formatting. Assert conversation identity, activation
  attribution, dispatched context, queries, durable activity, rejection
  reasons, and browser behavior through established interfaces.
- The primary seam is the application command-and-query interface with the real
  schema, process validation, activation ordering, automation, conversation
  modules, and restart persistence plus a controlled agent runtime.
- Application scenarios prove that every ordinary activation reason reuses the
  current task-and-agent conversation, other agents and tasks remain isolated,
  retries retain their activation lineage, and explicit follow-ups stay in the
  selected retired or current conversation.
- Application scenarios prove full initial context, non-repeating resumed
  context, full source comments, deterministic intervening comment/activity
  delivery, description changes, source de-duplication, and restart-safe
  delivery progress.
- Application scenarios prove retirement availability and rejection, required
  explanation, idempotency, no immediate activation, replacement creation,
  explanation delivery, chronological retired follow-ups, current-lineage
  stability, task activity, and restart behavior.
- Focused runtime-adapter tests prove that a new activation in a resumed thread
  receives its activation bootstrap and delta rather than retry-only context,
  while another attempt of the same activation keeps recovery semantics.
  Start/resume/replacement behavior and attempt-scoped transcript and usage
  attribution remain intact.
- MCP adapter contract coverage proves that the operating-context tool exposes
  only the current attempt's complete current instructions and identity and
  rejects missing or invalid attempt scope through existing authorization.
- One focused HTTP contract scenario proves that retirement input,
  idempotency, accepted results, and bounded rejections translate through the
  browser adapter. Do not duplicate the lifecycle suite at this seam.
- Assembled browser coverage proves retirement from the dialog, required reason
  and disabled-state explanation, chronological marker and later explicit
  follow-up, compact `Retired` text, unchanged recency ordering, task-timeline
  disclosure, and replacement conversation creation after a later ordinary
  activation.
- Browser appearance coverage checks the new action, form, marker, and muted
  row text in dark and light modes. Keyboard coverage checks focus,
  confirmation, cancellation, error announcement, and opener restoration.
- Representative real Codex SDK verification exercises a long-lived resumed
  conversation through compaction and confirms that a later activation follows
  the current bootstrap and can inspect full operating context. Credentialed
  verification may remain intentionally skipped in ordinary uncredentialed
  suites, consistent with existing real-Codex coverage.
- Run the full typecheck, production build, application tests, adapter tests,
  and browser suite. Existing conversation polling, navigation, recovery,
  process evolution, archival, transcript, and token-usage behavior must remain
  green.

## Out of Scope

- Sharing one conversation between different agents or between different
  tasks.
- Automatically retiring conversations based on age, token usage, compaction,
  model judgment, process changes, or detected stale premises.
- Allowing an agent or the framework to retire a conversation without an
  explicit user command.
- Retiring a conversation while its task-and-agent pair still has unfinished
  activation work.
- Coalescing activations, changing strict activation ordering, or collapsing
  several activations into one run.
- Summarizing or truncating authored activation sources, task descriptions, or
  newly delivered comments as part of this feature.
- Adding a general memory store, editable conversation summaries, user-managed
  context windows, or manual compaction controls.
- Replacing the Codex SDK, adopting the App Server or direct Responses API, or
  exposing internal compaction artifacts.
- A throwaway compaction prototype before implementation.
- Migrating current experimental conversation state or guaranteeing behavior
  for removal and later restoration of one stable agent ID.
- Redesigning task archival, transcript retention, token accounting, run
  boundaries, or the overall task timeline beyond the retirement event.
- Separating retired conversations into another panel or adding visible
  `Current` badges to ordinary conversation rows.

## Further Notes

- Real project use supplied the decisive evidence: returned mentions and
  repeated column responsibility usually benefit from retaining the same
  task-and-agent reasoning context.
- The task remains the durable shared coordination record. Conversation
  continuity reduces needless repetition but does not make hidden model context
  authoritative over current task, process, or activation state.
- Long-lived context will still grow because genuinely new authored task text is
  delivered once. The design prevents automatic duplication; runtime compaction
  remains responsible for extending effective conversation length.
- Conversation retirement is deliberately explicit and somewhat conservative.
  Requiring settled work and a reason is preferable to silently rerouting queued
  activations before the user has seen their result.
