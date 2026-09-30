# 23 — Make browser tab titles reflect the current page

**Type:** task
**Status:** open
**Blocked by:** None.
**Next step:** Agree a concise title format and apply it to framework views.

## Problem and requested behavior

Multiple browser tabs currently show the same generic Agent Coordination title.
The title should identify the part of the framework being viewed. In particular,
a task-detail tab should identify the inspected task so the user can distinguish
several open tasks without switching between tabs.

## Acceptance criteria

- [ ] Define meaningful, concise titles for the framework's page types.
- [ ] Include recognizable task information on task-detail pages; agree whether
  to include the task title, ID, or both and how to retain application identity.
- [ ] Update titles on navigation, direct loading, back/forward navigation, and
  task renaming without retaining a previous page's identity.
- [ ] Define sensible loading, unavailable-task, and error fallbacks.
- [ ] Add browser coverage for distinct tasks and navigation/title updates.

## Comments

- 2026-09-30: User-described GitHub issue; URL and number were not supplied.
  The concrete motivation is distinguishing tasks across multiple browser tabs.
