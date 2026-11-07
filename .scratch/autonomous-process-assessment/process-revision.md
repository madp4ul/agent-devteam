# Authorized Autonomous process revision

2 November 2026. The user authorized changes to the process after reviewing the assessment and proposed direction. Source files were changed in `agent-devteam-processes/Autonomous`; the live host was not restarted, and no task, activation, database, or project worktree was changed.

## What changed

1. **Executable continuation:** unfinished work must have a concrete next action, owner and executable handoff. An unresolved child that needs its parent's next check does not supply continuation. A past acknowledgment from an ended run no longer suppresses a necessary new request. Integration finishes feasible work in its current run, arranges independently executing delegated work, or hands the concrete remaining action to Product Lead for routing. Repeated no-progress handoffs require reassessing the blocker with stewardship rather than an acknowledgment loop.
2. **Reusable decisions:** Designer identifies the shared rule and affected cases before dividing uncertain/repeated work. Implementation preserves the rule in the existing owning guide and discovery path. Review checks its actual application, including related consumers. Familiar changes reuse existing knowledge without extra research or approval stages.
3. **Outcome-based acceptance:** reviewers distinguish met requirements, unfinished work and explicitly accepted exceptions. Agents retain discretion over ordinary engineering trade-offs; they cannot collectively waive an in-scope user outcome. Representative integrated evidence must answer the actual interaction or visual question.
4. **Steward coverage and evaluation:** shared Integrator checks the interval's assessment request/coverage at the first reviewed-root handoff and before readiness, supplying a second activation route alongside Product. Existing requests prevent duplication. Steward tracks expected effects, applied versions and subsequent ordinary cases, separating knowledge capture/retrieval/application and acceptance failures. Maintainability keeps its focus on change costs rather than becoming another repetitive correctness gate.
5. **Current context and readiness:** continuing tasks keep their descriptions/pointers current. Product receives explicit candidate readiness rather than depending on Completion of an intentionally continuing Integration task.

The README explains these responsibilities and adoption limits. It no longer incorrectly claims this process has never been used by a production project.

## Files

- [Process guidance](D:/Daten/Projekte/Software/Codex/agent-devteam-processes/Autonomous/process.yaml)
- [Process README](D:/Daten/Projekte/Software/Codex/agent-devteam-processes/Autonomous/README.md)
- Role instructions: Technical Designer, Implementation Agent, Code Reviewer, Design Verifier, Product Lead, Integrator, Process Steward, Maintainability Assessor.

Code Quality inherits the shared guidance without additional role-specific changes. No new roles, columns, timers or tools were added. Allowances, agent models/effort, pricing, watchers and starting ref remain exactly as before.

## Review against incidents and counterexamples

This was a static responsibility walkthrough, not a live behavioral test:

| Case | Revised expected behavior |
| --- | --- |
| Ready request arrives while Integrator is busy | Distinct work still receives its request; an unrelated running activation is not coverage. |
| Combined check remains after Integrator's successful run | Continue it or establish a concrete delegated/returned action; the waiting root is not the wake path. |
| Same request was acknowledged in a now-finished run | Verify an outstanding request or executable ownership; stale acknowledgment does not justify suppression. |
| Child has independent executing work and a callback | Parent may wait; no unnecessary acknowledgment or user wake-up. |
| Explicit user pause or genuinely needed decision | Preserve it; no bypass through another participant. |
| Shared visual/interaction problem is repaired in only one place | Designer/reviewer inspect the affected family and applicable rule; no speculative whole-project rewrite. |
| Known in-scope mismatch is documented as a limitation | Keep it unfinished or obtain the user's exception through Product; disclosure is not acceptance. |
| Product misses assessment request | Integrator checks coverage and requests missing assessment; existing request prevents ordinary duplicate work. |
| Steward's previous change is validated but outcomes unknown | Report adoption/effect separately and examine subsequent ordinary cases; do not label the change effective merely because YAML passed. |

## Validation

From the framework checkout:

```powershell
node --experimental-strip-types src/cli.ts validate ../agent-devteam-processes/Autonomous/process.yaml
```

Result: `Valid process definition`.

Semantic version: `bda9f4291399f339be2a315799f485cf95690d093fa367cbb52a99b02f1c9d4e`.

`git diff --check` passed. An independent YAML parse compared the current file to process repository HEAD `71032aa6d24139eee5425122e86eaaae8751eb09`, excluding only process/board guidance: all remaining configuration was equal. The process repository was clean before editing; the ten changed files remain unstaged and the index is unchanged. No staging, commit or push was performed.

## Adoption and remaining work

The host loads process files at startup. These source changes therefore do not alter the running Idle Games process until a coordinated restart and the ordinary stale-work review/resume flow. We did not restart or request agents to read the new source as a substitute for applying it.

This revision improves process instructions and responsibility distribution. It does **not** implement scheduler-enforced continuation, an independent monitoring trigger, or atomic duplicate assessment suppression. The Product/Integrator coverage check is redundant responsibility, not a guaranteed autonomous monitor. Those framework questions remain in tickets 01/02/04; decision reuse and behavioral efficacy still need the observations in 03/05. A revision of instructions cannot establish that agents will obey it, so the next assessment should measure these specific outcomes under the applied version.
