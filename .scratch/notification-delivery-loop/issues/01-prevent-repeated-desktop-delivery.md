# 01 — Prevent repeated desktop notifications from overlapping polls

**Type:** task

**Status:** resolved

**Blocked by:** None — can start immediately.

## Reported problem

2026-11-14: While supervising idle-games-autonomous-v2 under Autonomous V2,
the user received repeated desktop notifications after an agent comment mentioned
them. The conversation panel was open; roughly two notifications per second
continued until leaving the panel, with a few arriving afterward.

## What to build

Each open browser client makes at most one desktop delivery attempt per eligible
occurrence, including when occurrence reads are slower than the polling interval.
Retain forward-only observation, prospective permission changes, stable tags,
and existing notification navigation.

## Acceptance criteria

- [x] Reproduce repeated delivery with controlled slow notification responses
  through the real browser application and Notification API boundary.
- [x] Keep notification reads serialized, including permission changes while a
  read is pending; do not regress the observation cursor or replay a batch.
- [x] Advance observation even when permission is unavailable or delivery fails.
- [x] Preserve notification navigation and fresh-client no-replay behavior.
- [x] Verify using isolated assets and temporary fixture state; leave the live
  host, its built assets, database, processes, and agent runs untouched.

## Comments

Investigation uses the diagnosing-bugs and to-tickets repository skills. The user
explicitly authorized issue creation and implementation if live execution is
unaffected; this is a single scoped ticket with no dependency breakdown needed.
Live host discovered at 127.0.0.1:3001, PID 37972. Its browser assets are served
from dist/web. Builds for this work must use a separate scratch output directory.

## Answer

Confirmed a browser delivery race in isolation. The old fixed interval starts
another occurrence read every 1.5 seconds even while the preceding read is
pending. Multiple requests therefore use the same cursor and independently
deliver the same returned occurrence. Out-of-order responses can additionally
regress the cursor. Permission state changes also recreate the old polling
effect without suppressing its pending response.

The first regression held a read across two more intervals with the conversation
open. It failed with three `single-mention` deliveries instead of one:

```text
node node_modules/@playwright/test/cli.js test test/browser/desktop-notifications.browser.spec.ts
Expected: ["single-mention"]
Received: ["single-mention", "single-mention", "single-mention"]
1 failed
```

Fix: schedule the next poll only after the preceding request settles, keep
permission changes outside the polling effect's dependencies, and discard a
response when its effect has been disposed. Observation still advances before
permission checks or best-effort delivery. Existing initial-cursor, occurrence
tags, navigation, authoritative recording and policy contracts are unchanged.
No architecture, persistence, process-definition, or runtime changes are needed.

Validation used `COORDINATION_BROWSER_TEST_ASSET_DIRECTORY` pointing at
`.scratch/notification-delivery-loop/browser-assets`, built with:

```text
node node_modules/vite/bin/vite.js build --outDir ../.scratch/notification-delivery-loop/browser-assets
```

- Original regression plus existing notification/Settings browser coverage:
  6 passed.
- Expanded regressions for open conversation and permission grant during a
  pending read, each repeated twice: 4 passed.
- Notification policy application tests: 2 passed.
- Server/test and browser TypeScript checks passed.
- Review found no additional issue in disposal, permission changes, error retry,
  cursor advancement, or notification click behavior.

The repeated delivery is proven; the live conversation panel's contribution to
request latency is not measured. No production event or database was mutated to
reproduce it. The original host PID remained running, and dist/web/index.html
retained its pre-investigation timestamp (2026-11-13). Changes are unstaged.

Implementation is complete for user review. The running browser still uses its
existing build: deployment/rebuilding live assets was deliberately deferred so
the current Autonomous V2 execution remains untouched. Integrate the browser
build during the next user-controlled update. A future browser regression with
slow transport would have prevented this defect; the previous delivery tests
only returned occurrence reads promptly.
