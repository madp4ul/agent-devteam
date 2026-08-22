# 08 — Simplify Agent Conversation Presentation

**What to explore:** Make the agent conversation read as one calm, continuous
exchange instead of a stack of visually distinct runs and differently styled
execution records, taking the Codex conversation presentation as the primary
directional reference.

**Blocked by:** None

**Status:** open — needs refinement before implementation

- [ ] Remove run boundaries completely from the conversation view. Do not show
  run containers, separators, headings, badges, or disclosures in its reading
  flow. Preserve the underlying run and attempt identity for attribution,
  diagnostics, recovery, and inspection through other surfaces such as the task
  timeline.
- [ ] Replace per-run `Input` and `Output` values with one compact
  conversation-level indication of how much of the model context window is
  already occupied before the next activation appends more content.
- [ ] Do not retain an input/output split merely because the current attempt
  usage model provides one; the visible measure should explain remaining
  context capacity rather than attempt cost or historical token throughput.
- [ ] Determine which runtime value can authoritatively represent current
  context-window occupancy for a continued conversation. Do not label a sum of
  cumulative attempt usage as context occupancy if repeated calls, cache
  accounting, compaction, or replacement threads make that interpretation
  inaccurate.
- [ ] Prefer an authoritative runtime-provided occupancy value. If the
  supported runtime cannot provide one, omit token figures from the
  conversation in the initial implementation rather than displaying an
  estimate, cumulative thread usage, or another misleading substitute. Retain
  the long-term requirement to restore the indicator when trustworthy data
  becomes available.
- [ ] Present user-authored messages and activation prompts as right-aligned
  chat elements with a restrained maximum width, leaving visible space on their
  left.
- [ ] Give activation prompts the same geometry and visual family as authored
  user messages, but identify them with one quiet `Activation` text label so
  framework-generated content is not presented as user-authored text.
- [ ] Present agent messages left-aligned and allow them to use substantially
  more of the available width so prose, code, and other detailed output remain
  readable.
- [ ] Use bare agent prose as the initial low-clutter baseline: render it
  directly on the conversation background without a card, outline, colored
  rail, or tinted surface. Treat this as the starting point for visual review,
  not a requirement to retain an unsuccessful treatment after prototyping.
- [ ] Use alignment and width as the main distinction between user or
  activation content and agent content instead of layering several competing
  colors, borders, and background treatments.
- [ ] Present model-issued shell commands and coordination MCP tool calls with
  the same muted visual treatment: a quiet surface close to the surrounding
  background, a subtle outline, and no colored left rail. Their different
  content density must not imply different visual importance.
- [ ] Retain the useful information currently rendered for coordination MCP
  calls. Rich evidence such as a comment body rendered as Markdown may remain a
  large element, but its container should attract no more attention than a
  shell-command element.
- [ ] Let content determine the size of command and MCP-call elements: compact
  shell-command summaries can remain small while richer coordination evidence
  uses the space needed to stay readable.
- [ ] Make agent messages the only conversation elements that sit more strongly
  in the foreground than the shared muted tool-call treatment.
- [ ] Keep secondary execution evidence available where it remains valuable,
  but make ordinary conversational content the visual priority and avoid
  recreating run boundaries through tool and command decoration.
- [ ] Move the task bar or its conversation-adjacent controls far enough away
  from the scrollable conversation content that they never cover messages or
  evidence at any supported viewport size.
- [ ] Redesign the follow-up composer to reuse the compact Add comment layout:
  place `Send follow-up` inside the textarea footprint at its lower-right
  rather than giving the button an otherwise empty action row.
- [ ] Keep the follow-up composer sticky at the bottom of the conversation
  viewport while history scrolls beneath its own scroll container, so the user
  can write a follow-up while reading older content.
- [ ] Reserve enough trailing space in the scrollable history that the sticky
  composer never obscures the last message, tool evidence, unavailable-state
  explanation, or submission error.
- [ ] Do not require textarea auto-growth for this redesign. Keep vertical
  manual resizing as the fallback and cap the composer's maximum height so it
  cannot crowd the readable conversation out of the viewport. Reuse shared
  auto-growth behavior only if it materially simplifies the implementation and
  preserves the same bounded footprint.
- [ ] Verify the calmer hierarchy, readable contrast, content width, control
  spacing, and absence of overlap in both dark and light themes and at desktop
  and narrow viewport widths.
- [ ] Add browser coverage for the chosen message alignment, any revised
  evidence pattern, conversation-level context display, and task-bar clearance
  once the design is defined.

## Direction

The conversation should feel closer to Codex: user contributions and quietly
labeled activations form compact, right-aligned chat blocks, while agent
responses begin on the left and can stretch across the reading area. That
asymmetry should provide enough immediate role separation that each item does
not also need a strong colored rail, distinct background, and run container.

Shell commands and coordination MCP calls form one secondary evidence family.
Both use the same muted, subtly outlined container without a colored left rail.
Coordination calls keep their current rich content where useful; they may be
larger than shell-command elements without becoming more visually prominent.

Agent messages initially use no surrounding container at all. This deliberately
starts from the quietest plausible treatment so visual review can add only the
separation that proves necessary.

The follow-up composer remains reachable at the bottom of the visible
conversation while the reader scrolls through history. Its send action sits
inside the textarea footprint, following the existing Add comment pattern, and
the history provides explicit clearance rather than scrolling underneath an
obscuring control.

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

## Questions to Resolve

- Which currently displayed item is the “task bar,” and under which viewport,
  scroll position, or conversation state does it overlap content?
- Which tool-call details and command outputs should be visible by default,
  collapsed, or available only through disclosure?
- Is an authoritative context-occupancy value available after compaction and
  thread replacement? If so, should the UI show a count, a fraction of the
  model limit, a progress indicator, or only a warning near a threshold?
- Which existing non-conversation surfaces must retain run metadata for
  debugging and timeline attribution?

## Context

This direction deliberately revisits the existing conversation specification,
which currently asks for visible run boundaries and attempt-scoped token usage.
Do not treat those older presentation decisions as acceptance criteria for this
work. At the same time, do not remove the underlying attempt identity or durable
usage evidence until the diagnostic, recovery, and projection consequences have
been evaluated.

Run boundaries are intentionally absent from the conversation view rather than
collapsed behind an in-place disclosure. Run-level inspection remains a concern
of other surfaces; reopening that evidence must not visually fragment the
conversation.

This issue is an initial product-design capture, not an implementation-ready
specification. Refine it through discussion or a prototype before converting
the direction above into final acceptance criteria.
