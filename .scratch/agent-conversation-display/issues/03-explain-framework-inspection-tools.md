# 03 — Explain framework inspection tools

**What to build:** Give every read-only coordination-framework MCP call a
tailored compact presentation that states the authoritative scope inspected.
The presentation adds useful domain context without repeating its MCP title or
status, links task references when a task page is a meaningful destination,
without retaining the generic raw-details disclosure for known framework calls.

**Blocked by:** 02 — Identify generic MCP calls and disclose their evidence

**Status:** resolved

- [x] Operating-context inspection identifies the run context inspected without repeating the `Coordination · Inspect operating context` title.
- [x] Board summaries identify the board scope returned when reliable result data is available.
- [x] Task listing identifies the requested board and columns while running and prefers authoritative returned scope when available.
- [x] Task inspection identifies the inspected task and links its task page.
- [x] Task activity inspection identifies and links the task whose activity was read.
- [x] Task attachment inspection identifies and links the task whose attachments were read.
- [x] Collaborator listing identifies the collaborator-directory scope without adding a duplicate success phrase.
- [x] Current-task inspection is a self-contained header and omits the redundant current task ID.
- [x] Tailored bodies prefer authoritative result facts over requested arguments, falling back to arguments only while running or when the result omits the fact.
- [x] A body is omitted when it would merely repeat the humanized MCP title, status marker, or raw details.
- [x] Every known framework inspection omits the generic raw MCP disclosure and uses one self-contained semantic header unless an additional body adds distinct information.
- [x] Running, successful, and failed inspection calls use the shared accessible status position and never append redundant completion text.
- [x] Referenced-task links use ordinary internal navigation behavior and do not create destinations for non-navigable identifiers.
- [x] Runtime-adapter coverage exercises every read-only framework MCP contract with representative running, successful, and failed evidence where applicable.
- [x] Browser coverage verifies semantic scopes, task links, absence of duplicated prose, raw-details availability, keyboard operation, containment, and dark/light appearance.

## Answer

Implemented typed semantic presentations for every read-only coordination MCP
contract. Runtime transcript capture now retains authoritative operating-run,
board, task, archive, collaborator, and current-task facts, while task listings
retain their requested board and column scope from the production contract.

The conversation dialog renders those typed scopes as one compact header,
preserves authoritative display names, links navigable task references through
ordinary internal navigation, omits raw MCP disclosures for known framework
calls, and keeps status, focus, containment, and both appearance themes
accessible. Runtime-adapter and browser coverage exercise running, successful,
and failed evidence, authoritative-result precedence, production-contract
fallbacks, keyboard navigation, long narrow-viewport content, and dark/light
appearance.
