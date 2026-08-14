# 66 — Render Markdown in Task Descriptions and Timeline Comments

**What to build:** Task descriptions and authored comments support readable,
safe Markdown in task details and the timeline.

**Blocked by:** None

**Status:** open

- [ ] Render a deliberately supported Markdown subset for task descriptions and
  user- or agent-authored comments, including paragraphs, lists, emphasis,
  links, inline code, and fenced code blocks.
- [ ] Sanitize rendered content so authored Markdown cannot inject scripts,
  unsafe HTML, event handlers, or unsafe URL schemes.
- [ ] Preserve canonical participant-mention highlighting and mention behavior
  without interpreting mentions inside code spans or code blocks as requests.
- [ ] Keep raw Markdown available during authoring and preserve the exact
  authored source in durable state and agent context.
- [ ] Integrate Markdown with timeline preview expansion, wrapping, responsive
  layout, keyboard navigation, copying, and causal-link focus.
- [ ] Define behavior for unsupported raw HTML, images, tables, task-list
  syntax, and external links before implementation.
- [ ] Add parser/sanitization tests and browser coverage for representative
  descriptions and comments, malicious input, long code, and narrow screens.

## Comments

- Captured from real-project use. This ticket needs a small supported-syntax
  decision, but the requested rendering surfaces are task descriptions and
  comments in the timeline.

