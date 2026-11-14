# Remaining success feedback inventory

Audited 2026-11-14. Success families S01–S16 are approved to **keep** with timed dismissal.

This inventory covers the floating **Operation feedback** surface. The final
policy retains **16 success families**. Success expires after five seconds of
unpaused time; hover or keyboard focus pauses it. Errors remain until closed.
Relationship removal has four wording variants grouped into one family.

## Floating success messages

| ID | Successful action and location | Message | Other visible response | Decision |
| --- | --- | --- | --- | --- |
| S01 | Task details → Edit task → Save task | `Updated T-….` | The dialog closes and the task content refreshes. | Keep |
| S02 | Move a task by board drag, task-position Column selection, or Next | `Moved T-… to COLUMN.` | The task changes column; task position and timeline refresh. | Keep |
| S03 | Archived task details → Unarchive task | `Unarchived T-…. A later activation will create a new workspace from the process starting ref.` | The Archived state disappears; the task returns to its retained column. | Keep |
| S04 | Task details → Relationships → More relationship types → Dependency → create | `Added dependency on TITLE.` | The dependency appears in Relationships. | Keep |
| S05 | Task details → Relationships → Change resume agent selection | `Updated resume agent.` | The selected agent changes on the relationship. | Keep |
| S06 | Relationships → remove control → confirm Remove relationship | `Removed dependency.`, `Removed dependent relationship.`, `Removed child relationship.`, or `Removed parent relationship.` | The relationship disappears. These are four directions/types of the same message family. | Keep |
| S07 | Task details → Relationships → Child task → Create task | `Created child T-….` | The dialog closes and the child appears in Relationships. Top-level task creation already has no success overlay. | Keep |
| S08 | Task details → Agent activity → queued activation’s dismiss control → confirmation | `Dismissed activation for AGENT.` | That activation leaves the queue; other eligible work may proceed. | Keep |
| S09 | Task details → Needs attention → Resolve interruption → Continue interrupted activation | `Continued T-….` | Suspension/activation state refreshes. This acknowledges the continuation command, not completion of the resumed run. | Keep |
| S10 | Task details → Needs attention → Resolve interruption → Dismiss activation → confirmation | `Dismissed interrupted activation for AGENT.` | The interrupted activation is dismissed and the attention state refreshes. | Keep |
| S11 | Task details → Post comment | `Comment posted.` | Draft clears; the timeline refreshes independently. | Keep |
| S12 | Task workspace → Copy path | `Copied task workspace path.` | Clipboard receives the path. | Keep |
| S13 | Task workspace → Open folder | `Open request sent to the default folder application.` | The host receives the open request. | Keep |
| S14 | Task workspace → Open in Visual Studio Code | `Open request sent to Visual Studio Code.` | The host receives the open request. | Keep |
| S15 | Markdown local-file link | `Opened LABEL.` | The host receives the file-open request. | Keep |
| S16 | Task details → Interrupt current attempt → matching attempt is confirmed interrupted | `Interrupted T-….` | The run stops and interruption recovery controls appear. Request acceptance alone produces no notice. | Keep |

S09/S10 are specific to the task-detail attention panel's completion callback.
Equivalent recovery controls reached elsewhere do not all publish these messages.

## Removed interruption progress messages

The former `Interrupting TASK-ID…` and `Interruption requested… Waiting for safe
shutdown.` overlays are removed. Pending state stays on the interruption button.
Only confirmation from the requested attempt's terminal interrupted state produces
S16. Tracking survives an accepted request followed by a failed refresh, so a later
ordinary task poll can still publish that confirmation.

## Local confirmations using other surfaces

These currently do **not** enter the floating operation-feedback queue:

| Location | Confirmation |
| --- | --- |
| Copy Markdown button | A temporary `Copied` tooltip/button appearance |
| Conversation attachment | `Uploaded` beside the attachment |

Loading indicators, lifecycle status chips and retained archival outcomes are
status presentation rather than floating success notices.

## Actions already without floating success feedback

Top-level task creation has no success overlay. Comment posting now publishes a timed
floating success notice, per the later review decision.
Archival uses its dedicated menu. Pause/Resume automation, marking a user mention
addressed, resource create/edit/archive, comment pin/unpin, conversation follow-up,
and conversation retirement also have no floating success producer in the current
client. Their controls/content/state changes provide their ordinary feedback.

## Recreate the review examples

The review server on port 3010 is stopped, and its generated environment and
assets have been removed. Reusable source remains in the repository:

1. Run `node --experimental-strip-types examples/software-delivery/ui-review.mjs`.
2. Run `node .scratch/operation-feedback-menus/seed-success-review.mjs`.
3. Use the task links printed by the seed; IDs can change after a fresh setup.

On the main review task, **Edit task → Save task** shows success even without a
text change. Close it or allow expiry before repeating identical feedback. The
Column selector can safely move between Backlog and Awaiting User Approval,
which have no watching agents. The dependency, child and archived companion
provide relationship-removal and unarchive examples.

For a repeatable error, open the dependency target and try adding the main review
task as its dependency with Architecture Designer as resume agent. The existing
reverse dependency makes this circular, so it is rejected without creating the
relationship. Cancel that dialog, then Edit task → Save task to compare success
and error. This path was exercised in the browser before teardown.

The [seed](seed-success-review.mjs) verifies an existing isolated workspace before
writing, creates passive examples without model activation, and preserves existing
examples on rerun. Its generated manifest is `environment/success-review.json`.
Queued and interrupted execution notices require the scripted run controls in the
[review guide](../../examples/software-delivery/UI-REVIEW.md).

## Source audit

The audit searched client `role: "status"` producers and traced their callbacks
into the page-owned `useOperationFeedback` queue and `OperationFeedback` portal.
Progress/inline status producers were classified separately.

| IDs | Source |
| --- | --- |
| S01 / S03 / S11 | [TaskPage.tsx](../../src/web/client/TaskPage.tsx) |
| S02 | [task-movement.ts](../../src/web/client/task-movement.ts), shared by BoardPage and TaskPage |
| S04–S07 | [TaskRelationshipsPanel.tsx](../../src/web/client/TaskRelationshipsPanel.tsx) |
| S08 / S16 | [AgentActivityPanel.tsx](../../src/web/client/AgentActivityPanel.tsx) |
| S09–S10 | [TaskAttentionPanel.tsx](../../src/web/client/TaskAttentionPanel.tsx) and [AttentionReasonAction.tsx](../../src/web/client/AttentionReasonAction.tsx) |
| S12–S14 | [TaskWorkspacePanel.tsx](../../src/web/client/TaskWorkspacePanel.tsx) |
| S15 | [MarkdownContent.tsx](../../src/web/client/MarkdownContent.tsx) |
| Queue, timing and duplicate suppression | [OperationFeedback.tsx](../../src/web/client/OperationFeedback.tsx) |

All families are source-verified. Browser coverage additionally exercises comment,
workspace and local-file feedback routing, timed dismissal, hover/focus pause,
persistent errors, and interruption confirmation with a failed refresh. Both
appearance themes cover the card and countdown presentation. Copy Markdown and
attachment confirmations retain their existing local surfaces. All notification
policy decisions from the review are implemented.
