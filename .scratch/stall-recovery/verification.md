# Stall recovery implementation verification

Implemented tickets 01–03 against [the specification](spec.md) and
[ADR 0023](../../docs/adr/0023-recover-tasks-without-continuation-paths.md).

## Acceptance evidence

The public application tests in `test/application/stall-recovery.test.ts` exercise
real command transactions, the scheduler, runtime requests, attention projections,
and controllable clocks. The runtime is controlled at its external boundary.

| Spec scenario | Passing evidence |
| --- | --- |
| 1–2: immediate watcher recovery and three-run escalation | Attributable recovery budget test; prompt, distinct notification, single attention, and no fourth recovery |
| 3: ordinary continuation resets | Mention created during recovery, ordinary handoff, then recovery 1 |
| 4: waiting suppresses recovery | Parent waiting on user-owned child; normal mention still runs; removing the last wait wakes recovery |
| 5: satisfied/reopened relationships | Retained satisfied edge permits recovery; reopening suppresses it and resets the budget |
| 6: attention/grace/user handoff | Address exhaustion, verify 59/60-second boundary; move to user-owned column during grace; unrelated running task cannot delay expiry |
| 7: dismissal/interruption | Interrupted recovery stays suspended; dismissal grants grace while preserving its recovery count; existing contextual continuation regressions pass |
| 8: pause/restart/process ownership | Restart retains count and exact deadline; startup remains paused; existing mapping, stale approval, suspension and startup tests pass |
| 9: superseded recovery | Ordinary request arrives during asynchronous workspace preparation; recovery is durably skipped with no attempt or budget consumed |
| 10: existing retry policy | Same recovery ID retries without another slot; later ordinary handoff cannot displace an already-dispatched retry; existing failure/permission attention tests pass |
| 11: resets and concurrency | Prose does not reset; waiting/attention/ordinary work reset during recovery; competing coordinators dispatch only three recoveries and create one exhaustion reason |
| 12: cycle prevention | Combined retained graph application test covers reverse, longer, mixed, cross-board and satisfied paths; assembled browser and MCP reject the circular relationship |

Browser coverage verifies actionable exhaustion, address resolution, timeline links
to retained attempts, and readable controls in dark and light themes. Browser
cycle creation uses the HTTP adapter; MCP coverage calls the real task tool.
Released migration tests verify retained-state upgrade, startup verification,
backup/rollback behavior and repeat startup against the regenerated schema.

## Completed checks — 2026-10-04

- Core/runtime/adapter/migration suite: **365 passed, 4 skipped, 0 failures or
  cancellations** across 369 tests. Includes the eleven dedicated recovery tests
  and 27 released-schema migration tests.
- Full browser regression: **213 passed**; one duration assertion exposed the
  fixture's old dependence on wall-clock provisioning time. With attempt starts
  now using the injected clock, the fixture advances exactly 150 seconds.
  The affected timeline, recovery/attention and relationship suites were rerun:
  **24 passed**, including the repaired assertion and both appearance modes.
- Both TypeScript configurations, production Vite build, and `git diff --check`
  passed. Vite retains its existing bundle-size advisory.

Commands used the installed entry points directly because this workspace lacks
package-manager executable shims:

```text
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.browser.json --noEmit
node node_modules/vite/bin/vite.js build
node --experimental-strip-types --test --test-timeout=10000 "test/**/*.test.ts"
node node_modules/@playwright/test/cli.js test
node node_modules/@playwright/test/cli.js test test/browser/task-authored-content-and-timeline.browser.spec.ts test/browser/task-attention.browser.spec.ts test/browser/task-relationships.browser.spec.ts
```

## Review

Independent Standards and Spec reviews completed. Repaired duplicate architecture
documentation and a scheduler gap that could delay grace expiry behind an unrelated
running task. Follow-up review verified the deadline race, interruption-close
behavior, retry ordering, stale-dismissal wake, and added application coverage.
No remaining actionable findings.

Older lifecycle tests now explicitly pause after the ordinary work they inspect,
or select ordinary relationship activations when checking relationship ordering.
Their fixtures no longer assume an idle watched task stays dormant indefinitely.

## Retained-state limits

Cycle validation includes all retained relationship types and uses a terminating
reachability query even if an older graph already contains a cycle. Migration 0008
preserves retained rows and AUTOINCREMENT high-water marks. It neither repairs
old relationships nor introduces a new startup hold.

An existing circular wait still suppresses recovery through its unresolved edges;
the user must remove an inappropriate relationship. An unresolved waiting edge
also suppresses recovery when its target is unmapped or waiting on user attention.
This is the agreed promise-based policy; recovery does not judge target progress.

The broader agent-instruction audit in intake 12 remains separate. Implementation
and delivery documentation are left unstaged; previously staged planning content
and unrelated project-growth work remain untouched in the index.
