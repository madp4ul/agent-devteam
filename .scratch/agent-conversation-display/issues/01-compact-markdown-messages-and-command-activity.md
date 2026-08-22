# 01 — Compact Markdown messages and command activity

**What to build:** Replace the conversation dialog's oversized transcript cards
with a compact activity stream whose messages remain primary and whose command
activity is quiet but fully inspectable. Codex messages and authored user
follow-ups render through the shared Markdown presentation and expose their
original Markdown through a copy control. Commands use an accessible semantic
status marker and one collapsed disclosure containing the exact invocation
followed by its available output.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Each run retains a visible boundary and chronological transcript order while its items use a compact stream layout rather than equally prominent cards.
- [x] Codex messages render Markdown, provide a copy-Markdown control, and do not repeat a `Codex message` heading already implied by the run.
- [x] Authored user follow-ups retain a compact `You` label, render Markdown, and provide a copy-Markdown control.
- [x] Copy controls copy the original Markdown source rather than rendered text.
- [x] One-line messages use restrained vertical space while long Markdown, code, links, lists, and unbroken content remain readable and contained.
- [x] Commands appear under a generic human-readable title without attempting to infer or summarize their purpose.
- [x] A command is collapsed by default and one disclosure reveals its exact invocation followed by its available output.
- [x] Commands without output still disclose their invocation, and large output remains bounded, scrollable, and subject to the existing truncation protection.
- [x] Successful, running, and failed commands use shared geometrically centered SVG status marks in a fixed position instead of trailing status prose.
- [x] Status meaning is available to assistive technology and is not conveyed by color, shape, or motion alone.
- [x] Running command updates replace the same stable transcript row and polling preserves the user's scroll position and disclosure state.
- [x] Diagnostics remain literal, compact, and visually distinct from authored Markdown and ordinary tool activity.
- [x] The stream, message surfaces, status marks, disclosures, hover states, and focus states remain readable and operable in dark and light themes.
- [x] Browser coverage verifies Markdown and copy behavior, command disclosure behavior, accessible statuses, live refresh stability, narrow-viewport containment, and both themes.
- [x] Runtime-adapter coverage verifies that command events retain the exact command, status, output, stable identity, and truncation behavior required by the browser without parsing a display summary.
- [x] Existing conversation continuation, selected-source positioning, run timing, token usage, focus containment, and polling behavior remain green.

## Answer

Agent conversation runs now render as a compact activity stream. Codex and user
messages use the shared Markdown renderer with source-preserving copy controls,
while commands use one quiet collapsed disclosure containing the exact
invocation followed by output. Shared accessible SVG marks communicate running,
successful, and failed command state without trailing status prose.

The runtime transcript contract now retains commands as structured evidence
with stable identity, literal command text, status, and bounded output. Live
updates replace the same command row while preserving disclosure and scroll
state. Typechecking, the production build, 204 non-browser tests, and all 82
browser tests pass; three credentialed real-Codex integration tests remain
intentionally skipped. The final Standards and Spec reviews reported no
findings.
