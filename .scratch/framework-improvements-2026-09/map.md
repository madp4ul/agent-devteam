# Framework improvement intake — September 2026

This intake records ten user-reported issues dictated on 2026-09-20. Nine were
reported as existing GitHub issues; issue 08 was added during the conversation.
GitHub URLs and numbers were not supplied, and the originals were not fetched.
The user's account below is the source, not independent reproduction or diagnosis.

Each issue has its own file. This is a backlog intake, not an agreed implementation
specification. All issues remain open; none is labelled `ready-for-agent`.
Numbering follows the supplied order, with the shared MCP design preceding the
participant-addressing issue that depends on it. It does not assign priority.

## Issues and suggested next steps

| Issue | Request | Next step |
| --- | --- | --- |
| [01](issues/01-evaluate-mcp-usage-by-context-position.md) | MCP usage by context position, per tool and per conversation | Research call-time evidence, then grill the statistics design |
| [02](issues/02-stop-conversation-scroll-snapback.md) | Stop conversation scrolling from snapping back to the bottom | Reproduce and diagnose the scroll-follow bug |
| [03](issues/03-preserve-board-navigation-state.md) | Restore board state when returning from task details | Reproduce navigation-state loss and choose the smallest fix |
| [04](issues/04-reduce-routine-permission-interruptions.md) | Reduce permission interruptions for routine authorized commands | Investigate concrete denials and simpler supported policy options |
| [05](issues/05-open-local-file-links-from-comments.md) | Make task-comment local file links open the actual file | Reproduce URL handling and clarify the opening experience |
| [06](issues/06-attach-files-to-tasks-and-comments.md) | Attach files directly to tasks and comments | Grill ownership, lifetime, and agent file access |
| [07](issues/07-keep-task-movement-controls-accessible.md) | Sticky Move Task controls and one-click next-column movement | Clarify next-column edge cases, then specify the UI change |
| [08](issues/08-use-full-height-conversation-dialog.md) | Use the browser's full height for the conversation dialog | Specify and verify the full-height overlay layout |
| [09](issues/09-redesign-cross-task-mcp-capabilities.md) | Inventory and redesign MCP tools for broad board collaboration | Wayfinder / grill-with-docs for capabilities and invariants |
| [10](issues/10-address-agents-on-other-tasks.md) | Address the correct task-scoped agent participant | Resolve addressing within issue 09's capability design |

## Workflow and relationships

Use the repository's development workflow: clarify uncertain requirements, then
write the agreed `spec.md` in a dedicated effort and publish dependency-aware
implementation tickets. Retain backlinks to these intake issues. Decision work
that recommends implementation must publish follow-up tickets before resolution.
Do not treat the proposed evaluation criteria here as already agreed designs.

Issues 02 and 08 share the conversation UI but can be investigated independently.
Issue 03 concerns navigation away from the board, not modal transcript scrolling.
Issues 05 and 06 both concern files but describe separate defects/capabilities.
Issue 10 depends on the relevant capability decisions from 09; its scenario and
identity requirements should inform that design from the start. Issue 01 can
evaluate MCP changes later but is not a prerequisite for 09 or 10.

For browser changes, apply repository dark/light appearance requirements and
accessible controls. Any new icon-only button pattern uses shared decorative SVGs
and browser coverage of icon/button geometric centering.

## Decisions so far

None. The reports, candidate approaches, and unresolved questions are captured;
no implementation, diagnosis, or architectural decision was made during intake.

## Comments

- 2026-09-20: Recorded from the user's dictation; preserve the concrete examples
  when converting these reports into specifications.
