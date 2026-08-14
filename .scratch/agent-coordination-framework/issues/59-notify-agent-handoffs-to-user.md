# 59 — Add Notification Settings and Refine the Top Bar

**What to build:** Replace the top bar's loose collection of form controls with
compact operational controls and a proper Settings entry. A large settings
overlay owns notification and appearance preferences, including global
notification delivery, individual notification causes, and per-column entry
subscriptions.

**Blocked by:** None

**Status:** open

- [ ] The shared board/task top bar has a compact application menu with a
  Settings entry. Opening Settings presents a large modal overlay, visually
  consistent with the transcript viewer, rather than navigating away from the
  current board or task.
- [ ] The settings overlay supports multiple categories. Its first categories
  are Notifications and Appearance, selected from a sidebar on ordinary
  desktop widths and presented in a usable responsive order at narrow widths.
  Opening, category selection, closing, keyboard focus, Escape, and focus
  restoration follow accessible dialog and menu behavior.
- [ ] Notifications settings contain one global desktop-delivery toggle plus
  individual controls for agent-authored user mentions, actionable failed
  runs, and every applied workflow column. Subordinate controls remain visible
  and understandable when global delivery is off, without unexpectedly
  requesting operating-system permission.
- [ ] Every applied workflow column, irrespective of its watching agent or
  framework ownership, has an independently toggleable entry subscription in
  Notifications settings. The preference is not displayed as another control
  in each board header, is not part of the version-controlled process
  definition, and does not change workflow ownership.
- [ ] The user can change notification-cause and column subscriptions while the
  application is running, without pausing automation, restarting the host, or
  reapplying the process definition. Changes apply to future occurrences and
  do not replay existing attention or entry history.
- [ ] A new entry into a subscribed column can produce one notification. Base
  detection on a durable entry occurrence and its actor rather than comparing
  periodically refreshed board positions, so intermediate moves, inert
  refreshes, and same-column no-ops are not mistaken for entries.
- [ ] An agent-authored `@user` mention continues to create durable attention
  and, by default, notify independently of column subscriptions. It remains
  independently configurable and this ticket must preserve issue 57's intended
  rule that a user-authored self-mention is not an attention request.
- [ ] Actionable terminal or startup agent-run failures remain an independently
  configurable notification cause.
- [ ] A user-initiated interruption continues to create authoritative
  `automation-suspended` attention with its Continue/dismiss recovery, but does
  not produce a desktop notification. The initiating user is already
  interacting with the event and should not receive a notification echo.
- [ ] A subscribed-column entry is an informational notification preference;
  by default it does not create a Needs attention reason or imply that the user
  owns the next action. `@user` remains the explicit durable request for user
  action.
- [ ] Do not notify for an inert refresh, replayed history, startup discovery of
  existing state, or another event that does not represent a new occurrence.
- [ ] Reuse the existing opt-in, best-effort, privacy-safe desktop-notification
  behavior and direct navigation to the affected task.
- [ ] Remove suppression based on the affected task detail page being open.
  Page visibility does not prove that the user is looking at the application;
  an enabled cause therefore notifies whether the user is on the board,
  another task, or the affected task itself.
- [ ] Define deduplication when one agent handoff both enters a subscribed
  column and mentions the user, so the user is informed without receiving a
  noisy pair of notifications while the durable mention remains intact.
- [ ] Decide during specification whether user-authored entries are always
  silent, and whether agent-authored task creation directly in a subscribed
  column counts as an entry. The default recommendation is to suppress the
  user's own actions and include agent-authored creation.
- [ ] Decide whether subscriptions follow the existing device-local browser
  preference model or are durable project/user state. Whichever scope is
  chosen must be visible in the control's explanation and must survive an
  ordinary page reload.
- [ ] Appearance settings own the existing System, Light, and Dark preference;
  remove the appearance form control from the top bar without changing its
  immediate application, system-theme following, or reload persistence.
- [ ] Keep pause/resume immediately reachable in the top bar as one
  purpose-built status action. Integrate automation state into that action:
  running uses the existing green status signal with `Pause`; paused uses an
  amber/yellow signal with `Resume`; pausing communicates its unavailable
  transitional state without a separate status sentence or explanatory text.
- [ ] Keep Current runs as a top-bar entry with its count and task navigation,
  but style and operate it as a compact top-bar menu rather than an unstyled
  disclosure surrounded by form controls.
- [ ] Remove the standalone desktop-notification button, appearance select,
  duplicate automation-state label, and `No agents are changing boards.` text
  from the top bar. The resulting top bar has a deliberate hierarchy across
  board and task pages and remains usable at narrow widths.
- [ ] Cover settings-menu and modal interaction; notification and appearance
  persistence; global and per-cause controls; entries into watched, unwatched,
  and framework-owned columns; subscribed and unsubscribed destinations;
  agent-authored mentions; actionable failures; user interruption without
  notification; combined triggers; user-authored entries; creation if
  included; repeated and intermediate moves; startup/restart; delivery while
  the affected task is open; notification failure; automation transitions;
  current-run navigation; and responsive top-bar/settings layout.

## Context

Issue 20 implemented notifications for newly created attention reasons, and
issue 57 tracks making those reasons actionable. Current domain behavior says
that merely entering a column does not create user attention. The real-use
request is a broader notification-settings surface, including a per-column
awareness preference rather than a rule tied to unwatched columns alone.
Column subscriptions therefore should remain separate from process-defined
watching responsibility and from durable attention unless later use shows that
a distinct explicit handoff concept is needed.

## Comments

- Current implementation (inspected 2026-08-14): desktop notifications are a
  browser-side monitor over unresolved Needs attention reasons. It polls the
  board projection every 1.5 seconds and attempts one operating-system
  notification for each newly observed `user-mention`, `failed-run`, or
  `automation-suspended` reason. Ordinary task movement never notifies.
- Delivery currently requires the browser Notification interface, granted
  operating-system permission, and the global `Desktop notifications on`
  preference. The preference is disabled by default and stored in browser
  local storage. The browser page must be open for its polling monitor to run.
- The first observation seeds all existing reasons without notifying. Reasons
  first seen while delivery is disabled, permission is absent, or the affected
  task detail page is active are also recorded as seen and are not replayed
  later. Active-task suppression is undesirable because an open page does not
  establish user attention and should be removed. A delivery exception is
  swallowed and not retried. A reason created and resolved entirely between
  polls is not observed by this mechanism.
- Notification content is limited to board name, task ID and title, and reason
  type. Selecting it focuses the application and opens the affected task with
  the reason highlighted; opening or dismissing the notification does not
  resolve attention.
- The existing in-memory seen set is suitable for best-effort attention
  delivery but board-position diffing would be too shallow for column-entry
  semantics: it cannot reliably retain actor provenance or notice multiple
  moves between polls. The implemented activity ledger already records task
  movement with actor and occurrence identity, which is the natural source for
  a small notification-occurrence query interface.
- Issue 57 owns making attention actions source-local and ignoring
  user-authored `@user` self-mentions. Issue 59 should preserve those semantics
  rather than establish a competing mention rule.
- `AutomationControls` currently mixes status, action, explanation, current
  runs, notification preference, and appearance preference into one wrapping
  top-bar row. This ticket should replace that shallow collection with three
  clear interfaces: immediate automation action/status, current-run navigation,
  and an application menu leading to categorized settings.
- Current `automation-suspended` attention is projected directly from the
  durable state created by a user interruption. It must remain visible and
  actionable on the board even though notification delivery for that
  self-initiated occurrence is removed.
