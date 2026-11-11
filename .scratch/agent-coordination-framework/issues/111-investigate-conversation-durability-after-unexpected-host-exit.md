# 111 — Investigate conversation durability after unexpected host exit

**Type:** research

**Status:** open

## Problem

Closing the execution console unexpectedly can terminate the framework before
the latest runtime events reach durable storage. The framework persists streamed
conversation items and native thread IDs during execution; it does not wait for
the whole run to finish. Codex also maintains its own native session, which is
used when resuming the saved thread ID. These two stores can have different
latest evidence after an abrupt exit.

The user wants greater resilience to accidental console closure and clarity
about whether missing framework history is only a display gap or also missing
context for the resumed agent. No particular loss window or native persistence
guarantee has yet been established experimentally.

## Investigation and deliverables

- Reproduce Windows console-window closure, host crash/forced termination, and
  normal Ctrl+C at controlled points during a disposable run. Distinguish host
  termination from surviving workers; do not operate on live user conversations.
- Trace when native session evidence, runtime events, framework transcript items
  and thread identity become durable. Measure which evidence survives restart
  and which context is actually available when the same native thread resumes.
- Investigate safe reconciliation of framework display gaps from retained native
  session evidence, including deduplication, ordering, partial items, compaction,
  thread replacement and interrupted tool calls. Do not assume the framework
  transcript and native model context are interchangeable.
- Evaluate improvements to persistence/event acknowledgement and Windows console
  shutdown handling. Identify what can be guaranteed and what cannot, including
  power loss or output not yet persisted by Codex.
- Define an executable regression strategy at the real process/storage boundary,
  with no model calls where a faithful disposable fixture suffices. Clearly label
  any native resume guarantees that require additional validation.
- Document findings and recommended recovery behavior; create scoped follow-up
  implementation tickets for worthwhile changes. Preserve paused startup and
  existing conversations; recovery must not automatically dispatch agents.

## Comments

2026-11-11: Requested after discussing the difference between framework history
and the native Codex session. Related to resolved issues 108–110, but those fixes
do not establish complete crash durability or backfill missing UI history.
This issue records an investigation, not a confirmed data-loss diagnosis.
