# Page whole history records at conversation checkpoints

Agent history merges immutable comments and substantive events into newest-selected,
oldest-rendered JSON pages. An approximate word target includes the whole boundary
record, never splitting authored text. Current shared pins are separate complete
guidance, not hidden in pagination. A project-signed cursor captures per-stream
upper watermarks and chronology positions; it survives restart without mutable
reading receipts or stale notifications. Origin titles in history use retained
attribution rather than mutable task titles so retries and counts stay stable.

Activation traversal stops once at the preceding composition checkpoint, even if
the requested amount is larger. Its returned cursor continues earlier history
without repeating the update page. This favors coherent contiguous discussion
over persistent unread gaps: the next activation advances through the whole
previous composition interval, regardless of optional retrieval. Counts describe
the exact projection being traversed, separately from full captured history.

Composition and checkpoint advancement commit atomically with the retained
activation payload. Migration 0007 adds per-conversation pin membership: net
absent/present sends a full comment, present/absent sends its ID, and unchanged
membership sends nothing even after toggles. Intermediate pin audits remain in
explicit history, not automatic updates. A retained recovery snapshot restores
complete current pins/recent history for a replacement thread; ordinary returning
prompts do not render it. Exact source data outside the page is separate and
positioned, while overlap with page/pin records uses an ID reference.
