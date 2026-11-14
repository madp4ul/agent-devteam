# Batch live transcript writes before acknowledging events

Status: accepted

The Codex worker already waits for the host before delivering its next event.
The runtime awaits the application transcript writer at that boundary. The host
collects pending updates for four milliseconds and commits up to eight per
transaction. The FIFO queue yields between batches, so SQLite flush overhead is
shared across concurrent attempts without letting an arbitrarily long batch
occupy the event loop. Other runtime adapters can still record an item directly.

The host publishes each item using the same running-attempt ordinal and retains
the provisional-probe promotion check in the same transaction. A failed batch
rejects each pending acknowledgement. The worker cannot advance before commit,
and settlement still reads the complete runtime transcript. The journal mode,
sync policy and crash recovery remain unchanged.

In a disposable six-attempt paced probe, 960 items of 16 KiB each previously
required about 989 commits including HTTP writes and settlement. Batching
reduced that run to 225 commits. The slowest HTTP request was 229 ms in the
first post-change sample, compared with 770 ms in the instrumented prior run.
These are fixture measurements and do not establish the cause of the original
two-minute incident.
