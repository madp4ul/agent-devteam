# 24 — Investigate Task position spacing and initial reveal

**Type:** research
**Status:** open
**Blocked by:** None.
**Next step:** Check the latest layout against the reported scenario before proposing a fix.

## Problem and reported behavior

Task position uses reactive positioning with substantial manual geometry logic.
The user observed it appearing with a gap below Relationships and then retaining
that gap. Description length may affect how much of Task position is initially
revealed and therefore alter its positioning behavior, but this is a hypothesis.
Recent changes may already have corrected the symptom.

## Investigation and completion criteria

- [ ] Inspect recent docking/resize fixes and existing browser coverage before
  treating the reported gap as a confirmed current defect.
- [ ] Compare short, long, collapsed, and expanded descriptions, varied
  relationship content, and representative desktop/short/narrow viewports.
- [ ] Observe initial load without scrolling, subsequent scrolling, resizing,
  description expansion/collapse, and live refresh in both appearances.
- [ ] Distinguish intentional spacing/reveal behavior from an unintended retained
  gap; record reproduction steps and geometry evidence if reproducible.
- [ ] If already fixed, document the supporting evidence and relevant coverage.
  If a fix is needed, publish linked implementation/regression tickets before
  resolving this investigation.

## Related work

Build on [issue 07](07-keep-task-movement-controls-accessible.md),
[issue 16](16-navigate-timeline-with-column-movement-map.md), and the docking
follow-ups recorded in [issue 15](15-redesign-blockers-around-explicit-resume-agents.md).
Share layout investigation with [issue 25](25-dock-add-comment-on-initial-load.md),
but retain their separate symptoms and completion criteria.

## Comments

- 2026-09-30: User-described GitHub issue; URL and number were not supplied.
  No new reproduction was performed during intake; the user explicitly noted
  that recent changes might already have fixed it.
