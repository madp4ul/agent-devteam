# 0040 — Resume without waiting for automation drain

Status: Accepted

## Context

Pause prevents new dispatch while existing agents and workspace preparations
finish. Previously, the user could not reverse that decision until all work
settled. Allowing Resume alone would not solve this: the pump had already left
its scheduling loop and awaited every active completion.

## Decision

Treat pausing as current dispatch intent, not a prohibition on Resume. Apply the
ordinary configuration, runtime and process-approval checks, record running
intent, then wake the existing pump if it still owns work. Do not create a second
pump or interrupt any existing attempt.

While draining, the pump remains wakeable but claims no work and schedules no
retry timers. It waits on owned completions or a command wakeup. Resume makes
normal eligibility apply again immediately; suspension, failed/interrupted
heads, retry deadlines and stale process work retain their existing guards.
Completion sets paused only while the latest intent is still pausing.
Successful pump settlement releases ownership before honoring a pending kick, including
a command arriving between the loop's final check and promise settlement. That
kick still checks running intent and host closure before starting another pump.
Rejected settlement only releases ownership and propagates its fatal error to
the pause handler; it must not launch replacement work.

The existing top-bar action offers Resume during draining, with a visible
finishing-work label. Its normal resume eligibility remains authoritative.
Startup continues to be paused. No durable schema or runtime cancellation
contract changes.

## Verification

Controlled application and HTTP tests hold one agent open while unrelated work
starts after Resume, exercise repeated toggles and last-completion races, retain
a prepared workspace across a later pause, and preserve interrupted-task
suspension. Browser tests cover keyboard activation and contrast in both themes.
