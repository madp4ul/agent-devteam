# Retention and test-alignment verification

Date: 14 November 2026.

## Delivered behavior

- Hosted publication and cleanup share a repository-wide queued job. Successful
  publication retains five eligible stable framework releases, protecting current
  and latest, and preserving Git tags, drafts, prereleases and unrelated releases.
- Hosted cleanup paginates and revalidates identity/latest immediately before
  deletion. Changed or uncertain targets are preserved. No real GitHub deletion
  was performed during implementation; all DELETE tests used a controlled API.
- Successful publication removes only its own temporary Actions transfer
  artifact in a separate Actions-write-only job. Failed/canceled-run artifacts
  expire after one day. Cleanup errors never undo a valid publication.
- Local startup serializes final install, selection, process pinning and pruning
  through the independent `release-usage.sqlite3` deployment-cache database.
  Managed unused installations are reclaimed; active/reused/inaccessible PIDs,
  lingering worker paths, unknown directories and uncertain legacy data survive.
- Legacy candidates are inventoried only after lease-aware bootstrap activation.
  Adoption requires all recorded baseline process identities to be proved gone.
  An omitted snapshot row or missing birth time for a potentially live PID is
  uncertainty, never deletion authorization. This allows eventual automatic
  cleanup after old users disappear, including after reboot.
- Complete locked dependencies remain bundled. Download size was accepted and
  no new package-manager/registry setup is required on the consuming project.

## Superseding comment contract

Issue 107, dated 10 November 2026, explicitly requires atomic rejection of
same-task executable self-mentions. Issue 82 still requires valid own progress
notes to remain in history while avoiding duplicate incremental delivery.
The obsolete self-activation test was replaced with rejection, corrected same-key
plain note, no extra activation, legitimate user-request continuation on the same
thread, and retained note history. Production runtime behavior was not changed.

Focused original test was red at the obsolete acceptance assertion. The revised
test and all 24 conversation/mention/cross-task cases passed. This resolves
[shared-release issue 04](../../shared-framework-releases/issues/04-restore-release-test-gate.md).

## Checks

- Full normal suite: **557 tests; 550 passed, 7 skipped, 0 failed**, 371.2 seconds.
  Real-model opt-ins unset; bounded file concurrency of two. This includes tagged
  ZIP generation, download and actual installed-host startup tests.
- Hosted retention: three public-HTTP regressions passed, covering full pagination,
  keep-five protection, changed latest/target and invalid latest stopping deletion.
- Local retention plus existing updater: three focused tests passed. Coverage
  includes live A during concurrent B starts, later A code loading, surviving A
  worker after parent exit, stale lease recovery and uncertain legacy identities.
- A real Windows directory junction inside old A prevented deletion; its outside
  sentinel survived. After removing the junction, later startup reclaimed A.
- The missing-baseline-evidence regression went red before its correction and
  green afterwards. No internal coordination database inspection was used for it.
- Typechecking passed, V2 launcher contract tests all five passed, workflow YAML
  parsed and its action permissions/queued concurrency were checked against the
  current official GitHub docs.
- Standards and Spec reviews: zero remaining findings, including the final
  temporary-artifact cleanup delta.

## Local setup and ownership

The reviewed bootstrap/helper were installed into the existing local cache.
Conservative legacy identities were recorded; the existing selected snapshot was
preserved and selection-only verification started no application host.
Because no hosted release exists yet, the expected warned-cache fallback remains.

Final V2 proof used a disposable prepared clone through the actual installed
bootstrap: paused startup, browser HTTP 200 and fixture-only state binding all
passed. The real V2 batch file remains unchanged; no live host was restarted.
The absent old `idle-games` checkout was not recreated or modified.

All additions remain unstaged. The user's accepted staged snapshot was preserved,
SHA-256 `BE2311A80EF017E77D96918AE1BD13A9AC5D2E675FA3F82977A52DCE59420170`.
No source commits, pushes, tags, global trust changes, actual remote deletions or
project-state cleanup occurred. First hosted publication awaits user-owned Git
actions; the prior stale-test blocker is now resolved.
