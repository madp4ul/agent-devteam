# 10 — Consolidate supporting control styles

**What to build:** Give the inspected modal, activity-summary and conversation
navigation controls predictable base, theme and interaction styling, preserving
their supporting visual hierarchy.

**Blocked by:** None.

**Status:** open

**Priority:** Lower priority; follow the operational and lifecycle maintenance.

**Scheduling:** Deferred by the user. Do not claim or implement until the user
explicitly resumes this effort after the idle game run.

**Parent:** [November assessment](../spec.md).

## Acceptance criteria

- [ ] Consolidate the inspected controls' styling by capability, removing
  superseded light-color and later theme-override rules as each control moves.
- [ ] Use existing semantic tokens with predictable selector specificity;
  keep responsive and interaction rules findable with the rules they affect.
- [ ] Preserve current layout, geometry, readability and supporting visual
  emphasis in dark and light modes, including hover, focus, disabled and status
  states. No visual redesign is part of this cleanup.
- [ ] Preserve accessible controls and shared SVG icon geometry. If a new
  icon-button pattern is introduced, include the required centering coverage.
- [ ] Run the affected appearance/accessibility and control browser coverage,
  including modal, activity and conversation scenarios in both themes.
- [ ] Keep the scope to the inspected controls. Do not migrate CSS tooling or
  undertake a stylesheet-wide rewrite merely to reorganize files.
