# 04 — Restore the existing conversation-history release gate

Status: resolved — aligned with issue 107; full behavioral gate passes.

Type: task

Blocked by: none.

Former publication blocker: resolved by aligning the obsolete test with issue 107.

Parent: [Specification](../spec.md).

What to build: diagnose and correct the pre-existing failure in retained
self-authored activation source history, so the unchanged full behavioral gate
can pass before a shared release is published.

- [x] Use the repository diagnosing-bugs/implement workflow and reproduce the exact self-authored conversation-history assertion through the existing application seam.
- [x] Establish the intended history/provenance contract before changing behavior or expectations; do not skip or weaken the gate to publish a package.
- [x] Preserve retained history, thread continuity, source provenance and runtime permissions.
- [x] Verify the focused regression, typechecking and full normal suite without paid model calls or live project state.
- [x] Respect user-owned staging/commits/pushes and account for any still-source-based live hosts before runtime edits.

## Evidence

The same assertion already failed during the earlier workspace-permission work,
the initial local-release full suite, and this shared-release full run. The
release changes leave application source and this test unchanged. See
[verification](../verification/results.md) for results and publication boundaries.

## Comments

- 2026-11-14: Recorded as a dependency-aware follow-up; the shared-release CI gate intentionally remains enforced.

## Answer — align the obsolete scenario with the newer comment contract

The user's clarification is confirmed by
[issue 107](../../agent-coordination-framework/issues/107-reject-agent-self-mentions-in-comments.md).
It explicitly requires same-task executable self-mention comments to reject
atomically, without persisting a comment or creating activations, and permits a
corrected plain progress note under the rejected command's idempotency key.
The former test attempted exactly that now-forbidden self-activation. This was
an outdated test scenario, not evidence of a retained-history implementation bug.

[Issue 82](../../agent-coordination-framework/issues/82-omit-self-authored-comments-from-continuation-updates.md)
still requires valid own comments to remain in durable history while omitting
their already-retained text from same-thread incremental continuation. The test
now combines the supported contracts at the existing application/conversation
seam: an active agent's self-mention rejects with unchanged task state; the
corrected plain note is accepted with no extra activation; a legitimate user
request resumes the same thread; the plain note remains in task history without
being repeated in incremental comments.

No runtime/application code or assertion about supported history was removed.
Basic mixed-mention atomicity, cross-task same-role consultation and retries
remain covered by the existing mention tests.

Validation:

- Red: the former focused test failed at its comment-acceptance assertion
  (`false !== true`, line 154).
- Green: the replacement focused test passed; all 24 conversation, mention and
  cross-task mutation tests passed. Typechecking passed. The full integrated
  suite is recorded by the coordinating implementation agent after completion.
- Changes remain unstaged, including this additional working-tree layer over
  the user's staged ticket. No index, live host, database or native model changed.

## Integrated verification

The final normal suite passed: 557 tests, 550 passed, 7 skipped, zero failures. Standards/Spec reviews have no remaining findings. [Retention verification](../../release-retention/verification/results.md) records the originating-ticket alignment and successful full gate. Runtime behavior was unchanged.
