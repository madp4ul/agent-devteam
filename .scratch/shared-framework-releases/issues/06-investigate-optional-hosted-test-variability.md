# Investigate optional hosted test variability

Type: task
Status: open
Blocked by: none
Release blocking: no; ADR 0053 keeps behavioral verification local.

## Evidence

The v0.1.2 hosted test attempt
https://github.com/madp4ul/agent-devteam/actions/runs/43629210519
reported these failures before the fifteen-minute step limit:

- `a PID reused after acquisition cannot keep a crashed host's lock alive`:
  ownership stayed blocked after the five-second Windows process-inspection
  budget. Unknown ownership must remain protected; do not relax that guard.
- `1,000 no-progress failures retain one episode and bounded durable history,
  then recover unattended`: exceeded the added five-minute global test budget.
- `a shared release contains the tagged commit and ignores dirty working-tree
  edits`: its thirty-second extraction subprocess timed out under the runner
  workload. Building the actual tagged v0.1.2 ZIP succeeded locally.

The suite had reached top-level test 495 of 541 when its overall cap interrupted
it. The prior hosted run completed the suite in 667.6 seconds; local integrated
verification completed in 371.2 seconds with 550 passes and 7 expected skips.

## Scope if pursued

Measure Windows process startup and archive extraction under CI load; distinguish
resource contention from defects. Check the stress test's necessary workload and
budget without reducing its 1,000-retry coverage merely to obtain a pass. Preserve
unknown-owner safety and artifact validation. Any hosted behavioral workflow
must be separately approved and must not gate release publication by default.
