# Retain requested task timeline content

Status: accepted

## Decision

On 2026-10-13, user testing of the seeded example exposed page-height collapse
when scrolling upward and blank timeline regions after movement-map navigation
or native scrollbar dragging. The user clarified that loaded content should
remain present, accepting eventual rendering cost when they deliberately read
the full history. This supersedes ADR 0027's 150-record browser eviction policy.

Keep the initial 50-record selection and server page maximum of 150. Retain every
top-level page and nested attempt source already requested during this task view.
Merge direct source windows into retained evidence instead of replacing it.
Represent skipped ranges with compact explicit load controls; never reserve
large empty document heights for history that scrollbar movement cannot hydrate.
Keep source identities, historical references, disclosure state and selection
attached to retained evidence. Queries expose their durable record/source
sequence so equal-timestamp merges preserve authoritative ordering. Observed
adjacency distinguishes real skipped ranges from joins between loaded pages.
Refresh only the newest page and the directly
inspected historical page through bounded requests, rather than requesting the
entire accumulated timeline on every poll.

Map destinations still hydrate directly through indexed source queries. Real
rendered anchors determine alignment. User wheel, touch, pointer or navigation
key input cancels an in-progress source-scroll animation so manual scrolling
does not compete with programmatic navigation. Monotonic elapsed time avoids
negative progress from delayed animation-frame timestamps. Each frame recomputes
the rendered destination, and navigation stays active through final settlement
so polling anchors cannot undo alignment while the layout changes.

## Consequences

- Ordinary opening/polling stays inexpensive; DOM/memory grows with the history
  the user explicitly loads. Eventual stuttering after loading everything is an
  accepted trade-off, rather than a reason to silently discard requested pages.
- Native scrollbar movement covers actual retained content and short gap
  controls, avoiding empty regions and eviction-driven document collapse.
- Complete movement metadata and current controls/pins retain their independent
  contracts. Persistence schema and agent history budgets are unchanged.
- Browser coverage must exercise upward scrolling after more than three pages,
  repeated direct map jumps, gap loading and scrollbar movement in both themes.
