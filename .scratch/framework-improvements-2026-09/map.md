# Framework improvement intake — September 2026

This intake records twenty-eight user-reported issues dictated on 2026-09-20,
2026-09-23, 2026-09-26, and 2026-09-30. Nine of the original ten were reported as existing
GitHub issues; issue 08 and issues 11–21 were added during the conversations.
Issues 22–28 were supplied as existing GitHub issues on 2026-09-30.
GitHub URLs and numbers were not supplied, and the originals were not fetched.
The user's account is the source except where an issue explicitly records
separate investigation evidence.

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
| [09](issues/09-redesign-cross-task-mcp-capabilities.md) | Inventory and redesign MCP tools for broad board collaboration | Design resolved; six cross-task coordination delivery slices published |
| [10](issues/10-address-agents-on-other-tasks.md) | Address the correct task-scoped agent participant | Design resolved within issue 09; implementation/regression delivery open |
| [11](issues/11-collapse-long-task-descriptions.md) | Collapse task descriptions longer than 15 lines behind Show more / Show less | Implemented; user review |
| [12](issues/12-audit-agent-instructions-with-user.md) | Audit all agent instructions for unintended restrictions | After issue 09's instruction refinement is delivered, review the resulting inventory with the user |
| [13](issues/13-support-tables-in-markdown-content.md) | Render tables in every Markdown content surface without widening the UI | Implemented; user review |
| [14](issues/14-avoid-redundant-activation-after-follow-up-move.md) | Do not reactivate a running follow-up agent when it moves into its watched column | Extend and verify the existing mention-activation exception semantics |
| [15](issues/15-redesign-blockers-around-explicit-resume-agents.md) | Replace task-wide execution blocking with explicit per-relationship resume responsibility | Implemented; user review |
| [16](issues/16-navigate-timeline-with-column-movement-map.md) | Navigate long timelines through a compact column-lane movement map | Implemented; user review and tuning |
| [17](issues/17-compact-routine-timeline-activity.md) | Compact routine timeline activity while preserving items that merit attention | Define reliable prominence signals and filtering behavior before implementation |
| [18](issues/18-widen-task-detail-content.md) | Give long task-detail content more horizontal room | Inspect representative content and agree the desktop width |
| [19](issues/19-anchor-live-timeline-refresh-at-visible-top.md) | Anchor live timeline refresh at the top of the unobscured reading area | Implemented; user review |
| [20](issues/20-bound-task-detail-projection-cost.md) | Keep task-detail load cost independent of unrelated task history | Implemented; user review and restart-based rollout verification |
| [21](issues/21-link-to-task-comments-by-stable-address.md) | Link to comments on the current task or another task by stable address | Agree syntax and exact-comment navigation separately from issue 09 |
| [22](issues/22-show-task-description-hidden-line-counts.md) | Count additional lines on task-description Show more | Extend the existing disclosure and verify rendered-line counts |
| [23](issues/23-reflect-current-page-in-browser-tab-titles.md) | Distinguish framework views and tasks in browser tab titles | Implemented; user review |
| [24](issues/24-investigate-task-position-spacing-and-initial-reveal.md) | Investigate retained Task position gaps and description-dependent initial reveal | Check recent fixes and reproduce before proposing changes |
| [25](issues/25-dock-add-comment-on-initial-load.md) | Position Add Comment correctly before the first scroll | Implemented; user review |
| [26](issues/26-display-interruption-resume-instructions.md) | Show resume events and supplied instructions in timeline and conversations | Inspect retained evidence and specify both projections |
| [27](issues/27-recover-stalled-work-without-user-attention.md) | Wake an agent when watched work stalls without required user attention | Define eligibility, recovery ownership, and loop prevention |
| [28](issues/28-redesign-coordination-across-task-worktrees.md) | Reliably share and integrate parent/child work across task worktrees | Discuss source selection, task branches, synchronization, and integration |

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
depends on delivery of issue 09's framework-guidance and MCP-description refinement
so its user review does not cover wording scheduled for replacement. It
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

Issue 19 refines the live timeline anchoring delivered by the original
coordination framework. It should remain compatible with issue 16's movement
navigation and issue 17's future compaction, but neither blocks the top-edge
anchoring change.

Issue 20 is supported by a read-only projection investigation. Narrow the
task-detail contract and remove cross-task history loading before considering a
polling reduction; a slower poll alone would mask the confirmed projection
cost. Any supporting indexes must follow the released migration workflow.

Issue 22 refines issue 11 using the existing timeline/comment line-count precedent.
Issues 24 and 25 share initial-layout investigation but remain separate reports:
Task position spacing may already be fixed, while Add Comment should dock before
any scroll event. Compare description lengths and expansion state in both.
Issue 26 covers retained resume evidence in both timeline and conversation views.

Issues 27 and 28 are open design work rather than ready implementation slices.
Issue 27 must align with authoritative activation/attention lifecycle and issue
12's instruction audit. Issue 28 revisits the original Git workspace lifecycle
and should align with issue 09's cross-task tools; one branch per task and a
symbolic parent-commit selector remain proposals until the design is agreed.

For browser changes, apply repository dark/light appearance requirements and
accessible controls. Any new icon-only button pattern uses shared decorative SVGs
and browser coverage of icon/button geometric centering.

## Decisions so far

- [09](issues/09-redesign-cross-task-mcp-capabilities.md) and
  [10](issues/10-address-agents-on-other-tasks.md): grilling resolved project-wide
  coordination, destination-local participant addressing, explicit task selectors,
  REST-inspired MCP names, whole-record paged history, and shared curated pins.
  [Specification](../cross-task-coordination/spec.md) and
  [six delivery slices](../cross-task-coordination/map.md) preserve exact cursor,
  attribution, retry, and pin examples. Design is complete; implementation remains
  open. Intake 12 waits for delivered guidance and its final verification (05/06).
- [18](issues/18-widen-task-detail-content.md): widened task details from
  `76rem` to `86rem` and shifted the desktop primary/sidebar allocation from
  2:1 to 7:3, adding about 81–147 px to representative narrative content while
  preserving sidebar controls, local overflow, themes, and responsive stacking.
- [20](issues/20-bound-task-detail-projection-cost.md): task details now read
  only the inspected task's history, return task-free board metadata, and use
  deduplicated compact relationship references. Released task-scoped indexes
  and an investigation-scale HTTP regression keep unrelated history from
  changing the response or being hydrated; one-second polling remains in place.
- [19](issues/19-anchor-live-timeline-refresh-at-visible-top.md): passive task
  polling now preserves the unique timeline record nearest the sticky header's
  lower edge at the same header-relative offset, without changing active
  command refreshes or explicit navigation.
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
- [15](issues/15-redesign-blockers-around-explicit-resume-agents.md): unresolved
  relationships become visible “Waiting on” state rather than execution gates;
  each relationship has one explicit, editable resume owner and every target
  completion queues its own ordered, relationship-specific activation. Removal
  creates history but no wake-up, while migration and removed-agent repair use
  the existing startup-impact workflow.

- [25](issues/25-dock-add-comment-on-initial-load.md): implemented composer docking
  remeasurement after initial description collapse, layout changes, and live
  section insertion/removal, with dark/light browser geometry coverage before
  scrolling. Task position spacing remains tracked independently in issue 24.

- [23](issues/23-reflect-current-page-in-browser-tab-titles.md): implemented
  task title and ID with application identity in tab titles; board titles name
  the process. Loading/error fallbacks and navigation/live rename browser
  checks prevent stale page identity. Ready for user review.

## Comments

- 2026-09-30: Added issues 22–28 after the user approved the read-only intake
  draft and authorized file creation. All seven were described as GitHub issues;
  references were not supplied. Issue 24 remains an unverified investigation,
  and issues 27–28 retain their open design questions.
- 2026-09-30: Added issue 21 from issue 09's pin/unpin context discussion;
  reference syntax and navigation design remain open for a separate session.
- 2026-09-20: Recorded from the user's dictation; preserve the concrete examples
  when converting these reports into specifications.
- 2026-09-23: Added issues 11–14 from a second dictation. Three further issues
  remained to be supplied by the user.
- 2026-09-23: Added the remaining issues 15–17 from the user's follow-up
  dictation, bringing this intake to seventeen issues.
- 2026-09-24: Split issue 18 from issue 16 during implementation review.
- 2026-09-26: Added issues 19–20 from live-use feedback. Issue 20 incorporates
  the supplied noninterfering investigation rather than claiming a new
  reproduction during intake.
