# Framework improvement intake — September 2026

This intake records seventeen user-reported issues dictated on 2026-09-20 and
2026-09-23. Nine of the original ten were reported as existing GitHub issues;
issue 08 and issues 11–17 were added during the conversations. GitHub URLs and
numbers were not supplied, and the originals were not fetched. The user's
account below is the source, not independent reproduction or diagnosis.

Each issue has its own file. This is a backlog intake, not an agreed implementation
specification. Issue files track current status; none was labelled `ready-for-agent` at intake.
Numbering follows the supplied order, with the shared MCP design preceding the
participant-addressing issue that depends on it. It does not assign priority.

## Issues and suggested next steps

| Issue | Request | Next step |
| --- | --- | --- |
| [01](issues/01-evaluate-mcp-usage-by-context-position.md) | MCP usage by context position, per tool and per conversation | Research call-time evidence, then grill the statistics design |
| [02](issues/02-stop-conversation-scroll-snapback.md) | Stop conversation scrolling from snapping back to the bottom | Implemented; user review |
| [03](issues/03-preserve-board-navigation-state.md) | Restore board state when returning from task details | Implemented; user review |
| [04](issues/04-reduce-routine-permission-interruptions.md) | Reduce permission interruptions for routine authorized commands | Investigate concrete denials and simpler supported policy options |
| [05](issues/05-open-local-file-links-from-comments.md) | Make task-comment local file links open the actual file | Implemented; user review |
| [06](issues/06-attach-files-to-tasks-and-comments.md) | Attach files directly to tasks and comments | Grill ownership, lifetime, and agent file access |
| [07](issues/07-keep-task-movement-controls-accessible.md) | Sticky Move Task controls and one-click next-column movement | Clarify next-column edge cases, then specify the UI change |
| [08](issues/08-use-full-height-conversation-dialog.md) | Use the browser's full height for the conversation dialog | Implemented; user review |
| [09](issues/09-redesign-cross-task-mcp-capabilities.md) | Inventory and redesign MCP tools for broad board collaboration | Wayfinder / grill-with-docs for capabilities and invariants |
| [10](issues/10-address-agents-on-other-tasks.md) | Address the correct task-scoped agent participant | Resolve addressing within issue 09's capability design |
| [11](issues/11-collapse-long-task-descriptions.md) | Collapse task descriptions longer than 15 lines behind Show more / Show less | Implemented; user review |
| [12](issues/12-audit-agent-instructions-with-user.md) | Audit all agent instructions for unintended restrictions | User and agent review the instruction inventory together before any edits |
| [13](issues/13-support-tables-in-markdown-content.md) | Render tables in every Markdown content surface without widening the UI | Implemented; user review |
| [14](issues/14-avoid-redundant-activation-after-follow-up-move.md) | Do not reactivate a running follow-up agent when it moves into its watched column | Extend and verify the existing mention-activation exception semantics |
| [15](issues/15-redesign-blockers-around-explicit-resume-agents.md) | Replace task-wide execution blocking with explicit per-blocker resume responsibility | Grill the blocker lifecycle, interaction model, and migration before specifying it |
| [16](issues/16-navigate-timeline-with-column-movement-map.md) | Navigate long timelines through a compact column-lane movement map | Implemented; user review and tuning |
| [17](issues/17-compact-routine-timeline-activity.md) | Compact routine timeline activity while preserving items that merit attention | Define reliable prominence signals and filtering behavior before implementation |
| [18](issues/18-widen-task-detail-content.md) | Give long task-detail content more horizontal room | Inspect representative content and agree the desktop width |

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

Issues 11 and 13 both affect rendered Markdown and should share renderer/layout
coverage where practical, but either may be delivered independently. Issue 12
requires the user's direct participation: do not turn it into an autonomous
implementation task or change instructions without reviewing the findings and
proposed wording with the user. Issue 14 should build on the narrow running
mention-activation exception recorded in the coordination framework rather than
introducing a separate activation model.

Issue 15 intentionally reopens the blocker lifecycle delivered by the original
coordination framework and requires a new design decision rather than a local UI
fix. Issues 16 and 17 both improve long-timeline scanning and should be designed
together enough to avoid competing controls, but movement navigation and
content prominence remain separate capabilities. Timeline prominence in issue
17 must not silently create or resolve the framework's formal user-attention
reasons.

Issue 18 was split from issue 16 after the movement map was placed in released
sidebar height rather than beside the timeline. It can be designed and
implemented independently.

For browser changes, apply repository dark/light appearance requirements and
accessible controls. Any new icon-only button pattern uses shared decorative SVGs
and browser coverage of icon/button geometric centering.

## Decisions so far

- [16](issues/16-navigate-timeline-with-column-movement-map.md): implemented a
  scroll-revealed movement map inside the sticky Task position panel, with
  fixed-scale landmarks, agent/user lane provenance, a timeline viewport frame,
  and direct navigation of the main timeline.
- [02](issues/02-stop-conversation-scroll-snapback.md): implemented immediate
  cancellation for upward history navigation, exact-bottom resumption, and
  long-content browser coverage across wheel, trackpad, keyboard, scrollbar,
  polling, and layout changes.
- [03](issues/03-preserve-board-navigation-state.md): implemented by extending
  existing history restoration; diagnosis and verification are in the ticket.
- [05](issues/05-open-local-file-links-from-comments.md): implemented secure
  host-native opening for workspace-local links across task-detail Markdown,
  with explicit feedback and browser/API regression coverage.
- [08](issues/08-use-full-height-conversation-dialog.md): implemented a
  conversation-specific full-height overlay that preserves the existing width,
  side backdrop, internal scrolling, controls, and modal interaction behavior.
- [11](issues/11-collapse-long-task-descriptions.md): implemented an accessible
  15-rendered-line task-description disclosure that remeasures formatted
  Markdown across responsive width, font, and appearance changes.
- [13](issues/13-support-tables-in-markdown-content.md): implemented shared GFM
  tables across task and conversation Markdown with semantic markup,
  theme-aware presentation, and keyboard-operable local overflow containment.
- [14](issues/14-avoid-redundant-activation-after-follow-up-move.md): generalized
  the running mention responsibility-claim invariant to conversation follow-ups,
  preserving the original activation and conversation while retaining ordinary
  cross-agent handoffs and retry behavior.

## Comments

- 2026-09-20: Recorded from the user's dictation; preserve the concrete examples
  when converting these reports into specifications.
- 2026-09-23: Added issues 11–14 from a second dictation. Three further issues
  remained to be supplied by the user.
- 2026-09-23: Added the remaining issues 15–17 from the user's follow-up
  dictation, bringing this intake to seventeen issues.
