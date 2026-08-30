# 95 — Isolate Local Codex Session Evidence

**Type:** task

**What to build:** Move Codex session-file discovery and context-window
measurement behind one internal fail-optional evidence reader while preserving
the runtime's existing attempt-facing context evidence and execution outcomes.

**Blocked by:** 90 — Evaluate the Codex Runtime Event Seam.

**Status:** ready-for-agent

## Decision source

Implement the local-evidence recommendation from
[issue 90](./90-evaluate-codex-runtime-event-seam.md) and its cited
[research note](../research/90-codex-sdk-runtime-evidence.md). The supported
record shape is private pinned behavior from Codex 0.146.0, not a documented
TypeScript SDK contract.

This ticket is independent of issue 94. It isolates a different reason to
change and may be implemented in either order without coupling the session
reader to streamed-event projection.

## Module boundary and behavior

- [ ] Add one internal `CodexSessionEvidenceReader`-shaped module with a
  one-method interface that accepts a thread ID and returns the latest
  `AttemptContextWindowUsage` or `null`.
- [ ] Hide the configured/default sessions root, recursive session discovery,
  thread-to-file cache, backward chunked JSONL scan, record decoding, and
  percentage calculation behind that interface.
- [ ] Preserve the default root resolution through `CODEX_HOME`, `USERPROFILE`,
  and the platform home directory without exposing it to the application.
- [ ] Preserve matching a nested `.jsonl` session filename containing the
  thread ID and caching the discovered path for later reads of that thread.
- [ ] Preserve backward scanning for the newest valid record and tolerance of
  blank, partial, malformed, and unrelated trailing lines.
- [ ] At the pinned boundary, decode only `event_msg` / `token_count` records
  containing non-negative safe-integer
  `info.last_token_usage.total_tokens` and a nonzero
  `info.model_context_window`.
- [ ] Preserve Codex's current 12,000-token-baseline percentage calculation,
  including clamping and windows at or below the baseline.
- [ ] Keep the evidence non-authoritative: missing directories/files, changed
  layout, unreadable content, malformed records, missing fields, and version
  drift return `null` and never change an attempt outcome.
- [ ] Keep `turn.completed` cumulative usage decoding outside this module. The
  session reader owns only local context evidence and must not infer cost,
  attempt deltas, terminal outcomes, or thread continuity.
- [ ] Keep `AttemptTranscriptAccess.readContextWindowUsage(attemptId)` and all
  application/browser behavior unchanged; `CodexAgentRuntime` remains the
  attempt-keyed adapter around the reader.
- [ ] Do not introduce a filesystem port or generic rollout repository merely
  for mocking. Test the local-I/O module against temporary directory trees.

## Verification

- [ ] Move the current rollout fixture behind the reader interface and add
  focused temporary-directory cases for nested discovery, cached lookup,
  newest valid record, malformed newest record with an earlier valid record,
  chunk-boundary and partial-line handling, missing root/file, unreadable or
  unrelated content, invalid token values, and percentage edge cases.
- [ ] Retain a thin runtime integration test proving that context evidence is
  stored for the correct attempt/thread after a completed Codex turn and that
  `null` leaves the meter absent without changing the run result.
- [ ] Preserve application restart/projection and browser context-meter tests;
  do not move persistence or presentation into the reader.
- [ ] Run TypeScript typechecking, focused reader/runtime tests, and the full
  Node test suite. Inspect `docs/architecture.md`; update it only if the
  implemented runtime integration or ownership map materially changes.

## Upgrade and stopping condition

Record the supported SDK/CLI version next to the reader's contract tests. Every
lockfile upgrade must re-check rollout location, filename convention, envelope,
`token_count.info` fields, active-context semantics, and display baseline.

Stop and keep the reader private inside `CodexAgentRuntime` if extraction
cannot hide discovery, decoding, caching, and fail-optional behavior behind the
one-method interface. Do not retain a pass-through wrapper or claim that local
rollout JSONL is a stable OpenAI SDK interface.

