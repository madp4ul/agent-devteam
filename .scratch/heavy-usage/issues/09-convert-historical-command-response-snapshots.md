# 09 — Convert historical command-response snapshots safely

**Type:** task
**Status:** resolved — implementation, review and stopped-project maintenance complete
**Blocked by:** None — 08 resolved; user authorized stopped-project work on 2026-11-02.
**Specification:** [Compact durable command results](../active-command-response-storage-spec.md).

## What to build

Upgrade retained response snapshots into the accepted compact format without
losing historical retry protection or authoritative task/conversation evidence.
Prove safe migration and quantify actual disk reclamation on isolated stores,
then document a separate maintenance handoff for an explicitly stopped project.

## Acceptance criteria

- [x] Use the supported released migration/verified-backup lifecycle. Conversion
      and its ledger entry are atomic; failed verification leaves recoverable
      original data and names the recovery backup.
- [x] Derive receipts solely from each retained snapshot's historical facts. Cover
      relevant successes, conflicts, rejections, canonical aliases, lifecycle and
      unscoped records; unknown or insufficient shapes are never guessed away.
- [x] Original retry keys/request matching and exact compact replay remain correct
      after upgrade and restart. Preserve duplicate protection for old creation
      and relationship operations.
- [x] Verify unchanged authoritative facts, costs, history and recorded row
      identities, plus integrity and foreign keys, using representative old stores.
- [x] Measure before/after payload and isolated SQLite file size; distinguish
      reusable free pages, actual filesystem reclamation and retained backup bytes.
- [x] Verify the existing archived-owner expiry policy against converted records.
- [x] Document stopped-host/agent checks, exclusive maintenance locking, fresh
      verified backup, explicit compaction, post-checks and recovery procedure.
- [x] Relevant migration, retry, archival and restart regressions, typechecks and
      Standards/Spec review pass; leave implementation unstaged for user review.

## Operational boundary

The earlier issue-creation-only hold was explicitly lifted by the user on
2026-11-02 after stopping the project. Any actual-project conversion retains
stopped-host checks, exclusive ownership and fresh verified recovery evidence.

Do not operate on the user's running idle-game project under this ticket's
planning authorization. Applying the upgrade and shrinking that live file must
wait for a separately agreed maintenance window and a fresh verified backup.
The existing cleanup backup predates subsequent project work.

## Comments

2026-11-02: Completed implementation and actual-project maintenance after the user
stopped the host and lifted the hold. See the Answer below; no Git staging,
commits or pushes were performed, and automation was not started.

2026-11-02: User stopped the project and explicitly authorized work on both issues.
The previous implementation hold is lifted. Migration implementation follows issue
08's compact-result contract; any actual-project maintenance requires a fresh
verified backup, stopped host/agents and exclusive project-state ownership.

2026-11-01: User confirmed creation of tickets 08 and 09, explicitly deferring
work because the project remains running. Ticket 09 depends on delivery of 08
as well as a later instruction to proceed. No implementation or maintenance has
started under these tickets.

## Answer

Migration `0015_compact_historical_command_responses` streams retained responses
one row at a time, using the frozen V1 historical mapping. It updates only
supported response JSON; command keys, requests and row identities stay intact.
Malformed/unknown records and already-small unrelated command families are
preserved. Migration 0014 protects the new command contract from older packages.

Public application regression coverage now replays historical edit, movement,
relationship, conflict and archive/unarchive results after upgrade. Malformed and
unsupported matching-request records report retained-retry diagnostics rather
than execute again. Tests also cover pre-0013 aliases/collisions, NULL requests,
negative row identities, late conversion rollback with a verified original
backup, older-reader rejection, and measured isolated SQLite reclamation.

Final verification: **447 Node passes, six existing skips, zero failures**;
**22 browser passes**; typecheck, build and whitespace checks pass. Independent
Standards and Spec review each report zero remaining findings after corrections.
See [Node evidence](../tickets-08-09-node-tests-final.log),
[browser evidence](../tickets-08-09-browser-tests.log) and
[the operational guide](../../../docs/project-state-backup-and-restore.md).

### Idle-game maintenance

With the host stopped, no running attempts, and exclusive project-state ownership:

1. Created a fresh SQLite recovery copy and independently verified full integrity,
   foreign keys and ledger. Previewed the exact conversion on that backup.
2. Verified the unchanged source against exact response and authoritative-data
   fingerprints, then used the normal released database upgrade lifecycle. It
   created and verified its own additional pre-migration recovery copy before
   atomically applying 0014 and 0015.
3. Compared every converted result, key, request and row identity with the preview;
   compared all authoritative table contents and recorded row identities with the
   backup. Ran explicit offline VACUUM and repeated verification.

Results (decimal units):

- Live file: **11,029,708,800 -> 608,677,888 bytes** (11.03 GB -> 609 MB).
- Filesystem reclaimed: **10,421,030,912 bytes**, approximately **10.42 GB**.
- Response payload: **10,415,333,033 -> 8,836,032 bytes** (10.42 GB -> 8.84 MB).
- All **8,149** retry rows remain; **6,890** response records changed. Other small
  response families and already-compact records remain retained.
- Exact expected response hash:
  `6c764f68644ce790feb85355f1c7d7980ad141c5d54f8d7135ba11ce79f7eff1`.
- All authoritative fingerprints unchanged; integrity **ok**, foreign-key
  violations **0**; released ledger now ends at **0015**.
- Guard released, host left stopped, automation not started. Use the updated
  checkout on restart; older versions correctly reject the newer ledger.

Fresh verified backup:

`D:/Daten/Projekte/Software/Codex/idle-games-agent-coordination-state/coordination.sqlite3.pre-compact-receipts-2026-11-02T21-45-59.947Z.sqlite3`

Automatic verified migration backup:

`D:/Daten/Projekte/Software/Codex/idle-games-agent-coordination-state/coordination.sqlite3.pre-migration-2026-11-02T22-06-23.780Z-d1e099a5-89d6-46bd-8695-24d04fb15468.sqlite3`

The first backup's adjacent `.verification.json`, `.preview.json` and
`.maintenance-report.json` contain counts, ledger and exact fingerprints. Both
recovery copies are retained separately from the smaller live file; previous
backups were not deleted. The [one-off maintenance script](../run-compact-receipt-maintenance.mjs)
records the verified procedure and is bound to that specific pre-upgrade backup;
it is not a general product CLI or an instruction to rerun on an upgraded store.
