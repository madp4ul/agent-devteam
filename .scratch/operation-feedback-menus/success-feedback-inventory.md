# Remaining success feedback inventory

Audited 2026-11-14. Success families S01–S15 are approved to **keep** with timed dismissal.

This inventory covers the floating **Operation feedback** surface. There are
**15 completed-command success families**, plus **two interruption progress
messages** using the same green surface. Relationship removal has four wording
variants, grouped under one family below. No notification triggers were changed
by this audit. Following the presentation review, success/status cards now expire
after five seconds, paused by hover or keyboard focus. Errors remain until
dismissed. The later review decisions below retain those success producers.

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

S09/S10 are specific to the task-detail attention panel's completion callback.
Equivalent recovery controls reached elsewhere do not all publish these messages.

## Green progress messages

| ID | Trigger | Message | Meaning | Decision |
| --- | --- | --- | --- | --- |
| P01 | Task details → Agent activity → Interrupt current attempt, immediately before its request | `Interrupting TASK-ID…` | Local acknowledgement that interruption was requested; the command may still fail. | Remove |
| P02 | The same interruption request returns and task state refreshes | `Interruption requested for T-…. Waiting for safe shutdown.` | The interruption command was accepted; this does not itself establish that shutdown finished. | Replace with one actual-completion notice |

One click can produce **both** P01 and P02 as separate feedback items. The run
controls also display their own interrupting state. Review decision: neither progress stage should spawn feedback. Show only one
notice when interruption actually succeeds; do not mistake request acceptance
for completed shutdown. This behavior change is recorded for the next pass.

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

## Try the real controls in the example

The passive examples are in the isolated software-delivery instance on port 3010:

- [Main review task — T-0011](http://127.0.0.1:3010/tasks/T-0011): S01, S02, S04–S07.
- [Dependency target — T-0012](http://127.0.0.1:3010/tasks/T-0012): reverse dependency-removal variant of S06.
- [Child example — T-0013](http://127.0.0.1:3010/tasks/T-0013): parent-removal variant of S06.
- [Archived companion — T-0014](http://127.0.0.1:3010/tasks/T-0014): S03 via Unarchive task.

For the simplest example, open T-0011, click **Edit task**, and click **Save task**.
Saving without changing any text also produces the notification; this was verified
in the browser. The existing floating `Updated T-0011.`
message appears. Close it with X, then repeat. Identical messages are suppressed
while an existing copy is still visible, so dismiss or let it expire between trials.

For a real, repeatable **error** on T-0012, open **Relationships → More relationship
types → Dependency**, select **Review success messages (T-0011)**, choose
**Architecture Designer**, and click **Create dependency**. The existing reverse
dependency makes this circular, so the command is rejected without adding a
relationship. Cancel the dialog, then **Edit task → Save task** to see success and
error together. The green card expires; the red card stays until X. This example
was exercised in the browser with the revised presentation.

For S02, use the **Column** selector to move between **Backlog** and **Awaiting
User Approval**. Both have no watching agent. Avoid the Next shortcut for this
particular trial because the next column after Backlog is watched.

T-0011 starts with a dependency and a child relationship. You can change their
resume agents, remove them, add the dependency again by selecting T-0012, or
create another child in Backlog. Keep these examples in unwatched columns while
reviewing success notices. S08–S10 and P01/P02 need queued/interrupted agent work;
they are source-traced here and are not seeded by this passive example.

Creation of these examples invokes only the local application API. It does not
generate UI notifications itself, resume automation, or activate a model.
The repeatable seed is [seed-success-review.mjs](seed-success-review.mjs); it
verifies the isolated project's workspace path and preserves existing review
tasks when rerun. Its generated task-ID manifest lives in the ignored
`environment/success-review.json`.

## Source audit

The audit searched client `role: "status"` producers and traced their callbacks
into the page-owned `useOperationFeedback` queue and `OperationFeedback` portal.
Progress/inline status producers were classified separately.

| IDs | Source |
| --- | --- |
| S01 / S03 | [TaskPage.tsx](../../src/web/client/TaskPage.tsx), lines 451 / 294 |
| S02 | [task-movement.ts](../../src/web/client/task-movement.ts), line 32; shared by BoardPage and TaskPage |
| S04–S07 | [TaskRelationshipsPanel.tsx](../../src/web/client/TaskRelationshipsPanel.tsx), lines 68, 87, 103, 266; removal labels at line 499 |
| S08 / P01 / P02 | [AgentActivityPanel.tsx](../../src/web/client/AgentActivityPanel.tsx), lines 180 / 80 / 84 |
| S09–S10 | [TaskAttentionPanel.tsx](../../src/web/client/TaskAttentionPanel.tsx), line 51; interruption callbacks in [AttentionReasonAction.tsx](../../src/web/client/AttentionReasonAction.tsx) |
| Queue presentation and duplicate suppression | [OperationFeedback.tsx](../../src/web/client/OperationFeedback.tsx), lines 13–50 |

All 10 families above are source-verified. The live example provides actual
existing product controls; runtime validation is recorded in the implementation
ticket after exercising its edit/save path. The user subsequently approved retaining S01–S10 with timed dismissal.
Interruption and local-confirmation changes below are recorded for the next pass.

## Recorded review decisions

The user approved retaining S01–S10 with five-second dismissal. A subsequent
review adds comment success (S11) and moves workspace/file confirmations into the
floating surface (S12–S15). Top-level task creation remains without a success notice.

Decisions and implementation status:

- Interruption: remove both progress overlays and show a single confirmation only
  when interruption actually succeeds. This remains a follow-up.
- Workspace Copy path, Open folder and Open in Visual Studio Code: move their
  confirmations to the shared floating feedback surface. Implemented, including errors;
  pending open requests use the button state instead of a progress message.
- Markdown local-file links: use shared floating feedback instead of adjacent
  Opened text. Implemented for success and failure.
- Copy Markdown and conversation attachment confirmations: retain their existing
  local presentation.

The workspace, local-file and comment changes are now implemented. Copy Markdown
and conversation attachment indicators retain their existing local presentation.
Interruption-progress consolidation remains separate from this presentation pass.
