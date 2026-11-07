# Structural lessons from the repository's development skills

Date: 2026-11-02. Scope: research into the skills and repository workflow only. This note does not establish what happened in the idle-game project; incident claims require the separate retained-history investigation. No skills, process definitions, runtime state, or Git index were changed for this research.

## Finding

The transferable structure is a chain of durable decisions, executable work, and independently checked outcomes. The skills separate **understanding the problem**, **deciding a reusable approach**, **specifying observable behavior**, **slicing delivery**, and **checking against both intent and conventions**. Their value does not require a separate role or human approval for every activity. The repository explicitly says to choose roles and stages for meaningful responsibility changes, and permits planning and following delivery through to its outcome to belong to one role. [Process authoring, lines 65–77](../../docs/process-authoring.md#choose-roles-and-stages-for-the-processs-needs)

The strongest existing protection against incomplete follow-through is already local policy: a research/design decision that calls for implementation must publish linked, dependency-aware delivery tickets before being presented as fully done. It distinguishes “decision resolved” from “delivery complete.” This is a useful invariant for an autonomous process; a polished assessment alone is not the delivered improvement. [Development workflow, lines 26–31](../../docs/agents/development-workflow.md#default-flow)

## Mechanisms worth transferring

| Mechanism in the primary sources | Minimal autonomous adaptation | Failure it is intended to prevent |
| --- | --- | --- |
| Wayfinder names a destination, maps the decision frontier breadth-first, distinguishes unresolved questions from implementation, and retains out-of-scope boundaries. | Before substantial delivery, the responsible agent identifies the user outcome, relevant existing decisions, unresolved questions, and affected systems. Research facts autonomously; escalate decisions only outside the standing mandate. | Locally reasonable work that misses a shared pattern or solves the wrong problem. |
| The wayfinder map is an index; each decision has one authoritative location. Resolving a decision updates the index and creates newly revealed work. | Keep a compact project decision index linking authoritative rationale. Update it when a decision becomes reusable, and link the affected delivery work. | Knowledge exists in a long conversation but cannot be found by the next agent. |
| Domain modeling captures resolved terms immediately and records consequential rationale sparingly. | Record an agreed principle in its owning document during the same change; keep task chatter as evidence, not the sole source of truth. | Repeatedly asking about variations of a decision already made. |
| To-spec synthesizes the accumulated decisions into user outcomes, implementation decisions, testing decisions, and exclusions. | Give delivery a concise specification that explicitly carries cross-cutting decisions and links their rationale. Do not make every implementer reconstruct the research conversation. | Research is performed but discarded during delegation. |
| To-tickets creates independently verifiable vertical slices with real blocking edges; large refactors get an explicit final integrate-and-verify ticket when they cannot remain green separately. | Size work for an agent context, make dependency and integration ownership visible, and define what evidence closes the slice. | “Implementation done” is confused with an integrated, reviewable result. |
| Code review keeps standards and specification as separate axes. | Check both “does this solve the agreed problem?” and “does this follow the shared design?” against explicit sources. | Passing task acceptance hides a violation of the common design, or tidy code hides missing behavior. |
| TDD requires behavior observable through an agreed public interface and warns against tautological tests. | Put checks at the level that detects the user-visible failure, including integration/handoff behavior where relevant. | A collection of local green checks gives false confidence about the complete workflow. |

Primary source locations, with line numbers from the files read on this date:

- [Wayfinder](../../.agents/skills/wayfinder/SKILL.md): 7–13 (decision work), 21–23 (single-location index), 32–52 (map), 67–69 (claim and frontier), 82–101 (scope versus unresolved questions), 111–126 (breadth-first discovery and resolution).
- [Domain modeling](../../.agents/skills/domain-modeling/SKILL.md): 44–64 (language, scenarios, code checks, immediate recording), 66–74 (ADR threshold).
- [To-spec](../../.agents/skills/to-spec/SKILL.md): 7–19 (synthesis and test strategy), 23–69 (outcomes, decisions, tests, scope).
- [To-tickets](../../.agents/skills/to-tickets/SKILL.md): 21–40 (prior decisions, complete vertical slices, dependencies, integration exception), 60–67 (publishing and frontier).
- [Code review](../../.agents/skills/code-review/SKILL.md): 6–11 and 82–89 (independent axes), 25–41 (spec and standards sources), 53 (speculative generality).
- [TDD](../../.agents/skills/tdd/SKILL.md): 10–30 (prior decisions, behavioral surface, invalid test patterns).

## Generalization needs a retrieval path

The request for agents to “step back” should produce something concrete: identify the family of cases, the invariant shared by those cases, the allowed variation, and the rule for deciding the next case. This is a proposed adaptation, not a quotation from the skills. It combines domain-modeling's concrete scenario checks with codebase-design's definition of an interface as all the knowledge needed to use a module correctly, including invariants and ordering constraints. [Domain modeling, lines 52–64](../../.agents/skills/domain-modeling/SKILL.md#discuss-concrete-scenarios); [Codebase design, lines 14–28](../../.agents/skills/codebase-design/SKILL.md#glossary)

A small example for UI work: a request to fix a visually dominant secondary button should prompt a check of the shared action hierarchy and the other members of that button family. The retained result might be a design-system rule plus examples and a reusable component. It need not become a broad redesign. A later ticket should find that rule from the normal design entry point, and its reviewer should check conformance. This repository's own AGENTS.md already supplies shared browser icon and visual-hierarchy requirements; these illustrate the form of reusable guidance, not evidence that the idle-game project lacks it. [AGENTS.md, Browser UI controls and Browser visual hierarchy](../../AGENTS.md)

Use distinct homes for distinct knowledge:

- **Glossary:** canonical domain meaning. Domain-modeling explicitly forbids using CONTEXT.md as a specification or implementation scratchpad (line 64).
- **Design/architecture guide:** current implemented patterns and where to find their owners. This repository assigns that inspection-map role to docs/architecture.md in AGENTS.md.
- **ADR:** consequential, surprising trade-offs. The skill requires all three conditions—hard to reverse, surprising without context, and a real trade-off—and allows a short paragraph. Do not create an ADR for every CSS adjustment. [ADR format, lines 12–23 and 29–47](../../.agents/skills/domain-modeling/ADR-FORMAT.md)
- **Specification:** the current effort's outcomes, constraints, tests, and exclusions.
- **Task/history:** the evidence of execution, local handoffs, and exceptions. Link the reusable decision's authoritative home instead of repeatedly copying it.

The critical adaptation is to make capture **and subsequent retrieval** part of the work product. “We documented it” is weak evidence; a fresh agent finding and correctly applying it to a second case is stronger evidence. This proposed check also distinguishes missing documentation from missing entry points, contradictory sources, or instructions that were found but ignored.

## What not to transplant literally

The skills intentionally contain frequent human checkpoints: grilling asks one question at a time and reserves decisions to the user; to-spec confirms test seams; to-tickets iterates the breakdown until approval; TDD requires confirmation of seams; wayfinder generally resolves only one ticket per session. [Grilling, lines 6–12](../../.agents/skills/grilling/SKILL.md); [To-spec, line 17](../../.agents/skills/to-spec/SKILL.md); [To-tickets, lines 42–56](../../.agents/skills/to-tickets/SKILL.md); [TDD, lines 20–24](../../.agents/skills/tdd/SKILL.md); [Wayfinder, line 105](../../.agents/skills/wayfinder/SKILL.md)

Copying those instructions wholesale would likely reproduce the user's complaint about excessively small steps. The autonomous adaptation should be explicitly authored as such: settle recurring engineering choices under approved project principles, collect genuine product/authority questions into a coherent decision packet, and reserve human review for a useful outcome. Agents must not invent human approval or treat elapsed time as consent. This recommendation changes a proposed process; it does not silently override the skills when they are actually invoked.

Also avoid copying repository-specific Git ownership into another project without checking its agreement. Here, implement explicitly leaves changes unstaged for the user; that is a local delivery contract, not a universal integration model. [Implement, lines 15–17](../../.agents/skills/implement/SKILL.md); [Development workflow, lines 39–58](../../docs/agents/development-workflow.md#git-ownership-and-review-markers)

The router references skills absent from the current local inventory, including handoff, triage, and improve-codebase-architecture. Treat these as explanatory references, not installed automation dependencies. The inspected directory contains 16 skills, including the principal workflow named above; no analysis here depends on the missing implementations. [Ask Matt, lines 18–23, 38–42, 48–64](../../.agents/skills/ask-matt/SKILL.md)

## Proposed operating model to test against the incident evidence

1. **One outcome owner persists across phases.** This owner may delegate research, delivery, review, and integration, but remains responsible for the route to a reviewable outcome or an explicit user decision. Every handoff carries the next owner, enabling condition, and intended output. An agent's completed turn is not the outcome.
2. **Do discovery in proportion to uncertainty.** Known-pattern changes reuse the existing rule; a new family of behavior, contradiction, or repeated correction earns a bounded research/design step. Do not turn every ticket into a full wayfinder map.
3. **Specify before splitting when understanding spans agents.** Carry decisions into a concise specification, then complete vertical slices. Keep one clear path from user request to accepted outcome.
4. **Retain generalized decisions at their point of use.** Add a findable rule with examples and exceptions when one is learned. Link it from future tasks and check its application in review.
5. **Close the loop on process changes.** For each proposed process fix, name the observed failure, predicted behavior change, applicable process version, and a future observation that would refute success. Compare subsequent independent cases rather than counting edits or reassuring reports.

These are recommendations, not established causes in the running project. They accord with the local authoring principle of explicit responsibilities and outcomes while leaving tactics to agent judgment. They do not imply a new role or column for each item. [Process authoring, lines 9–23, 42–77](../../docs/process-authoring.md)

## Counterexamples and useful validation

- If a task is intentionally awaiting a specific user approval and the request is visible, no automatic movement should bypass it. “Nothing running” alone does not prove a stall.
- If a shared UI pattern is already documented and reachable but ignored, adding more documents is unlikely to help; investigate context delivery, review criteria, and conflicting authority instead.
- If a requirement is truly new, asking the user is correct. Fewer questions is not the sole success measure; count repeated questions already settled by an applicable decision separately.
- If a change is tiny and conforms to a known pattern, require neither a speculative abstraction nor a large design document. Code review explicitly treats speculative generality as a smell; process authoring also rejects exhaustive exception routing.
- A useful pilot would follow several comparable tasks under a fixed process version and record: silent handoffs before review, repeated user corrections about settled decisions, whether fresh agents retrieve the right prior decision, and whether integration/review evidence is actually produced. Include both successes and failures so anecdotes do not masquerade as a rate.

This note completes the skills research only. The parent assessment should decide which recommendations the project evidence supports and create dependency-aware follow-up tickets for any proposed implementation; this note does not claim those changes have been made.
