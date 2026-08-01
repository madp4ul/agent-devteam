# Validate the End-to-End Product Design

Type: wayfinder:prototype
Status: resolved
Blocked by: 11
Parent: ../map.md

## Question

What end-to-end scenario and rough interactive artifact should validate that
the settled board, task-detail, process-authoring, activation and recovery,
task-workspace, safety, and process-evolution decisions form one coherent first
usable product before they are turned into a software specification? What
observations should be sufficient to proceed, and which would require reopening
a product-design decision?

## Comments

- Exercise the whole architecture-led workflow rather than evaluating isolated
  screens or one more feature-specific mockup.
- Produce validation decisions, not implementation.

## Answer

Do not build an end-to-end interactive prototype before specification. A
prototype narrow enough to remain cheap would necessarily script or omit many
board actions and automation outcomes. Its missing behavior would distract
from the product-design question and make interaction feedback ambiguous. A
prototype broad enough to behave credibly across the settled board,
task-detail, authoring, activation, recovery, workspace, safety, and evolution
decisions would implement too much of the product before its software
specification exists.

The decisions already settled by this map form a coherent first usable product
in the user's judgment, so the expected learning does not justify that cost.
The product design is sufficiently clear to proceed to specification without a
prototype artifact.

Use specification synthesis as the next end-to-end consistency check. It can
expose contradictory behavior, missing contracts, or an unresolved product
decision more directly and cheaply than a scripted simulation. If it exposes
such a problem, reopen the specific decision that owns it rather than treating
this broad prototype as a prerequisite.

Reserve later prototypes and implementation spikes for narrow questions with
a clear learning target. In particular, the already-decided focused Kanboard
integration spike remains the appropriate way to test that technical
feasibility; it is not replaced by an end-to-end product mockup.
