# Bound and diagnose first-release CI checks

Type: task
Status: resolved
Blocked by: none

## Problem

The first `v0.1.0` publication run reported a failed archival assertion, then
remained in the test step without advancing for twelve minutes. The user noticed
the failure in the live log. Polling only the job's in-progress state concealed
that failure. Publication must remain gated on passing tests, and stalled checks
must have bounded execution and useful failure diagnostics.

## Findings

- Original run: https://github.com/madp4ul/agent-devteam/actions/runs/43622350427
  (canceled after observing the stalled output; nothing published).
- Isolated CI reproduction: `workspace-registration-invalid`, not an obsolete
  assertion or a failed migration. Fixtures used `C:\Users\RUNNER~1\...`; Git and
  asynchronous native realpath reported `C:\Users\runneradmin\...` instead.
- The same test passes locally, including with CI's Node 24.22.2 and Git
  2.56.0.windows.4. Excluding developer Git configuration did not reproduce it.
- A deliberately failed local archival assertion exited promptly before and
  after adding cleanup. Missing cleanup alone is not proven to explain the
  stalled suite. Other tests can await events that never arrive after a fixture
  path mismatch, and ordered reporter output can hide their progress.
- JavaScript `realpathSync` preserved the Windows 8.3 spelling. Using
  `realpathSync.native` when exporting `TEMP` and `TMP` corrected fixture paths.
  The previously failing test passed on the same hosted runner:
  https://github.com/madp4ul/agent-devteam/actions/runs/43624497609

## Acceptance

- Canonical temporary roots apply to all release test/build steps.
- Production path ownership, registration and archival protections stay intact.
- Test failures include assertion diagnostics without waiting for the entire
  suite to end; test execution and the check/build steps have explicit limits.
- The lifecycle test always closes its application and reports archival rejection
  details rather than only `false`.
- Relevant local validation and package publication succeed before declaring the
  release complete. Hosted behavioral tests are not a release gate (ADR 0053).
- Temporary diagnostic branch/instrumentation is removed after diagnosis.

## Changes

Release CI uses native canonical temporary roots, two concurrent test files,
five-minute test timeouts and TAP reporting. Its check step is limited to fifteen
minutes and build job to thirty minutes. The lifecycle test registers cleanup
before assertions and includes the complete archival result in failures.
The operating guide documents these safeguards and agent-assisted publication.

## Second gate: generated snapshot line endings

Both the corrected `v0.1.1` run and the diagnostic suite completed with 557 tests:
549 passed, 1 failed, 7 skipped, none canceled. The sole failure was `fresh startup
applies the released migration registry and matches the current schema snapshot`.
The generated schema was LF while Git's Windows checkout converted the reviewed
snapshot to CRLF. This was a byte-format failure, not a different schema or a
failed database migration.

Changing only the local snapshot to CRLF reproduced that exact assertion failure
in about half a second; the original file was restored immediately. A targeted
`.gitattributes` rule now keeps only this generated SQL snapshot as LF. A real
`git -c core.autocrlf=true checkout-index` into disposable scratch space preserved
LF with that rule, and the original migration test passed unchanged. No migration
registry entry, SQL definition, runtime schema guard or test assertion was relaxed.

The corrected candidate is `v0.1.2`; canceled/failed `v0.1.0` and `v0.1.1` tags
remain intact and have no published release objects.

## User refinement: local tests, hosted packaging

The user explicitly asked to stop repeating the local suite in release CI and
prioritize the isolated published runtime. ADR 0053 supersedes the hosted-test
gate described above. The workflow now builds/verifies/publishes only. Existing
local verification includes the full normal suite (550 passed, 7 skipped), local
typechecking, the unchanged schema assertion after LF checkout, and a successful
exact-tag v0.1.2 application ZIP build (219,498,915 bytes).

The hosted v0.1.2 test run also exposed runner-sensitive process-inspection and
archive-command timeouts, and the 1,000-retry stress test exceeded five minutes.
Its overall test step reached its fifteen-minute cap. These are not claimed as
passing or fixed; investigate separately if hosted behavioral CI is desired.
No application source changed after the verified v0.1.2 build. Dispatch the
current-main packaging workflow for that same unpublished tag; do not retag or
require another test run before publishing it.

## Answer

Published https://github.com/madp4ul/agent-devteam/releases/tag/v0.1.2 from commit
`b12ced79d4d2ee1545959f786f9b1281281e5deb`. ZIP size: 219,498,915 bytes;
SHA-256: `c334bd61292cf65239121824a16db8cae14e56bf08bee4d0d57809b4308e8b96`.

The packaging-only workflow's build and installed verification passed. Its
publishing job received HTTP 403 from the workflow token; the releasing agent
used existing maintainer authentication to upload the independently verified
local exact-tag ZIP and checksum to a draft, checked the server digest and
published it as latest. Retention completed successfully with one release and
no deletions. That workflow is not reported as green.

The installed self-contained launcher then downloaded the public release and
selected `agent-devteam-releases/releases/v0.1.2`. The installed CLI validated
the actual Autonomous V2 process definition. Its existing batch file still
invokes the process launcher, which resolves that installed release once. No
real project host was started or restarted. The temporary diagnostic branch and
its local instrumentation/logs were removed. Remaining hosted test variability
is tracked in issue 06; publication-token follow-up is tracked in issue 07.
