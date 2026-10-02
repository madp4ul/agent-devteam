# Cross-task coordination delivery

Source: framework improvement decisions [09](../framework-improvements-2026-09/issues/09-redesign-cross-task-mcp-capabilities.md)
and [10](../framework-improvements-2026-09/issues/10-address-agents-on-other-tasks.md).
Contract: [spec.md](spec.md). These are implementation tickets, not more open design
alternatives. Read the specification and its referenced acceptance examples before
changing behavior. Do not infer task completion from this design handoff.

| Ticket | Slice | Blocked by |
| --- | --- | --- |
| [01](issues/01-cross-task-comments-and-participant-discovery.md) | Authorized cross-task comments, task participants, and visible provenance | None |
| [02](issues/02-generalize-task-and-relationship-commands.md) | Create/edit/move and relationship parity across project tasks | 01 |
| [03](issues/03-curate-pinned-comments-in-tools-and-browser.md) | Pin/unpin and atomic pinned creation through MCP and browser | 01 |
| [04](issues/04-read-unified-history-with-stable-word-target-cursors.md) | Shared history JSON, whole-record pages, inspection, stable handles/counts | 01, 03 |
| [05](issues/05-compose-bounded-activation-updates-and-net-pin-changes.md) | Durable activation checkpoints, boundary continuation, pin deltas, guidance | 02, 03, 04 |
| [06](issues/06-verify-complete-mcp-contract-and-publish-reference.md) | Assembled regressions, complete reference/architecture reconciliation, review | 01–05 |
| [07](issues/07-refine-pinned-comment-controls-and-activity.md) | User-reviewed compact pin/source controls, reversal window and identifying activity | Delivered pin capabilities |
| [08](issues/08-expand-pin-activity-and-diagnose-source-scroll.md) | Preview delivered; remaining scroll glitch open, low-priority and explicitly deferred | 07 |

Intake 12's interactive user instruction audit is now unblocked by delivery of 05
and verification in 06. Intake 21 is separately open; this effort preserves comment IDs without
designing arbitrary authored comment links. Attachment expansion remains intake 06.
Issue 15's accepted relationship ownership/scheduling semantics remain the baseline.

## Working agreement

- Preserve staged content; leave all work unstaged. The user owns commits/pushes.
- Read architecture.md before authoritative flows/state ownership changes, update
  it in the corresponding implementation, and record the required ADR/glossary changes.
- Use released migrations and migration/snapshot/restart checks for durable state.
- Verify behavior at application, HTTP/MCP, runtime composition, and relevant browser
  seams. Apply repository TDD/review workflow during implementation.
- Keep this chat for implementation if the user chooses; tickets support a precise
  handoff without losing the design. Do not begin product edits merely by publishing
  these delivery tickets.

## Decisions so far

- 2026-10-02: [08](issues/08-expand-pin-activity-and-diagnose-source-scroll.md)
  delivers expandable pin activity previews and separate source icons. The user
  accepted these improvements and deferred the remaining scrolling glitch.
  Claim released; retain evidence without automatically resuming diagnosis.

- 2026-10-02: [07](issues/07-refine-pinned-comment-controls-and-activity.md) delivers
  the user-reviewed UI refinement: compact SVG pin/source controls, side actions,
  two-second keyboard-reversible unpin retention, identifying activity links and
  single-entry atomic pinned creation. Full non-browser suite: 353 passed/4 skipped;
  affected browser suites: 51 passed, plus focused checks after keyboard refinement.
  Typecheck/build pass; Standards and Spec reviews are clear. Changes remain unstaged.

- 2026-09-30: Product grilling synthesized into a concrete contract and six delivery
  slices. Implementation remains open. targetWords defaults to 2000 as an engineering
  default; whole records/pins can exceed it. Cursor checkpoint-stop behavior is mandatory.
- 2026-09-30: [01](issues/01-cross-task-comments-and-participant-discovery.md) delivered
  cross-task comments, task-local participant discovery, durable origin attribution,
  guarded comment retries, and browser/runtime presentation. Full non-browser suite
  337 passed/4 skipped, affected browser suites 44 passed, typecheck/build passed;
  Standards and Spec reviews have no outstanding findings. Changes await user review
  unstaged. Tickets 02 and 03 are now unblocked; no later slice has been started.
- 2026-09-30: [02](issues/02-generalize-task-and-relationship-commands.md) delivered
  generalized task creation/editing/movement and outgoing relationship commands,
  guarded caller-scoped retries, compact MCP responses, concrete origin activity,
  and destination-aware transcript/timeline presentation. Cross-task watcher entry
  remains distinct from a local responsibility claim. Non-browser suite: 345 passed,
  4 skipped; affected browser coverage: 33 passed including the focused repaired
  delivery proof; typecheck/build passed. Standards and Spec reviews are clear.
  Changes await user review unstaged; no ticket 03+ work has been started.
- 2026-10-01: 03 delivered shared pins and browser/MCP curation; 346 non-browser
  tests passed/4 skipped, focused browser check passed, typecheck/build and review
  complete. 04 is claimed next; remaining slices proceed in this implementation run.
- 2026-10-01: 04 and 05 delivered whole-record history, stable project-signed
  cursors, inspection interchange, bounded metadata, atomic conversation checkpoints,
  net pins, JSON source boundaries and the twenty-tool names. Review findings were
  repaired at public seams. Non-browser suite: 350 passed/4 skipped; typecheck/build
  pass. 06 now verifies the assembly and reconciles the final public reference.
- 2026-10-01: 06 delivered assembled verification and the final public reference;
  all six delivery tickets are resolved. See [verification.md](verification.md).
  Non-browser suite: 353 passed/4 skipped; typecheck/build pass. Full browser run:
  169 passed and one layout-measurement timing failure, repaired with a settled-layout
  assertion and then ten consecutive passes. All 170 browser cases have passing
  evidence. Standards and Spec reviews have no outstanding findings. Intake 12 is
  ready for user-led review; other intakes remain separate. Changes remain unstaged.
