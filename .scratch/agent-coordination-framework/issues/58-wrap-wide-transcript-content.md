# 58 — Wrap Wide Transcript Content

**What to build:** Transcript content wraps within the transcript viewer instead
of forcing the viewer to grow horizontally or show a page-level horizontal
scrollbar.

**Blocked by:** None

**Status:** resolved

- [x] Wrap ordinary transcript prose, tool output, paths, URLs, and other long
  unbroken content within the available transcript width.
- [x] Preserve intentional formatting where horizontal scrolling is useful,
  such as code blocks or tabular preformatted content, but contain any such
  scrolling within that content block rather than the transcript or page.
- [x] Ensure nested transcript records and narrow viewports do not overflow
  their dialog, panel, or page container.
- [x] Preserve readable whitespace and copy/paste behavior.
- [x] Add browser coverage for long unbroken strings, prose, structured tool
  output, code blocks, and a narrow viewport.

## Comments

- Captured from real-project use. The current transcript can show a horizontal
  scrollbar when content is wider than its container, making the transcript
  awkward to read.

## Answer

The narrow transcript overflow came from the header's non-wrapping action row;
at 360 px it forced the dialog itself to become horizontally scrollable. Wide
preformatted output had a related containment problem because its grid and flex
ancestors retained their automatic minimum widths.

Transcript headers now wrap, transcript containers and records may shrink, and
ordinary record text wraps while preserving authored line breaks. Preformatted
tool output retains its whitespace and scrolls horizontally only inside its own
block. Browser coverage exercises prose, long paths, structured tool output,
preformatted content, and the narrow viewport.

Verified with `pnpm.cmd run typecheck` and the transcript-focused Playwright
tests (`5 passed`).
