# 55 — Support Dark Mode

**What to build:** Add an accessible application-wide dark appearance that can
follow the operating-system preference or be selected explicitly, while
preserving the current light appearance and the semantic meaning of every
status, attention, and interaction treatment.

**Blocked by:** None

**Status:** open

- [ ] Provide one discoverable theme control available from both the board and
  task-detail views with `System`, `Light`, and `Dark` choices. Its accessible
  name and selected state are exposed to keyboard and assistive-technology
  users.
- [ ] `System` follows `prefers-color-scheme` and responds when that preference
  changes. An explicit `Light` or `Dark` choice overrides the system preference.
- [ ] Persist the selected choice locally and apply it across navigation and
  reloads. Theme selection remains a client preference and requires no project
  configuration or server-side domain state.
- [ ] Apply the effective theme before the application becomes visible so a
  returning dark-mode user does not see a conspicuous light-theme flash during
  startup.
- [ ] Cover every application-owned surface, including the board in both
  layouts, task details, cards, forms, menus, dialogs, attention and feedback
  states, timelines, transcripts, code blocks, scrollbars, loading and
  configuration-error views, and drag-and-drop states.
- [ ] Preserve the small set of established semantic color relationships in
  both themes:
  - the archived-task filter and archived tasks share one recognizable accent;
  - columns or rows without an assigned agent retain a soft, distinct treatment
    that draws the user toward work for which they are responsible;
  - successful and failed agent runs remain distinguishable at a glance through
    their timeline sidebars; and
  - comments and task-movement events retain their own recognizable treatments,
    including when they appear inside an agent run.
- [ ] The light and dark versions of each semantic treatment feel related, but
  need not use identical color values. Preserve meaning and relative emphasis
  rather than mechanically translating individual colors.
- [ ] Replace appearance-specific hard-coded colors with shared semantic theme
  tokens where practical, so components express roles such as canvas, surface,
  text, border, action, success, warning, failure, focus, and highlight rather
  than assuming a light background.
- [ ] In both themes, text, controls, focus indicators, status signals, links,
  disabled states, and selected or highlighted content retain clear contrast
  and do not communicate meaning through color alone. Native controls and
  browser chrome use the matching `color-scheme`.
- [ ] Changing the theme does not reset the current board, filter, lane scroll
  position, open task, modal, form contents, or live refresh state.
- [ ] Browser coverage verifies the system default, live system-preference
  changes, explicit override and persistence, switching from both primary
  views, keyboard operation, and representative board, task, modal, attention,
  transcript, and error states in light and dark appearances.

## Context

The React client currently defines a light palette in `styles.css`, but many
component and state colors remain literal values. Dark-mode support therefore
needs a deliberate semantic palette rather than a single page-background
override. Existing visual assertions that depend on literal light-theme RGB
values should continue to validate the light appearance or be reframed around
the semantic state they protect.

There is no fixed visual design or required green-heavy identity for the dark
theme. The current light theme is accepted as-is, and the implementer may choose
an appropriate dark palette without a separate design exercise. Only the
semantic relationships listed above are intentional constraints; other colors
may be selected freely as long as the result is coherent and accessible.

The first version does not require user accounts, cross-device synchronization,
per-board themes, scheduled theme changes, or additional color themes.

## Comments

- Treat theme choice as a presentation preference, not part of the durable
  coordination model.
- `System` is the default when no prior choice exists.
- The current purple archived treatment, soft user-responsibility treatment,
  green/red run outcome sidebars, and distinct comment/movement treatments are
  useful reference points, not immutable color values.
