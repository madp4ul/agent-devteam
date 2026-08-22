# 69 — Wrap Long Lines in Rendered Markdown Code Blocks

**What to build:** Rendered Markdown code blocks keep long lines inside their
content surface and wrap them for reading instead of widening the task UI or
requiring horizontal scrolling as the primary behavior.

**Blocked by:** None

**Status:** resolved

- [x] Reproduce the page-level overflow with a fenced Markdown code block that
  contains a very long line, including an unbroken token, in each applicable
  Markdown surface.
- [x] Keep fenced code blocks, their grid or flex ancestors, dialogs, timeline
  records, and the page constrained to the available content width.
- [x] Prefer visible line wrapping within rendered code blocks so the
  continuation can be read without operating a horizontal scrollbar.
- [x] Preserve authored newlines, indentation, and copy behavior. Visual wraps
  must not alter the durable Markdown source or copied raw content.
- [x] Handle both ordinary long code lines and strings with no natural word
  break without clipping or expanding the surrounding interface.
- [x] Verify task descriptions, timeline comments, conversation messages, and
  attempt outcomes wherever the shared Markdown renderer supports fenced code.
- [x] Add browser regression coverage at ordinary and narrow viewport widths
  and appearance coverage in dark and light modes.

## Context

Issue 58 contained wide preformatted transcript output by giving intentional
preformatted content a local horizontal scrollbar. Issue 66 later added fenced
code blocks to authored Markdown surfaces. This report concerns those rendered
Markdown blocks and deliberately prefers readable wrapping over local
horizontal scrolling, so it is a separate regression rather than a reopening
of issue 58.

## Answer

Rendered fenced code now uses visual pre-wrapping with anywhere breaking while
the shared Markdown surface and timeline grid records remain shrinkable within
their available width. Authored Markdown and clipboard copies remain unchanged.
Browser coverage exercises descriptions, comments, conversation messages, and
attempt outcomes at desktop and narrow widths in both appearances, including
exact rendered indentation and newline preservation for ordinary long lines
and unbroken tokens.
