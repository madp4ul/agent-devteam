# 01 — Compact Markdown messages and command activity

**What to build:** Replace the conversation dialog's oversized transcript cards
with a compact activity stream whose messages remain primary and whose command
activity is quiet but fully inspectable. Codex messages and authored user
follow-ups render through the shared Markdown presentation and expose their
original Markdown through a copy control. Commands use an accessible semantic
status marker and one collapsed disclosure containing the exact invocation
followed by its available output.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Each run retains a visible boundary and chronological transcript order while its items use a compact stream layout rather than equally prominent cards.
- [ ] Codex messages render Markdown, provide a copy-Markdown control, and do not repeat a `Codex message` heading already implied by the run.
- [ ] Authored user follow-ups retain a compact `You` label, render Markdown, and provide a copy-Markdown control.
- [ ] Copy controls copy the original Markdown source rather than rendered text.
- [ ] One-line messages use restrained vertical space while long Markdown, code, links, lists, and unbroken content remain readable and contained.
- [ ] Commands appear under a generic human-readable title without attempting to infer or summarize their purpose.
- [ ] A command is collapsed by default and one disclosure reveals its exact invocation followed by its available output.
- [ ] Commands without output still disclose their invocation, and large output remains bounded, scrollable, and subject to the existing truncation protection.
- [ ] Successful, running, and failed commands use shared geometrically centered SVG status marks in a fixed position instead of trailing status prose.
- [ ] Status meaning is available to assistive technology and is not conveyed by color, shape, or motion alone.
- [ ] Running command updates replace the same stable transcript row and polling preserves the user's scroll position and disclosure state.
- [ ] Diagnostics remain literal, compact, and visually distinct from authored Markdown and ordinary tool activity.
- [ ] The stream, message surfaces, status marks, disclosures, hover states, and focus states remain readable and operable in dark and light themes.
- [ ] Browser coverage verifies Markdown and copy behavior, command disclosure behavior, accessible statuses, live refresh stability, narrow-viewport containment, and both themes.
- [ ] Runtime-adapter coverage verifies that command events retain the exact command, status, output, stable identity, and truncation behavior required by the browser without parsing a display summary.
- [ ] Existing conversation continuation, selected-source positioning, run timing, token usage, focus containment, and polling behavior remain green.

