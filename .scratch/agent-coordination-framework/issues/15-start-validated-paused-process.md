# 15 — Start a Validated, Paused Process

**What to build:** A user can start the local application with a
version-controlled process definition, see its boards and framework-owned
Completion columns, and inspect actionable configuration diagnostics. A valid
process starts with automation paused; an invalid process starts no automation
and permits no board mutation.

**Blocked by:** 14 — Establish the Board Foundation

**Status:** ready-for-agent

- [ ] Schema-backed structured definitions describe boards, workflow columns,
  agents, roles, stable entity IDs, coordination guidance, and a default task
  workspace starting ref while referencing long-form agent instructions.
- [ ] Validation is available explicitly and at startup and reports the source
  location, invalid value, violated rule, consequence, and a safe correction
  when one is known.
- [ ] A valid definition produces ordered boards with exactly one permanently
  last, permanently unwatched Completion column per board.
- [ ] The applied process receives a semantic fingerprint that includes
  referenced instructions and ignores non-semantic formatting differences.
- [ ] An invalid definition enters configuration-error mode with no agent
  dispatch and no board mutation rather than using a previous definition.
- [ ] Every application startup visibly begins with process automation paused
  and requires an explicit resume action before attempts can start.
- [ ] Reference documentation, a tutorial, and an example process let a user
  author and validate a definition with ordinary editor tooling.
- [ ] Application-boundary tests cover valid startup, invalid startup, stable
  identities, Completion-column invariants, and semantic version calculation.

