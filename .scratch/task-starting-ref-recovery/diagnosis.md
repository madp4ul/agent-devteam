# T-0173 workspace startup diagnosis

Observed 2026-10-22 through the running idle game host's HTTP GET API and a
SQLite connection opened with `readOnly: true`. No live mutation, database write,
process restart, worktree operation, or agent message was issued.

## Evidence

- Project: `D:/Daten/Projekte/Software/Codex/idle-games`.
- Host: localhost port 3000, Node process 24768 at inspection time.
- Task: T-0173, sequence 173, revision 1.
- Configured starting ref: `8de3b8c4bc`.
- Initial failure: 2026-10-21 23:59:42 UTC, starting-ref-resolution,
  `fatal: Needed a single revision`.
- Integrator comment: 2026-10-22 00:00:34 UTC, correct starting ref
  `8de3b8c4bb149af82a9b41be34e1bb362ff717ad`.
- Read-only Git rev-parse verified that full corrected commit exists.
- User retry resolved the first failure at 2026-10-22 19:19:41 UTC.
- Retry left activation d11dc3b9-c66c-4691-9a20-9e04274652e4 running and
  dispatch claim 17927706-fa20-4d81-b2d7-2a7ffb5d1a22 unconsumed.
- No task workspace row, no attempt.started activity, no Codex thread.
- API hides the unpublished claimed attempt from attempt history, explaining
  why the conversation is empty despite the running indicator.
- No Git subprocess was running at inspection time.

## Reproduction and cause

Public application test with a temporary Git repository and SQLite database:

```powershell
node --experimental-strip-types --test --test-name-pattern='retrying an unresolved starting ref' test/application/activation-recovery.test.ts
```

Before fix: expected failed, actual running. The retry response diagnostic was
`UNIQUE constraint failed: activation_startup_failures.activation_id`.

Ranked explanations tested: second startup record conflicts with the first;
failure cleanup cannot release the dispatch claim; Git remains pending.
The first explains both the deterministic reproduction and live evidence.
Failure settlement inserts a record keyed by activation_id, but user retry only
resolves the old record. The second INSERT fails, rolling back cleanup and
leaving a phantom running claim. Automation pauses after the rejected pump.
No implementation agent actually started on T-0173.

The correction comment cannot update task_starting_refs. Existing task.edit only
accepts content, so the integrator correctly recognized a missing capability.

## Fix and recovery boundary

Repeated failures update the activation's current startup diagnostic through
UPSERT, reopen it as unresolved, settle the activation, and produce fresh
attention. This uses the existing schema and timeline update trigger. Prior
attention occurrences and retry activity remain retained.

Optional task.edit startingRef corrections use the existing command authority.
Reject corrections once preparation is claimed or the workspace exists; content
edits remain independent. Agent inspection discloses that lifecycle.

The already-running host retains old code. Source edits do not repair its live
claim. Normal host restart recovers abandoned running attempts and starts paused;
this existing behavior is covered by restart-recovery tests. Once the updated
host is running, correct T-0173 through the supported edit command, then use its
ordinary Retry/Resume flow as appropriate to its recovered state. Do not delete
the task, recreate its worktree manually, or patch database rows.

Restart may affect other active tasks. This investigation leaves the live host
and database unchanged so the user can choose when to adopt the fix.

After restarting with this change, the user can correct the ref through the
supported HTTP adapter while automation remains paused:

```powershell
$taskDetail = Invoke-RestMethod http://127.0.0.1:3000/api/tasks/T-0173
if ($taskDetail.inspection.workspaceStatus.startingRefEditable -ne $true) {
  throw 'Task starting ref is not currently editable; inspect workspaceStatus.'
}
$correction = @{
  startingRef = '8de3b8c4bb149af82a9b41be34e1bb362ff717ad'
  expectedRevision = $taskDetail.task.revision
  idempotencyKey = [guid]::NewGuid().ToString()
} | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri http://127.0.0.1:3000/api/tasks/T-0173 `
  -ContentType 'application/json' -Body $correction
```

This command is documented for review and was not executed against the live
project. It edits only the ref, using current revision validation and the
server's transactional workspace guard. Inspect the task afterward and use
normal Retry (if failed) and Resume when ready to run queued work.
