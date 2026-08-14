# 58 — Wrap Wide Transcript Content

**What to build:** Transcript content wraps within the transcript viewer instead
of forcing the viewer to grow horizontally or show a page-level horizontal
scrollbar.

**Blocked by:** None

**Status:** open

- [ ] Wrap ordinary transcript prose, tool output, paths, URLs, and other long
  unbroken content within the available transcript width.
- [ ] Preserve intentional formatting where horizontal scrolling is useful,
  such as code blocks or tabular preformatted content, but contain any such
  scrolling within that content block rather than the transcript or page.
- [ ] Ensure nested transcript records and narrow viewports do not overflow
  their dialog, panel, or page container.
- [ ] Preserve readable whitespace and copy/paste behavior.
- [ ] Add browser coverage for long unbroken strings, prose, structured tool
  output, code blocks, and a narrow viewport.

## Comments

- Captured from real-project use. The current transcript can show a horizontal
  scrollbar when content is wider than its container, making the transcript
  awkward to read.

