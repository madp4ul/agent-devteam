# Review-step consolidation: evidence and correction

## Adopted in V2 source, 7 November 2026

The user subsequently requested multiple focused Delivery reviewers and design
review by the original designer. Implemented route: Design -> Implementation ->
Design Review (same technical-designer on the same task) -> Code Quality ->
Code Review -> Completion. Design assessment precedes cleanup to avoid polishing
the wrong structure; independent code review follows cleanup so it sees final
changes. Invalidated assessments must be revisited. Non-code solutions receive
the corresponding design, clarity/maintainability and evidence perspectives.
Corrections and Integration retain their short independent-review routes.

Integrator instructions now distinguish unresolved worktree-local merge state
from committed combined failures. Integrator owns completing/aborting its merge;
separate investigation may reproduce exact base/ours/theirs commits. A committed
combined SHA can seed a correction task locally without a push. Runtime state,
untracked inputs and native resources need explicit reproduction or remain with
the existing owner. No success/acceptance claim follows merely from a commit.

Validation and focused structural assertions passed. Fingerprint:
`69e5e3e45d86215b1580dfbb242332a76d2a5ba4ecb65cc1c27c8116b47af6fe`.
No running process was restarted or migrated, and nothing was staged. The older
single-Delivery-review diagrams are now historical; update before reusing them.

## Evidence and preceding discussion

7 November 2026. The user asked whether removing V1's Code Quality and Design
Verification stages was justified by evidence that they never returned work.
It was not. V2 consolidated their responsibilities into Code Review as a design
simplification, without establishing equivalent coverage. Do not describe that
choice as an empirical finding that the removed stages were ineffective.

Recounted from preserved offline `historical/T-*-activity.json`, selecting
`task.moved` events with both endpoints in the normal Delivery order and the
destination earlier than the source:

| Source stage | Backward moves | Distinct tasks |
| --- | ---: | ---: |
| Code Quality | 17 | 17 |
| Code Review | 32 | 29 |
| Design Verification | 7 | 7 |

These are movements from stages, not unique defects or a causal effectiveness
comparison. They omit findings handled without a backward move and direct quality
edits. Historical process changes and missing archived transcripts limit analysis.

Concrete useful feedback exists on T-0179:
- Quality comment 5222 identifies recurring deep-material landmarks; implementer
  comment 5224 accepts it and retracts an overly strong success claim.
- Design Verifier comment 5283 identifies repeated exposed cliff-face fractures
  from a single periodically reused source; comment 5304 verifies the correction.

See [retained comments](../local-evidence/autonomous-process-assessment/historical/T-0179-comments.json)
and [broader findings](broad-patterns.md). This counterevidence was already present
in the original assessment; consolidation should have been labelled experimental.

Discussion direction, not applied role changes: retain independent Code Review;
consider having the original Technical Designer review whether implementation
realizes the design and whether its assumptions still hold. This improves rationale
continuity but loses an independent design perspective, so it cannot replace all
independent scrutiny. Keep the quality responsibility explicit and do not remove
its distinct pass on the premise of zero feedback. Compare substantive features
with short correction tasks instead of forcing one pipeline onto both.

Applied separately: V2 board order is now Direction, Integration, Delivery,
Corrections, Assessments. Definition validation passed with fingerprint
`0f851131f6ae80bf32f95deb054d370dd5d791b46f06ebb39eedc2f2697b0575`.
No live restart, board mutation, review-role change or Git staging was performed.

Diagram wording clarification: "Return to P registered" means that creating I
also records a relationship whose completion consumer is Product Lead on P.
P does not move or complete when I is created. A clearer label is "Create I;
on completion, wake Product Lead on P." The same applies to feature F returning
to Integrator on I. "Registered" is not a stage or status.
