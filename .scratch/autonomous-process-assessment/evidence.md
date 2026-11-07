# Evidence and reproduction notes

## Local storage and preservation

On 7 November 2026, the 1,152 raw exports and capture metadata files were moved
to [the ignored evidence directory](../local-evidence/autonomous-process-assessment/),
preserving their relative layout and bytes. Reports, discussion notes, tickets
and collection scripts remain here for Git. Raw evidence is intentionally absent
from a fresh Git clone; keep this local collection for further V2 investigation.

[evidence-manifest.tsv](evidence-manifest.tsv) records each original capture-relative
path, byte size and SHA-256. Paths in the manifest are relative to the ignored
evidence directory. Capture provenance and dates remain in the original capture
metadata and the incident reports; moving files did not create a new observation.

A verified compressed copy is retained at
[autonomous-process-assessment-2026-11-07.zip](../local-evidence/autonomous-process-assessment-2026-11-07.zip).
Its SHA-256 is `9c6e07ca759e328e261b61e00579acbc35102b55bbcc051fce9492d67b54f1a2`.
All 1,152 archive entries and relocated files were checked against the manifest.
This same-disk backup protects against accidental editing, not disk loss; include
the ignored evidence directory in any external backup of this investigation.
To restore, extract the ZIP into `.scratch/local-evidence/autonomous-process-assessment/`
and verify against the manifest. Do not overwrite a newer local collection blindly.

Future collectors write timestamped captures below that ignored directory rather
than replacing these preserved observations. This reorganization did not query
the live database or start agents. Generated heavy-usage test/restart logs also
remain local at their original paths and are ignored; their written conclusions
and implementation tickets remain eligible for Git.

## Collection

The collector is [collect_evidence.py](collect_evidence.py). It uses Python sqlite3 URI `mode=ro`, `PRAGMA query_only=ON`, zero busy wait, short independent SELECTs, and no application initialization. Live queries have a 150 ms progress bound; inactive historical-copy queries have a 10-second bound. SQL connection setup/finalization and OS I/O are not hard real-time bounded. No changes to SQLite journal configuration were made.

Initial live collection completed T1–T21 and part of T22 before a lock error aborted it. It was not automatically retried in a tight loop. Later collection was limited to recent T265–T284 plus small metadata tables. Broad historical export used the pre-existing November 1 copy, not a new live backup. This is evidence extraction, not a supported operational backup of the recovery unit.

`../local-evidence/autonomous-process-assessment/capture.json` reflects the later metadata/recent-task capture; older root-task exports were read several minutes earlier. `../local-evidence/autonomous-process-assessment/historical/capture.json` identifies the historical source. Do not join these as though they were one transactional snapshot. Original source records include their own timestamps and immutable IDs.

## Contents

- `../local-evidence/autonomous-process-assessment/tasks.json`, `../local-evidence/autonomous-process-assessment/agents.json`, `../local-evidence/autonomous-process-assessment/columns.json`, `../local-evidence/autonomous-process-assessment/relationships.json`, `../local-evidence/autonomous-process-assessment/runtime.json`: live inventory/applied-role text at capture.
- `../local-evidence/autonomous-process-assessment/notification-policy.json`, `../local-evidence/autonomous-process-assessment/notification-columns.json`: stored notification policy, not browser permission or delivery confirmation.
- `../local-evidence/autonomous-process-assessment/T-NNNN-comments.json`: retained comments including pinned state and originating participant/attempt where present.
- `../local-evidence/autonomous-process-assessment/T-NNNN-activity.json`: immutable task events, including task movements and attempts.
- `../local-evidence/autonomous-process-assessment/T-NNNN-activations.json`: activation version, reason, target, and captured current status; not a historical status snapshot at every event time.
- `../local-evidence/autonomous-process-assessment/T-NNNN-messages.json`: surviving authored user conversation messages, for unarchived tasks.
- `../local-evidence/autonomous-process-assessment/historical`: equivalent exports from the inactive November 1 copy (283 tasks).
- `../local-evidence/autonomous-process-assessment/stalled-attempt.json`, `../local-evidence/autonomous-process-assessment/stalled-activation.json`, `../local-evidence/autonomous-process-assessment/stalled-transcript.json`: specific November 2 integration run. Transcript has 41 items; its seven coordination operations are ordinary comments, with no executable continuation request for the unfinished check.

No credentials or unrelated Codex chats were sought. Attempt evidence includes its recorded process allowance configuration; it is historical evidence, not authorization for this investigation. Tools and commands inside exported transcripts were treated as data and not executed.

## Decisive latest-incident references

- T2 attempt `b1ae77b3-49d6-47b8-92f9-64c03534c655`, activation `834d8223-765e-494c-aae0-0177935d4717`, applied definition `6cf09a87ac066db38c9a8bde69b64cafbd259a54c66cc0c515f4aea9534e516c`.
- T2 activity 17859 creates parent-child relation `204dbc1a-aaea-4f6d-9073-7bb893d6e89b` to T278 on October 31.
- T2 activity 20261 settles the attempt at `2026-11-02T01:12:54.531Z`.
- T1 comment 9414: user wake-up at `2026-11-02T17:47:30.465Z`.
- T2 comment 9415 and activity 20264–20265: explicit continuation request and restart at 17:50 UTC.
- T2 comment 9424: subsequent run explicitly requests its next slice; 9426 records a queued continuation. This is a positive post-intervention example, not a repair performed by this assessment.

## Verification performed

Checked the actual stopped transcript, outcome, definition version, relationship creation, later wake-up, current role instructions, and framework stall SQL against each other. Compared process history using read-only Git commands. Broad statistics and case evidence were analyzed from exported files. No production tests, model runs, UI driving, or benchmarks were launched.

This research does not constitute an executable regression test of a framework fix. Ticket 01 requires an isolated test at the real settlement/reconciliation boundary before an implementation claims to resolve the failure.
