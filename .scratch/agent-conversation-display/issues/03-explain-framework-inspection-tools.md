# 03 — Explain framework inspection tools

**What to build:** Give every read-only coordination-framework MCP call a
tailored compact presentation that states the authoritative scope inspected.
The presentation adds useful domain context without repeating its MCP title or
status, links task references when a task page is a meaningful destination,
and retains the generic raw-details disclosure for exact evidence.

**Blocked by:** 02 — Identify generic MCP calls and disclose their evidence

**Status:** ready-for-agent

- [ ] Operating-context inspection identifies the run context inspected without repeating the `Coordination · Inspect operating context` title.
- [ ] Board summaries identify the board scope returned when reliable result data is available.
- [ ] Task listing identifies the requested board and columns while running and prefers authoritative returned scope when available.
- [ ] Task inspection identifies the inspected task and links its task page.
- [ ] Task activity inspection identifies and links the task whose activity was read.
- [ ] Task attachment inspection identifies and links the task whose attachments were read.
- [ ] Collaborator listing identifies the collaborator-directory scope without adding a duplicate success phrase.
- [ ] Current-task inspection identifies and links the current task.
- [ ] Tailored bodies prefer authoritative result facts over requested arguments, falling back to arguments only while running or when the result omits the fact.
- [ ] A body is omitted when it would merely repeat the humanized MCP title, status marker, or raw details.
- [ ] Each call retains one disclosure containing its exact server/tool identifiers, arguments, result, and diagnostic evidence.
- [ ] Running, successful, and failed inspection calls use the shared accessible status position and never append redundant completion text.
- [ ] Referenced-task links use ordinary internal navigation behavior and do not create destinations for non-navigable identifiers.
- [ ] Runtime-adapter coverage exercises every read-only framework MCP contract with representative running, successful, and failed evidence where applicable.
- [ ] Browser coverage verifies semantic scopes, task links, absence of duplicated prose, raw-details availability, keyboard operation, containment, and dark/light appearance.

