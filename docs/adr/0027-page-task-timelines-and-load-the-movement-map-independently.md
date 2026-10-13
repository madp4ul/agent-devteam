# Page task timelines and load the movement map independently

Status: accepted; browser retention policy superseded by
[ADR 0029](0029-retain-requested-task-timeline-content.md) on 2026-10-13.
The indexed paging, bounded server requests and independent map contract remain
in force; the original 150-record eviction/spacer policy below is historical.

Migration 0011 maintains compact task-scoped top-level records, grouped source
identities and movement metadata in the same SQLite transactions as original
evidence. It backfills existing authored history without rewriting it. Comments
and activity belong to their local attempt when immutable provenance proves
that ownership; external attempt comments remain independent. Lifecycle events
already folded by the timeline stay folded. Startup failures remain separate.
Provisional dispatch claims have no public attempt group until published, and
deleting a provisional attempt removes its projection. Archival retains task
timeline and movement history, while conversation archival remains unchanged.

Application queries select newest-first groups using `(occurred_at, sequence)`
and a signed task-scoped insertion watermark. Equal timestamps have a durable
tie-breaker. Default size is 50, maximum 150; nested attempt disclosure selects
50 sources and has independent signed backward cursors. Sources hydrate only
after selection, including whole authored messages and historical relationship
references. Current controls, all current pins, attention and total costs are
separate reads. Running attempt metadata refreshes inside the loaded window.
Direct source queries locate the containing group and nested source window
without fetching intervening history. Browser paging does not change agent
context composition or its checkpoint contracts.

The movement query reads only the compact movement projection. Every entry has
its source ID, containing group ID, sequence, timestamp, column and actor facts.
New movement journal entries snapshot column and actor labels. Older evidence
without snapshots uses durable IDs honestly; a later process rename must not
masquerade as a known historical label. The full map is inherently linear in
movement count; subsequent reads request only entries after its sequence cursor.
It never hydrates authored bodies or transcripts. Indexed counts and cost totals
can still aggregate compact retained evidence; response and hydration bounds
must be measured separately from these aggregate reads.

The browser keeps 150 top-level records at most, bounded nested disclosure,
reloadable edges and reading/selection anchors. Logical-position spacers reserve
space for evicted groups; their estimated height is not a claim of pixel accuracy
for unloaded variable-height history. Map geometry combines logical history
position with available real source anchors. Direct hydration then aligns the
actual source. Selection prevents eviction of selected evidence until cleared.
The desktop map starts loading only when its layout reveals it; unavailable
layouts make no request. Loading and retry stay local to the map. Only visible
maps poll deltas. Clicks, keyboard navigation and debounced scrub destinations
share bounded source navigation; queued requests coalesce to the latest source,
and generation checks reject stale responses across window changes and unmount.

This preserves complete journey navigation without retaining or rendering full
authored history. It deliberately allows compact complete map metadata, all
current pins and current unfinished controls to scale with their actual current
sets, rather than silently dropping destinations or actionable work.
