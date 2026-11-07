# Compact durable command results

**Status:** delivered on 2026-11-02 — compact contract, historical migration and verified offline maintenance complete.
**Assessment:** [Ticket 07](issues/07-assess-active-command-response-storage.md).
**Evidence:** [Independent findings and experiment](active-command-response-storage-assessment.md).

## Problem Statement

Long-lived active tasks retain many command responses containing overlapping
copies of their complete histories. Archival cleanup helps finished tasks but
does not control active-task snapshot growth. The user wants substantial storage
reduction without losing work, duplicating commands, or disrupting the running
coordination framework.

## Solution

Use a deliberate compact command-result contract. Store the original command
outcome and facts needed to replay that result, while loading task content and
history through authoritative queries. Preserve duplicate protection across
retries and restarts. Safely convert historical response snapshots after proving
the mapping against source and migration fixtures.

This is a contract simplification, not a claim that IDs alone can reproduce the
existing full application response. The user approved recording this plan in
issues and initially held implementation while the project ran. On 2026-11-02,
the user stopped the project and explicitly authorized work on both tickets.
If retaining the full historical application response is required, lossless
compression remains the compatible alternative; it does not remove repeated
snapshot growth.

## User Stories

1. As a user, I want active-task storage to track actual commands and authored
   content rather than repeated copies of earlier history.
2. As an agent, I want a retry to return the original command's result without
   repeating a comment, task creation, movement, relationship or activation.
3. As a user, I want task creation and ordinary browser actions to behave as before.
4. As an agent, I want existing documented compact tool responses to remain stable.
5. As a user, I want task history, conversation evidence and cost records preserved.
6. As a user, I want an upgrade to preserve old retry keys and their original facts,
   with a verified recovery backup and atomic failure behavior.
7. As a user, I want disk-reclamation maintenance performed in a separate stopped
   project window, with its savings and retained backup storage clearly reported.

## Implementation Decisions

- Define compact results per command and retained outcome, including success,
  conflict and other retained rejections. Preserve all fields actually required
  by agent wire contracts and browser consumers. Explicitly account for direct
  application callers and update their contracts/tests together.
- Retain original operation facts such as created IDs, result revision, transition
  endpoints and original compact conflict state. A replay must not substitute
  today's task state for those historical facts.
- Keep history and task-body hydration in query operations. Do not populate
  receipts with complete task histories, activation lists or unrelated content.
- Preserve command ownership, retry-key isolation, atomic command/effect/result
  recording and current request-matching behavior. Keep normalized request data
  initially; request hashing is not needed to prove the principal improvement.
- Support replay of both existing snapshots and new compact records during a
  compatible transition. Cover all retained command families, lifecycle receipts
  and canonical/legacy aliases. Use released migration history to prevent older
  application versions from interpreting a new storage contract incorrectly.
- Convert existing snapshots from their own historical fields, not current task
  projections. Unknown or insufficient legacy shapes must have an explicit safe
  policy that preserves data or blocks with a recoverable diagnostic; never guess
  historical values or silently delete duplicate protection.
- Preserve the accepted archival policy. Active mutation receipts remain durable;
  task archival expires eligible task-owned receipts while preserving creation,
  lifecycle and unowned receipts as already documented.
- Treat database compaction as separate offline maintenance. Verify a fresh backup
  and exclusive project-state ownership before operating on an actual project.
  Preserve authoritative counts, row identities and receipt replay evidence.

## Testing Decisions

Prefer the existing application command/query seam backed by real isolated SQLite
stores, plus the existing agent/browser transport tests. Verify externally
observable effects and exact compact results rather than private serializer
implementation details.

- Retry after further comments, edits, pin changes, role-label changes, movement
  and restart; original operation facts remain unchanged and effects occur once.
- Same-key changed payloads still conflict; identical keys in distinct authorized
  caller scopes remain independent. Include creation and relationship retries.
- Browser creation still receives its task ID; comment/edit/move/relationship and
  lifecycle flows refresh correctly. Existing agent wire fields remain stable.
- Migrate representative historical success, conflict, rejection and alias
  records. Reopen and replay them; preserve keys, request matching and all
  authoritative history. Exercise backup/migration failure and unsupported data.
- Use deterministic synthetic histories to show that fixed-size mutation receipt
  size does not grow with unrelated prior task history. Measure payload and actual
  isolated SQLite allocation separately; report compression and CPU tradeoffs
  without extrapolating synthetic percentages into production savings.
- Verify archival regression coverage, migration/schema checks and typechecks;
  complete Standards and Spec reviews before user review of implementation.

## Out of Scope

- Changing the running idle-game framework or its database during assessment.
- Expiring retry protection using age, conversation retirement or model compaction.
- Deleting authoritative history, old backups, attachments or task workspaces.
- Automatic online VACUUM, an arbitrary storage cap, broad storage rewrites, or
  compression layered onto receipts without measured need.
- Promising bounded total storage while meaningful commands and authored content
  continue to accumulate.

## Further Notes

The proposal targets the duplication multiplier. Under bounded per-command
history growth, full historical snapshots produce approximately quadratic total
payload; fixed-size receipts plus normalized requests are approximately linear
in commands and authored bytes. This does not establish an exponential growth
law for the production database or predict its exact reclaimable size.

Delivery is recorded in [08](issues/08-use-compact-durable-command-results.md),
then [09](issues/09-convert-historical-command-response-snapshots.md), followed by
the stopped-project maintenance window authorized on 2026-11-02. No running
project was modified. The live database was reduced from 11.03 GB to 609 MB with
verified recovery backups and unchanged authoritative fingerprints.
