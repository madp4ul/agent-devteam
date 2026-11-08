# 103 — Unify running and preparing details in one toolbar tooltip

**Type:** task

**Status:** resolved

## Reported problem

User report, 8 November 2026: when agents are running while other agents are
preparing workspaces, the top toolbar's running/preparing indicator displays two
tooltip overlays on top of each other. The user wants this information in one
tooltip. The newer preparation tooltip looks better than the older running-agent
tooltip; bring running details to the same visual standard.

Related implementation: [heavy usage 12](../../heavy-usage/issues/12-show-workspace-preparation-progress.md).

## Scope and acceptance criteria

- [x] Reproduce with both active runs and workspace preparations present.
- [x] Present running and preparing information in a single coherent tooltip,
      without competing or overlapping overlays on hover or keyboard focus.
- [x] Use the preparation tooltip's clearer presentation for running-agent
      details too, while keeping this supporting toolbar UI visually quiet.
- [x] Preserve distinct lifecycle labels, accurate counts, task identities,
      timers and available preparation progress.
- [x] Cover mixed activity, running-only, preparing-only and idle transitions;
      verify appearance and accessibility in dark and light modes.

## Comments

8 November 2026: Recorded only. The framework is running; the user explicitly
deferred implementation and requested no runtime disruption. No reproduction
or implementation has been performed for this report.

## Implementation evidence — 8 November 2026

After the user authorized work once existing runs finished, the parent verified
that automation was paused with no active runs or workspace preparations.
Implementation and tests did not operate on the live project.

- Browser geometry reproduced the overlap in both themes: the preparation row
  began at y=86 while the running row extended to y=130. The old CSS positioned
  every direct list/paragraph independently at the same popup location.
- One positioned container now owns both sections. Running entries show agent,
  task identity/title, board/column and truthful lifecycle/timing on separate
  quiet lines. Preparation progress remains intact; links and native keyboard
  disclosure behavior are preserved.
- Dark/light geometry, readable contrast, keyboard disclosure and mixed,
  running-only, preparing-only and idle transitions pass. Startup/interrupted
  startup retain zero running count and do not display a running timer.
- Typecheck and build passed; nine focused activity, workspace-preparation and
  resume browser tests plus the existing toolbar navigation/compact-layout test
  passed (10 total). Dark/light popup screenshots were inspected.
- Independent Standards and Spec reviews each reported zero findings. No
  architectural ownership or runtime behavior changed. Changes remain unstaged.
