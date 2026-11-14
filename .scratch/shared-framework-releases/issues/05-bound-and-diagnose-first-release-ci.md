# Bound and diagnose first-release CI checks

Type: task
Status: claimed
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
- Normal tests and publication succeed before declaring the release complete.
- Temporary diagnostic branch/instrumentation is removed after diagnosis.

## Changes

Release CI uses native canonical temporary roots, two concurrent test files,
five-minute test timeouts and TAP reporting. Its check step is limited to fifteen
minutes and build job to thirty minutes. The lifecycle test registers cleanup
before assertions and includes the complete archival result in failures.
The operating guide documents these safeguards and agent-assisted publication.
