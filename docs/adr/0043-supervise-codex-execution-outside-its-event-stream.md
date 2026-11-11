# Supervise Codex execution outside its event stream

Status: accepted

## Context

An agent launching interactive review software could retain its activation until
the user closed that software. Interruption awaited the SDK iterator, so its
confirmation and task ownership could remain blocked together. A disposable
Windows reproduction using the installed SDK 0.160.0 confirms that a detached
descendant inheriting stdout keeps iteration blocked after the native parent is
aborted. Ordinary non-detached child cancellation passes. This reproduces the
failure pattern; it does not prove every detail of the original live incident.

## Decision

Keep Codex and its SDK as the agent runtime. Run each SDK invocation in a small
framework-owned Node subprocess, forwarding input, configuration and ordered
events over IPC. One acknowledgement per event bounds buffered delivery. The
host continues to own projection, lifecycle persistence and coordination access.
Fresh, resumed and replacement invocations use the same boundary.

Explicit cancellation terminates the owned subprocess tree directly, without
waiting for SDK cooperation or closing its iterator first. On Windows use
`taskkill /PID <owned-worker> /T /F`; on POSIX use the dedicated process group.
Never select processes by name or terminate the host. Observe worker exit and
successful termination before settling the runtime. Normal SDK completion uses
a release handshake so the worker remains addressable during a concurrent
cancellation. SDK exceptions and early iterator closure terminate owned execution
before propagating errors; an exception alone does not confirm native exit.
After normal release the worker exits explicitly, closing any lingering SDK
stderr handles without waiting for detached review software. Unexpected host
IPC loss makes the worker terminate its own execution tree/group. Unexpected
worker death retains ownership on Windows when descendant termination cannot be
confirmed; POSIX cleanup targets the remaining group even after its leader exits.

The Windows termination command has a five-second deadline. Failure or timeout
logs a host diagnostic and leaves runtime settlement pending: elapsed time is
not proof that workspace execution stopped. Existing interruption confirmation,
task suspension, queue order and continuation remain application-owned.

## Windows termination error verification (2026-11-11)

Budget-rejected retries exposed a difference between taskkill's exit status and
process liveness: error 255 can report an already-exited descendant even after
the supervisor is gone. Permanently awaiting that error strands active-run
ownership, Pause, interruption and Stop retries together.

Before invoking taskkill, capture the worker and discoverable descendants using
Windows process IDs, parent IDs and creation timestamps. On command failure,
inspect processes again, following parent links through retained identities to
discover children born after capture and retaining them for subsequent checks.
Do not follow the tree of a PID that now belongs to a different creation time.
If every observed owned identity is absent, await supervisor
exit and settle normally; a reused PID is not the original process. A surviving
identity remains occupied and is inspected again until it exits, rather than
being trapped in a permanently pending promise. Failed inspection or unexpected
supervisor loss remains unconfirmed. Successful taskkill still permits settlement
when inspection is unavailable; inspection is fallback evidence for command errors.
Do not interpret localized error text or accept worker exit alone as proof.
This preserves the existing tree-ownership limits for orphaned or externally
brokered programs; it is not a Windows job-object containment boundary. An
intermediate process born and gone entirely between inspections cannot provide
ancestry for an orphan it leaves behind. Such unobservable lineage remains
outside this snapshot-based verification, just as detached programs orphaned
before taskkill cannot be recovered from the supervisor's current tree.

Regression tests inject error 255 after real tree termination for budget failure
and interruption, and separately kill only the supervisor to prove a surviving
native child still prevents settlement.

## Consequences and limits

- A blocked native output stream no longer prevents ordinary user cancellation.
  Cancellation stops child programs in the owned Windows tree; review apps
  intended to outlive an activation should be launched independently.
- Already delivered transcript evidence remains inspectable. Late events cannot
  revive an interrupted attempt. Normal completion does not terminate unrelated
  desktop applications or other attempts.
- Each invocation adds a Node process and IPC overhead. No model, sandbox,
  approval policy, SDK protocol or session-storage implementation is replaced.
- OS refusal to terminate remains a host-level recovery condition, with the task
  occupied rather than falsely interrupted. This change does not add a force
  unlock or a new UI recovery action.
- POSIX termination covers the owned process group; explicitly detached sessions
  and programs brokered by external services are outside it. Windows detached
  descendants retaining their parent lineage are covered by tree termination.
  SDK error cleanup can kill a native parent before reporting its exception;
  detached programs already orphaned by that cleanup may no longer be reachable
  from the worker tree. Error handling confirms owned runtime termination but
  does not promise cleanup of every previously detached program. Review apps
  deliberately launched outside execution ownership remain user-managed.
- Framework waiting guidance is supplied to fresh and returning activations and
  same-activation continuations, including conversations created before the fix.
- Verification uses the real installed SDK with disposable executable fixtures,
  no model calls, and no interaction with user project processes.
