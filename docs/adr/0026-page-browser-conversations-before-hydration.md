# Page browser conversations before hydration

Status: accepted

Browser conversation history has an independent, indexed item projection in
released migration 0010. Attempt transcript ordinals identify whole runtime
items, including updates to running tools. Causes, continuity loss, interruption
resumes and retirement occupy stable positions alongside them. The position
orders source timestamp, activation sequence, attempt row identity, item phase
and ordinal; equal timestamps therefore retain activation order, and each resume
stays after its interrupted attempt. Original authored messages and transcript
JSON remain authoritative evidence; migration backfills the projection without
rewriting or deleting those sources. Archive deletes the corresponding detailed
projection through the existing archival transaction, including live streams
that never reached a final transcript snapshot.

The application selects at most 50 records by default, with a finite maximum of
150, before hydrating sources and attachments. It looks up the originating
activation directly and limits its disclosed attempts to 50. Attempt, authored
message and pending activation links resolve an indexed window directly; empty
attempts fall back to their activation cause. Browser queries never call the
complete transcript reader. The Codex stream publishes individual changed items
through its application lifecycle port, which records them in the existing
application-owned transaction. Settlement reconciles the final retained array.

Backward/forward cursors are authenticated with the durable project history
secret and scoped to the conversation. A fixed insertion watermark excludes
later records from backward traversal. Refresh cursors renew that watermark
and update running items within the loaded window. This is separate from agent
history cursors and activation composition checkpoints: browser paging is not
evidence that an agent received context.

The browser retains a single window of at most three pages. Moving an edge
fetches a 50-record edge then a bounded 150-record overlapping window. Measured
eviction spacers and durable DOM record anchors preserve the reader's position;
unknown unloaded heights are not presented as exact. Selections protect their
endpoint records from eviction until cleared. Only readers at the latest bottom
follow fresh content; older readers refresh their current window and can load
later content independently. Request sequencing rejects stale responses. Read
errors retain loaded history and retry the requested direction.

Costs remain complete conversation totals, independent of the loaded window.
Their existing cumulative-thread pricing aggregation reads compact usage and
pricing evidence for all attempts; it never loads transcript payloads. This
remaining linear aggregate cost is measured separately for large attempt counts
instead of silently treating a visible-page total as authoritative.
