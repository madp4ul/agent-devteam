# 105 — Interrupt agents waiting on programs

**Type:** task

**Status:** resolved

## Problem

The idle-game Product lead waited for a program and retained its task's only
execution slot. User interruption did not finish; closing the program released
the agent. Investigation found that interruption awaits runtime settlement with
no independent termination boundary. The SDK consumes stdout before reporting
its child-process abort error. The exact live incident was not captured.

## Acceptance criteria

- Reproduce interruption while an owned child program keeps output open, without
  model calls or interacting with the running user project.
- Terminate the attempt independently of a blocked SDK stream, confirm runtime
  termination before releasing task ownership, and preserve interruption,
  suspension, continuation and queue ordering semantics.
- Scope termination to the attempt; preserve unrelated processes. Never release
  ownership merely because a timeout elapsed or termination failed.
- Cover cancellation before startup, during a blocked command, normal completion
  and failures. Retain transcript evidence already delivered.
- Tell agents to avoid holding activations open for interactive programs or
  coordination waits; deliver the guidance to returning conversations too.
- Document the runtime boundary and validation. Leave changes unstaged.

## Comments

2026-11-08: User authorized implementation and guidance changes while the host
is idle. Do not stop, restart or otherwise operate the user's running host.

## Reproduction and implementation

The initial ordinary-child fixture passed. Adding a detached child inheriting
the native output pipe made the installed SDK's abort hang until manual fixture
cleanup. `node --experimental-strip-types --test test/runtime/codex-process-cancellation.test.ts`
failed with `still blocked` instead of settled after 1.5 seconds.
Session evidence shows runner-owned review-app launches without an explicit
wait; omitting a wait alone is insufficient guidance.

The default runtime now supervises one SDK invocation in an owned Node worker,
with bounded IPC delivery, termination independent of stream progress, and a
normal terminal release handshake. The same regression settles in about 0.25
seconds and confirms the worker and program exited while an unrelated process
remains alive. OS termination failures retain task ownership and log a host
diagnostic; the sandboxed probe exercised this conservative path. See ADR 0043.

Waiting guidance now covers coordination waits, finite commands and interactive
review-app lifetime/streams. It also reaches existing conversations and resumed
attempts. Targeted runtime/application verification: 62 tests passed.

Review added coverage for inherited stderr after native completion, cancellation
at completion, unexpected host disconnect, unexpected worker death, and malformed
native output. Only successful SDK completion uses normal release; exceptions
terminate owned execution first. SDK cleanup may already have orphaned detached
programs before an exception reaches the supervisor; ADR 0043 records that limit
without claiming all detached software is contained.

## Answer

Implemented cancellation independent of blocked SDK iteration and updated
framework guidance for all activation/continuation paths. Architecture and
ADR 0043 document ownership, normal shutdown, failure behavior and platform limits.

Validation: full Node suite passed (485 passed, 6 optional tests skipped). After
review-driven lifecycle corrections, the complete runtime suite plus application
interruption suite passed (96 passed, 1 optional test skipped), including nine
disposable process regressions. Typecheck and diff whitespace checks pass.
Standards review: no remaining actionable findings. Spec review: no remaining
actionable findings. Review findings and their fixes are recorded above.

No model calls, live-host changes, staging, commits or pushes. Restart the host
normally to load the implementation and updated guidance.
