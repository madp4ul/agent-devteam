# 01 — Run a complete framework installation outside the development checkout

Status: resolved

Type: task

Parent: [Specification](../spec.md).

Blocked by: none.

What it delivers: an explicit local command assembles a uniquely identified
installation that can start a disposable project using installed Node.js, without
reading framework application code, assets or dependencies from the checkout.
It can be launched by its concrete installation path; latest selection follows
in ticket 02.

Acceptance criteria:

- [x] Capture coherent inputs and provenance, including modified source if allowed;
  never require staging/committing and never overwrite an existing installation.
- [x] Include host, browser, workers, MCP adapter, schema snapshot, runtime resources,
  notices, dependency graph and required SDK platform assets.
- [x] An unavailable development checkout and its dependency links do not prevent
  installed startup, asset serving, controlled worker execution or MCP operation.
- [x] Preserve matching readable source and source maps when applicable; expose the
  installed identity/location for outside diagnosis.
- [x] Verify a disposable incident through existing database/session/workspace
  evidence and matching source without relying on the checkout.
- [x] Use disposable project state and controlled runtime fixtures for routine tests;
  preserve normal state guards, paused startup and runtime policy.
- [x] Document how to create and launch this local installation, supported Node.js,
  and its relationship to the longer-term bundled product distribution. Update
  the architecture map to reflect the implemented runtime path.

## Comments

- 2026-11-14: User approved the breakdown and authorized implementation. Preserve the Autonomous V2 batch entry point at its current location.

## Implementation evidence

- Explicit candidate creation now captures source, lockfile and ordinary package
  copies, verifies input/package hashes, builds the browser inside the candidate,
  and verifies an installed paused host and browser before recording readiness.
- Concrete launch prints release identity/source digest and imports the host in
  the same process. Workers and MCP paths remain installation-relative.
- Red: installation integration failed on the absent release command before the
  implementation. Green: the source-unavailable installed host/browser,
  authenticated packaged MCP call and worker load boundary passed (one test,
  36.5 seconds). Typecheck passed during implementation.
- Supplemental installed migration/retained-task/recovery proof is recorded by
  the coordinating implementation agent. Final Standards/Spec review and the
  complete suite run follow across the integrated feature.
- Sandbox loopback initially rejected HTTP verification with EACCES; tests passed
  with scoped escalation. Verification was retained rather than bypassed.
- No live project state, host or development browser output was changed.

## Completion

Implemented, verified and reviewed. See [integrated verification](../verification/results.md). Source changes remain unstaged for user review; live project hosts were not restarted.
