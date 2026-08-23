# 08 — Simplify Agent Conversation Presentation

**What to build:** Make the agent conversation read as one calm, continuous
exchange instead of a stack of visually distinct runs and differently styled
execution records, taking the Codex conversation presentation as the primary
directional reference.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Remove run boundaries completely from the conversation view. Do not show
  run containers, separators, headings, badges, or disclosures in its reading
  flow. Preserve the underlying run and attempt identity for attribution,
  diagnostics, recovery, and inspection through other surfaces such as the task
  timeline.
- [x] Replace per-run `Input` and `Output` values with one compact
  conversation-level indication of how much of the model context window is
  already occupied before the next activation appends more content.
- [x] Do not retain an input/output split merely because the current attempt
  usage model provides one; the visible measure should explain remaining
  context capacity rather than attempt cost or historical token throughput.
- [x] Determine which runtime value can authoritatively represent current
  context-window occupancy for a continued conversation. Do not label a sum of
  cumulative attempt usage as context occupancy if repeated calls, cache
  accounting, compaction, or replacement threads make that interpretation
  inaccurate.
- [x] Prefer an authoritative runtime-provided occupancy value. If the
  supported runtime cannot provide one, omit token figures from the
  conversation in the initial implementation rather than displaying an
  estimate, cumulative thread usage, or another misleading substitute. Retain
  the long-term requirement to restore the indicator when trustworthy data
  becomes available.
- [x] Keep the existing accumulated conversation cost estimate in the fixed
  conversation header with its current presentation. Remove any run-level cost
  or token readouts from the scrollable conversation along with the run
  presentation.
- [x] Present user-authored messages and activation prompts as right-aligned
  chat elements with a restrained maximum width, leaving visible space on their
  left.
- [x] Start desktop tuning with user and activation elements at roughly 70–75%
  maximum width while agent prose may use the full reading width. Treat the
  exact desktop ratio as a visual-tuning outcome rather than a product
  invariant.
- [x] At narrow widths, allow every conversation element to use the full
  available width rather than preserving asymmetry at the cost of cramped text.
- [x] Give activation prompts the same geometry and visual family as authored
  user messages, but identify them with one quiet `Activation` text label so
  framework-generated content is not presented as user-authored text.
- [x] Begin the conversation with a visible activation element representing
  the originating activation rather than beginning directly with the agent's
  output. Add the same kind of element for every later ordinary activation in
  that conversation.
- [x] Treat an authored user follow-up as the visible cause of its own
  activation; do not render a second, duplicative activation element beside the
  message. Retries and continuations of one activation likewise reuse its
  existing visible cause.
- [x] Activation elements show a concise human-readable trigger and any
  directly authored source content that caused the activation. For example,
  describe a column entry or final-blocker clearance, and include the source
  comment for an agent mention.
- [x] Never render the framework-composed activation prompt as conversation
  content. Process instructions, task snapshots, authoritative bootstraps,
  retry context, and other injected runtime material remain internal.
- [x] Remove repeated visible speaker labels from ordinary authored user and
  agent messages. Alignment communicates the speaker, and the fixed header
  identifies the conversation's agent; only activation prompts retain their
  provenance label.
- [x] Retain the existing message copy controls for the initial redesign.
  Hover-only or focus-only disclosure may be considered later but is not part
  of this issue.
- [x] Present agent messages left-aligned and allow them to use substantially
  more of the available width so prose, code, and other detailed output remain
  readable.
- [x] Use bare agent prose as the initial low-clutter baseline: render it
  directly on the conversation background without a card, outline, colored
  rail, or tinted surface. Treat this as the starting point for visual review,
  not a requirement to retain an unsuccessful treatment after browser tuning.
- [x] Use alignment and width as the main distinction between user or
  activation content and agent content instead of layering several competing
  colors, borders, and background treatments.
- [x] Present every non-message tool event—including model-issued shell
  commands, generic runtime tools, and coordination MCP calls—with the same
  muted visual family: a quiet surface close to the surrounding background, a
  subtle outline, and no colored left rail. Different transports and content
  density must not imply different visual importance.
- [x] Retain the useful information currently rendered for coordination MCP
  calls. Rich evidence such as a comment body rendered as Markdown may remain a
  large element, but its container should attract no more attention than a
  shell-command element.
- [x] Preserve the existing default disclosure and information behavior for
  shell commands, generic MCP calls, and specially presented coordination
  calls. This redesign changes their visual hierarchy, not which evidence is
  initially visible or reachable.
- [x] Let content determine the size of command and MCP-call elements: compact
  shell-command summaries can remain small while richer coordination evidence
  uses the space needed to stay readable.
- [x] Make agent messages the only conversation elements that sit more strongly
  in the foreground than the shared muted tool-call treatment.
- [x] Keep ordinary diagnostic evidence within the muted secondary family.
  Distinguish actual warnings and failures with only a subtle red outline or
  similarly restrained semantic cue; do not restore a colored left rail or a
  visually dominant alert card.
- [x] While an activation is queued or running, show one quiet transient status
  line at the end of the conversation, such as `Agent is working…`. Remove it
  when the work settles. Do not replace run headings with completed statuses,
  run numbers, durations, or another enclosing run element.
- [x] Render conversation retirement and thread-continuity loss as compact,
  full-width system notes that remain visually separate from messages and tool
  evidence without forming run boundaries. Retirement is neutral and muted;
  continuity loss uses the restrained warning treatment.
- [x] Keep a retirement note at its chronological position even when later
  explicit follow-ups continue the retired conversation. Retirement ends
  automatic reuse, not the lineage or its explicit continuability.
- [x] Make each timeline `View conversation` action scroll to and focus the
  visible element that caused the selected activation: the originating or
  later activation element for ordinary activations, or the authored user
  message for a follow-up activation. Attempts and retries for the same
  activation target the same cause rather than highlighting their output as a
  run group.
- [x] Keep secondary execution evidence available where it remains valuable,
  but make ordinary conversational content the visual priority and avoid
  recreating run boundaries through tool and command decoration.
- [x] Add a dedicated right-side gutter between the scrollable conversation
  content and its vertical scrollbar so the scrollbar never overlaps or
  touches messages, tool evidence, or controls at any supported viewport size.
- [x] Redesign the follow-up composer to reuse the compact Add comment layout:
  place `Send follow-up` inside the textarea footprint at its lower-right
  rather than giving the button an otherwise empty action row.
- [x] Keep the follow-up composer sticky at the bottom of the conversation
  viewport while history scrolls beneath its own scroll container, so the user
  can write a follow-up while reading older content.
- [x] Render the sticky composer only while continuation is available. When an
  archived task, unavailable owner, missing thread, or another authoritative
  condition prevents continuation, omit the composer instead of showing a
  disabled control and explanation in its space.
- [x] Preserve the existing ability to submit follow-ups while earlier work is
  running or queued. The composer remains usable and each submission enters the
  normal activation order; the transient live-state line communicates that
  earlier work is still in progress.
- [x] Reserve enough trailing space in the scrollable history that the sticky
  composer never obscures the last message, tool evidence, unavailable-state
  explanation, or submission error.
- [x] Do not require textarea auto-growth for this redesign. Keep vertical
  manual resizing as the fallback and cap the composer's maximum height so it
  cannot crowd the readable conversation out of the viewport. Reuse shared
  auto-growth behavior only if it materially simplifies the implementation and
  preserves the same bounded footprint.
- [x] Verify the calmer hierarchy, readable contrast, content width, control
  spacing, and absence of overlap in both dark and light themes and at desktop
  and narrow viewport widths.
- [x] Add browser coverage for the chosen message alignment, any revised
  evidence pattern, absence of misleading token figures, and scrollbar
  clearance.

## Direction

The conversation should feel closer to Codex: user contributions and quietly
labeled activations form compact, right-aligned chat blocks, while agent
responses begin on the left and can stretch across the reading area. That
asymmetry should provide enough immediate role separation that each item does
not also need a strong colored rail, distinct background, and run container.

An activation element is the visible start of each ordinary conversational
turn, including the conversation's first turn. Timeline navigation targets this
cause. A user follow-up is already the authored cause of its turn, so rendering
both the message and an activation card would duplicate the same event.

Retirement and continuity loss are lineage events rather than conversational
speakers. They use visually separate full-width notes. A retirement note may
appear between turns because the user can still explicitly continue the retired
conversation afterward.

All non-message tool activity forms one secondary evidence family. Shell
commands, generic runtime tools, and coordination MCP calls use the same muted,
subtly outlined container without a colored left rail. Coordination calls keep
their current rich content where useful; they may be larger than shell-command
elements without becoming more visually prominent.

Agent messages initially use no surrounding container at all. This deliberately
starts from the quietest plausible treatment so visual review can add only the
separation that proves necessary.

The follow-up composer remains reachable at the bottom of the visible
conversation while the reader scrolls through history. Its send action sits
inside the textarea footprint, following the existing Add comment pattern, and
the history provides explicit clearance rather than scrolling underneath an
obscuring control. Conversations that cannot be continued show no composer.

The conversation is now continued across activations, so per-run token figures
no longer answer the most useful question in this surface. The desired visible
signal is the context already carried into the next activation—or an equivalent
honest indication of context-window pressure—not a split between historical
input and output volume.

Codex SDK completed usage is cumulative processing across the thread, not the
tokens currently occupying one model call's context. Reused history may be
counted on several calls, while compaction can reduce current occupancy without
reducing cumulative usage. Consequently, no visible token value is preferable
to repurposing that snapshot as a context gauge. This is an interim omission,
not a decision that conversations never need context-pressure feedback.

The existing conversation-level monetary estimate remains in the fixed header.
Because it sits outside the scrollable history and appears only once, it does
not contribute to the repeated run clutter this issue removes.

## Context

This direction supersedes the conversation specification's earlier presentation
of visible run boundaries and attempt-scoped token usage. The updated
specification retains underlying attempt identity and durable usage evidence for
diagnostics, recovery, timeline attribution, and accumulated cost without
exposing those run groupings in the conversation.

Run boundaries are intentionally absent from the conversation view rather than
collapsed behind an in-place disclosure. Run-level inspection remains a concern
of other surfaces; reopening that evidence must not visually fragment the
conversation.

This issue began as an initial product-design capture. Its visual values should
still be tuned during the real implementation, but no throwaway prototype is
required before delivery.

Archived-conversation transcript retention remains governed by the existing
archive semantics and is not redesigned here.

## Answer

Implemented the calmer continuous conversation presentation directly in the
real browser UI. The conversation query now exposes one canonical,
activation-ordered history stream rather than parallel run, message, and
presentation structures. Run containers and per-run metrics are absent;
authoritative context-window occupancy remains omitted because the installed
runtime does not provide it, while the fixed conversation cost badge remains.

Authored messages and activation causes are right-aligned, agent prose uses the
full reading width, and command, generic runtime, MCP, and coordination evidence
share one muted outlined family with consistent restrained exceptional-state
outlines. Retirement and genuine thread-continuity loss remain distinct system
notes, and timeline navigation focuses the activation cause shared by retries.

The follow-up composer is sticky with its send action embedded in the textarea,
bounded manual resizing, trailing-content and scrollbar clearance, and complete
omission when continuation is unavailable. Browser coverage verifies desktop
and narrow alignment, dark and light appearances, evidence hierarchy, warning
styling, token omission, composer geometry, and scrollbar clearance.

Follow-up visual tuning also removes the residual themed shadow from bare agent
prose, gives diagnostics a uniform four-sided warning outline, places authored
message copy controls in a compact right-side column, and moves coordination
comment history navigation into the tool header. Collapsed Markdown now ends at
a complete rendered line, and timeline navigation gives the selected activation
cause visible focus after scrolling it into view.

Final conversation-specific tuning removes authored-comment truncation and its
Show More / Show Less control from the transcript so comments always show their
full authored text. The sticky follow-up textarea uses an inset focus outline
so its highlight stays fully visible inside the dialog frame.
