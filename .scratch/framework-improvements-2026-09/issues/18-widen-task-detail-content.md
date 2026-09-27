# 18 — Give task-detail content more horizontal room

**Type:** task
**Status:** resolved
**Blocked by:** None.
**Next step:** User review and width tuning in normal task-detail use.

## Problem and direction

The task-detail page's primary column is often dominated by long agent comments
and attempt outcomes. Its current width feels compressed even when the browser
has additional horizontal room available.

Increase the desktop task-detail content width so narrative history has more
room to breathe without weakening the sidebar's usability. This is independent
of issue 16: the movement map now uses released vertical space inside Task
position and does not require timeline width.

## Completion criteria

- [x] Compare the current maximum page width and primary/sidebar ratio against
  representative long comments, attempt blocks, tables, and code.
- [x] Give the primary narrative column visibly more room on ordinary desktop
  and wide screens without making lines uncomfortably long.
- [x] Preserve the sidebar's movement controls, relationships, workspace, and
  conversation usability.
- [x] Preserve existing responsive behavior and avoid horizontal page overflow.
- [x] Verify both dark and light appearances at representative viewport widths.

## Related work

Raised while resolving [issue 16](16-navigate-timeline-with-column-movement-map.md).
Issue 16 deliberately does not change task-detail width.

## Comments

- 2026-09-24: Split from issue 16 at the user's request.

## Answer

Implemented a restrained desktop widening from `76rem` to `86rem` and changed
the primary/sidebar allocation from 2:1 to 7:3. At a 1600 px viewport, after
the page's existing 64 px side padding and 16 px grid gap, the primary column
grows from about 715 px to 862 px (+147 px) while the sidebar remains nearly
steady at about 370 px. At 1280 px the primary column gains about 81 px and the
sidebar remains above its 18rem minimum.

The choice treats task details as mixed product content rather than a pure
article. [GOV.UK's layout guidance](https://design-system.service.gov.uk/styles/layout/)
targets roughly 75 characters for ordinary prose but permits wider wrappers
when the content needs them, while [W3C's Level AAA visual-presentation
guidance](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation)
uses 80 characters as the maximum achievable line width for text blocks.
[Atlassian's product grid](https://atlassian.design/foundations/grid) uses a
1296 px fixed-wide experience and an 864 px fixed-narrow long-form measure;
the new inner page width is 1248 px and the primary column is about 862 px
before its panel and timeline insets. [Azure DevOps work-item forms](https://learn.microsoft.com/en-us/azure/devops/reference/customize-wit-form)
use a 66/33 two-column split and stack when space is insufficient; the chosen
70/30 split gives this narrative-heavy timeline a modest preference while
retaining the same responsive stacking model.

Browser coverage exercises representative prose, attempt outcomes, tables,
and code at 1280 px and 1600 px in dark and light appearances. It checks local
content containment, contrast, keyboard focus for movement, relationship,
workspace, and conversation controls, the sidebar minimum, page overflow, and
the existing 760 px stacked layout.
