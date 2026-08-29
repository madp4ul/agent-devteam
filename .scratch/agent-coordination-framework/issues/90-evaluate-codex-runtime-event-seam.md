# 90 — Evaluate the Codex Runtime Event Seam

**Type:** research

**What to decide:** Determine whether Codex client configuration and thread
lifecycle, streamed-event interpretation, live transcript state, terminal
outcome derivation, token-usage decoding, and local rollout context-window
measurement should remain one deep runtime module or be separated behind a
small event-projection or evidence interface that makes SDK changes safer for
the project's AI maintainer.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

## Maintainer decision

The agent doing this research is the intended long-term maintainer and likely
implementer. Optimize for bounded SDK-upgrade work, exhaustive event handling,
live evidence correctness, and easy diagnosis of thread replacement and
failure behavior. Do not extract helpers merely to shorten the runtime file.
A well-evidenced recommendation to retain the current cohesive adapter is valid.

## Investigation

- Map the current reasons the Codex runtime changes: client and sandbox
  configuration, MCP attachment and release, thread start/resume/replacement,
  streamed event handling, transcript normalization, required coordination
  failures, permission blocks, usage, terminal outcomes, and rollout-file
  context evidence.
- Distinguish SDK transport facts from application-owned attempt facts and from
  coordination-tool semantic projection that is already localized elsewhere.
  Do not create a competing transcript interpretation path.
- Compare at least: retain the current module, introduce one stateful streamed-
  event projector used internally by the runtime, and separate local session
  evidence access while leaving event handling in the runtime.
- Evaluate whether a proposed interface can consume representative SDK events
  and return observable transcript/usage/outcome facts without knowing thread
  construction, filesystem layout, MCP server lifecycle, or application
  persistence.
- Preserve stable live-item replacement, raw generic-tool evidence, typed
  coordination presentation, required-tool failure precedence, permission-block
  reporting, incomplete-stream failure, attempt isolation, and thread-
  replacement provenance.
- Verify current SDK event and session-record assumptions against first-party
  documentation or source and record the exact supported version boundary.
- Use a repository-shaped prototype only when the competing interfaces cannot
  be compared honestly from current implementation and tests. Do not perform a
  production extraction in this ticket.

## Expected result

Write a cited research note under the effort's `research/` directory and append
the answer here. Recommend one concrete direction, including “keep the current
adapter,” and explain how it improves or preserves maintainer locality. Include
the proposed interface, ownership of mutable stream state, test seam, migration
shape, rejected alternatives, SDK-version risks, and a no-change condition. If
implementation is justified, propose fresh-context follow-up tickets.

## Acceptance criteria

- [ ] Repository responsibilities and current test seams are mapped before any
  recommendation is made.
- [ ] Claims about Codex SDK events, thread behavior, and local session evidence
  cite first-party documentation or source.
- [ ] Alternatives are compared on depth, locality, interface size, live-state
  correctness, SDK upgrade blast radius, and test setup.
- [ ] The recommendation does not duplicate the existing typed coordination-
  transcript projection or move application persistence into the runtime.
- [ ] All terminal-outcome precedence and thread-continuity invariants have an
  explicit preservation and verification strategy.
- [ ] The result gives a clear no-change stopping condition and proposes only
  independently green, fresh-context implementation work when justified.

