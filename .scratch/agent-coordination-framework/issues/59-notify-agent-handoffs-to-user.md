# 59 — Add Notification Settings and Refine the Top Bar

**What to build:** Replace the top bar's loose collection of form controls with
compact operational controls and a direct Settings action. A categorized
settings overlay owns durable per-process notification policy and browser-local
appearance, while desktop delivery gains configurable agent-authored column
entry notifications.

**Blocked by:** None

**Status:** open

## Settings surface

- [ ] The shared board/task top bar has a gear-shaped Settings action that opens
  a large modal overlay, visually consistent with the transcript viewer,
  without an intermediary one-item menu or navigation away from the current
  board or task.
- [ ] The overlay initially selects Notifications and supports Notifications
  and Appearance as distinct categories. Use a category sidebar at ordinary
  desktop widths and a usable responsive presentation at narrow widths.
  Opening, category selection, closing, Escape, keyboard focus, and focus
  restoration follow accessible dialog behavior.
- [ ] Settings apply and persist immediately, with no Save or Cancel step. A
  rejected update restores the authoritative value and reports an inline error.

## Notification policy

- [ ] Notification policy is durable live state for the applied process, shared
  across browsers viewing that process, and separate from the version-controlled
  process definition and browser-local operating-system permission.
- [ ] The shared global policy defaults on and acts as a master silence switch.
  Individual cause and column settings remain visible, editable, and preserved
  while it is off. Turning it back on affects only future occurrences.
- [ ] Agent-authored `@user` mentions and actionable terminal or startup
  agent-run failures are independent causes and default on. A user-authored
  `@user` self-mention creates neither user attention nor a notification; this
  ticket owns that correction rather than issue 57.
- [ ] A user-initiated task interruption still creates authoritative
  `automation-suspended` attention with its existing recovery semantics, but is
  not a notification cause. Pausing process-wide automation also does not
  notify.
- [ ] Notifications settings group column subscriptions under their board
  headings and identify them durably by stable board and column IDs. Display
  names remain presentation only.
- [ ] A newly encountered unwatched workflow column defaults subscribed, an
  agent-watched workflow column defaults unsubscribed, and every framework-owned
  Completion column defaults subscribed. This initializes the durable setting
  only when that stable board/column identity first appears; later watcher or
  process changes do not recompute it.
- [ ] Only agent-authored entry into a subscribed column notifies. Both an
  agent move and agent-authored initial task creation count as entry. The
  corresponding user-authored move or creation is always silent. Same-column
  no-ops, inert refreshes, replayed history, and startup discovery are not
  entries.
- [ ] Column-entry notification is informational: it does not create Needs
  attention or imply user responsibility. Its title identifies board and task,
  its body identifies task title and destination column, and selecting it opens
  task details without an attention highlight. It exposes no description,
  comment text, diagnostics, or other task content.
- [ ] Notification occurrences are independent and immediate. An agent comment
  mentioning the user may notify on the next observation while that attempt is
  still running; a later subscribed-column entry may notify again. Do not add
  batching, attempt-level correlation, trigger precedence, or combined-trigger
  deduplication.
- [ ] Policy changes are prospective. Occurrences created while the global
  switch or their individual cause is off are never replayed after enablement,
  reload, or restart.

## Browser delivery

- [ ] Delivery remains browser-present and best-effort. At least one
  application tab must be open; closing all tabs can miss occurrences and later
  reopening does not replay them. Failed or unavailable operating-system
  delivery is not retried and never changes authoritative task or attention
  state.
- [ ] Do not suppress a notification because the affected task detail page is
  open. An enabled occurrence may notify while the user is on the board,
  another task, or the affected task itself.
- [ ] When operating-system notification permission is undecided and the
  browser has no recorded delivery-consent answer, show one small application
  dialog. Yes invokes the browser permission request from that user gesture. No
  records a reversible browser-local decline, suppresses later automatic
  prompts in that browser, and does not change shared process policy.
- [ ] Settings reports whether this browser is granted, locally declined,
  denied/revoked, unsupported, or still eligible to ask. It offers the
  applicable Allow/reconsider action; a browser-level denial that script cannot
  reverse instead explains that browser controls own the remedy.
- [ ] When shared notifications are on but this browser cannot deliver, show a
  restrained warning badge on the Settings gear and explain the mismatch only
  inside Settings.
- [ ] Separate browsers may each deliver; do not add cross-browser claiming or
  deduplication. Every browser observation of the same occurrence uses its
  stable occurrence ID as the Notification tag so standard same-origin tag
  replacement can coalesce duplicate attempts across tabs in one browser.
- [ ] Attention notifications retain privacy-safe content and navigate to the
  exact affected task/reason without resolving it. Column-entry notifications
  use the content and navigation behavior defined above.

## Appearance and top bar

- [ ] Appearance settings own the existing System, Light, and Dark preference.
  Appearance remains browser-local and shared across projects in that browser;
  moving its control out of the top bar does not change immediate application,
  system-theme following, or reload persistence.
- [ ] Keep pause/resume immediately reachable as one purpose-built top-bar
  status action: running is a green signal with `Pause`; pausing/draining is an
  amber signal with disabled `Pausing…`; paused and resumable is an amber signal
  with `Resume`.
- [ ] When unresolved process impact prevents resume, show the ordinary amber
  `Resume` action disabled. The nearby process-impact panel remains the sole
  explanation and resolution surface; do not duplicate that text in the top
  bar.
- [ ] Keep Current runs as a compact top-bar menu with its count and existing
  task navigation, styled as a top-bar control rather than an unstyled form
  disclosure.
- [ ] Remove the standalone desktop-notification button, Appearance select,
  duplicate automation-state label, and `No agents are changing boards.` text.
  The resulting hierarchy is consistent across board and task pages and remains
  usable at narrow widths.

## Verification

- [ ] Application-level tests cover durable per-process policy, defaults,
  initialization-only column behavior, immediate setting changes, agent versus
  user authorship, creation and movement, self-mention suppression, failure and
  interruption causes, and prospective no-replay semantics.
- [ ] Browser tests cover the consent dialog and local permission states,
  global/cause/column controls, multiple boards, same-tag delivery, active-task
  delivery, failure handling, notification content/navigation, Settings and
  Appearance interaction, automation transitions, blocked Resume, current-run
  navigation, keyboard behavior, and desktop/narrow responsive layout.
- [ ] Update the aggregate specification and architecture inspection map in the
  same change to reflect durable notification-policy ownership, the occurrence
  query/delivery flow, and the browser-local permission and Appearance state.

## Context

Issue 20 implemented browser-polled notifications for newly created attention
reasons. Current implementation polls the board projection every 1.5 seconds,
keeps an in-memory seen set, suppresses delivery on the affected task page, and
notifies for `user-mention`, `failed-run`, and `automation-suspended`; ordinary
task movement never notifies. Its global opt-in and Appearance controls are
mixed into `AutomationControls` alongside automation state and Current runs.

This ticket replaces that shallow top-bar collection with three clear
interfaces: immediate automation action/status, current-run navigation, and
categorized settings. Notification policy becomes authoritative process-bound
state, while the browser remains a best-effort operating-system delivery
adapter. Durable activity identity and actor provenance, rather than board
position diffing, are the source for column-entry occurrences.

## Comments

- Grilling on 2026-08-14 resolved notification ownership, defaults, entry
  semantics, permission consent, delivery scope, replay, multi-tab and
  multi-browser behavior, content, combined triggers, settings interaction,
  Appearance ownership, and top-bar automation states.
- Column subscriptions are awareness preferences, not workflow watching and not
  durable attention. `@user` remains the explicit durable user request.
- Issue 57 retains attention action placement and interruption recovery UI. Its
  former self-mention creation rule moved here so issue 59 is implementable
  first without depending on that broader ticket.
