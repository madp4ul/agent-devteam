# 06 — Attach files directly to tasks and task comments

**Type:** grilling
**Status:** open
**Blocked by:** None — design can begin from the existing follow-up workflow.
**Next step:** Grill attachment ownership, lifecycle, and agent access before specification.

## Problem and requested behavior

Files attached to agent conversation follow-ups have been useful, but that entry
point is too narrow. The user also wants to attach files directly to a task and
to an authored task comment so evidence can accompany the shared work itself.

When agents inspect a task or comment, file exposure should reveal the linked
file path, not automatically embed file contents in the inspection response.
Reading content should be a separate deliberate action, as similar as possible
to reading any other file using the runtime's ordinary tools. Dedicated reading
tools are optional only if needed. Copying a linked file into the task workspace
may be a useful agent action; automatic copying is not a requirement.

## Design completion criteria

- [ ] Define task-level and comment-level attachment creation and presentation,
  including whether files can be submitted without accompanying text.
- [ ] Define stable, usable file-path exposure to inspecting agents without
  automatically loading bytes, extracted text, or images into inspection results.
- [ ] Determine whether ordinary runtime file tools suffice; justify any separate
  framework reading tool and define its explicit invocation.
- [ ] Define ownership, visibility across task-scoped conversations, replacement,
  removal, archival, restart, relocation, and missing-file behavior.
- [ ] Clarify whether “linking” means durable uploads, references to existing host
  files, or both, including what happens if the source changes or disappears.
- [ ] Record the agreed specification and dependency-aware implementation tickets.

## Existing decisions and related work

[ADR 0014](../../../docs/adr/0014-store-conversation-attachments-in-bound-project-state.md)
deliberately keeps existing attachments conversation-owned and does not aggregate
them into task attachments. The new scopes require explicit design work; do not
silently expose existing private conversation attachments more broadly.
The [original follow-up attachment issue](../../agent-coordination-framework/issues/68-define-user-file-attachment-workflows.md)
provides the existing experience to build upon.

Resolve path accessibility alongside cross-task inspection in issue 09, without
making that larger redesign a prerequisite unless the chosen design needs it.

## Comments

- 2026-09-20: User-described GitHub issue; user explicitly anticipates further grilling.
