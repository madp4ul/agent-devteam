# 66 — Render Markdown in Task Descriptions and Timeline Comments

**What to build:** Task descriptions and authored comments support readable,
safe Markdown in task details and the timeline.

**Blocked by:** None

**Status:** resolved

- [x] Render a deliberately supported Markdown subset for task descriptions and
  user- or agent-authored comments, including paragraphs, lists, emphasis,
  links, inline code, and fenced code blocks.
- [x] Sanitize rendered content so authored Markdown cannot inject scripts,
  unsafe HTML, event handlers, or unsafe URL schemes.
- [x] Preserve canonical participant-mention highlighting and mention behavior
  without interpreting mentions inside code spans or code blocks as requests.
- [x] Keep raw Markdown available during authoring and preserve the exact
  authored source in durable state and agent context.
- [x] Integrate Markdown with timeline preview expansion, wrapping, responsive
  layout, keyboard navigation, copying, and causal-link focus.
- [x] Define behavior for unsupported raw HTML, images, tables, task-list
  syntax, and external links before implementation.
- [x] Add parser/sanitization tests and browser coverage for representative
  descriptions and comments, malicious input, long code, and narrow screens.

## Comments

- Captured from real-project use. This ticket needs a small supported-syntax
  decision, but the requested rendering surfaces are task descriptions and
  comments in the timeline.

## Answer

Task descriptions, authored timeline comments and conversation messages, and
attempt outcomes now render CommonMark paragraphs, headings, block quotes,
ordered and unordered lists, emphasis, safe links, inline code, and fenced code
blocks. Mermaid fences remain ordinary code blocks. Raw HTML and images are
omitted, unsafe URL schemes are not linked, and tables and task-list extensions
remain ordinary CommonMark content because no GFM extensions are enabled.

Safe HTTP(S) links open in a new tab with opener isolation. Canonical mentions
retain their existing highlighting outside code, while code spans and blocks
remain illustrative. The durable and editable source remains unchanged, and a
shared quiet icon button copies that raw source from the Description heading,
comment/message metadata, or Outcome heading. Timeline expansion, wrapping,
causal focus, narrow layouts, and light/dark appearances remain covered.
