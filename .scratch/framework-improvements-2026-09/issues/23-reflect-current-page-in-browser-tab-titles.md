# 23 — Make browser tab titles reflect the current page

**Type:** task
**Status:** resolved
**Blocked by:** None.
**Next step:** User review.

## Problem and requested behavior

Multiple browser tabs currently show the same generic Agent Coordination title.
The title should identify the part of the framework being viewed. In particular,
a task-detail tab should identify the inspected task so the user can distinguish
several open tasks without switching between tabs.

## Acceptance criteria

- [x] Define meaningful, concise titles for the framework's page types.
- [x] Include recognizable task information on task-detail pages; agree whether
  to include the task title, ID, or both and how to retain application identity.
- [x] Update titles on navigation, direct loading, back/forward navigation, and
  task renaming without retaining a previous page's identity.
- [x] Define sensible loading, unavailable-task, and error fallbacks.
- [x] Add browser coverage for distinct tasks and navigation/title updates.

## Answer

Implemented task tabs as `Task title (task ID) · Agent Coordination` and the
board overview as `Boards · Process name · Agent Coordination`. The title-and-ID
format was proposed to the user with alternatives; implementation uses that
default pending user review. Settings, archive visibility, and conversations
remain subordinate to their containing page rather than changing tab identity.

A shared browser title hook applies the application suffix on page layout and
title changes. Page policy uses the existing loaded projections, including task
edits and live refresh, without introducing another data request or state owner.
Keyed navigation sets a fresh loading title; obsolete responses cannot overwrite
the active page through the existing latest-refresh lifecycle.

Loading titles name boards or the requested task ID. Initial unavailable task
responses (404/409), other request errors, and configuration errors have explicit
fallbacks. A transient refresh failure after a successful load retains the
identity of the content still displayed; the existing page alert reports it.

Nine browser checks cover separate task tabs, direct loading, in-app and browser
navigation, local and live renames, loading/error transitions, and late responses.
Typechecking, build, and the Node suite passed (353 passed, four opt-in tests
skipped). Standards and Spec reviews each reported zero findings. Full browser
regression validation ran in a temporary copy on port 4183 because ticket 25's
concurrent browser run uses the default fixture port 4174: 194 passed initially;
the example-workflow test lacked copied example files, and two ticket 25 tests
used an earlier in-progress snapshot. After supplying the examples and refreshing
ticket 25's completed files, all 24 title, workflow, and docking checks passed
on rerun. No browser failures remain unexplained or unreverified. Changes are
unstaged; ticket 25's source, tests, and ticket were not edited by this work.

## Comments

- 2026-09-30: User-described GitHub issue; URL and number were not supplied.
  The concrete motivation is distinguishing tasks across multiple browser tabs.
