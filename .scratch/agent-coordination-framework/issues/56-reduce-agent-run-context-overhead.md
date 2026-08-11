# 56 — Reduce Agent-Run Context Overhead

**What to build:** Measure and reduce avoidable context supplied to coordination
agent runs so short tasks remain proportionate, without hiding real usage or
removing instructions and evidence required for correct autonomous work.

**Blocked by:** None

**Status:** open

- [ ] Add controlled real-run instrumentation that separates model-call count,
  cumulative input, cached input, uncached input, output, and tool-result size
  for one attempt. Preserve raw SDK usage as the source of truth.
- [ ] Give activated agents direct, exact affordances for the coordination
  operations they need so routine runs do not begin with broad tool discovery.
- [ ] Make successful coordination mutations return compact acknowledgements
  containing only the identifiers, revision, state transition, and created
  records needed to continue. Keep full task inspection available explicitly
  rather than returning the complete task after every mutation.
- [ ] Measure the fixed startup contribution from framework, process, board,
  role, task, runtime, skill/plugin, and tool-schema context, then reduce or
  defer redundant material without weakening precedence, safety, or activation
  provenance.
- [ ] Evaluate compact task-history and instruction composition against the
  current complete forms. On-demand inspection must remain available when an
  agent needs omitted detail.
- [ ] Compare representative runs before and after each optimization. Record
  both absolute usage and behavior/correctness evidence so lower token counts
  are not accepted when they cause extra calls, missed requirements, or unsafe
  coordination.
- [ ] Do not treat cached input as free, convert counts into currency without
  the actual model and billing arrangement, or optimize a display by changing
  the underlying measurement.
- [ ] Add regression coverage at the narrowest public seams for compact tool
  responses and prompt composition, plus at least one controlled end-to-end
  run demonstrating the combined effect.

## Context

Investigation of live issue-53 data found that the surprising totals were real
cumulative SDK usage across repeated model calls, not an arithmetic or
persistence defect. Five short task attempts reported between 108,353 and
443,340 input tokens. The 443,340-token attempt made 13 model calls; 399,104
input tokens were cached and 44,236 were uncached.

Every inspected attempt performed the same broad tool-discovery call, whose
result was about 41,000 characters. Coordination mutations then returned full
task projections of roughly 15,000–46,000 characters. Those results became
part of subsequent model inputs. Fixed visible startup material also included
roughly 17,000 characters of runtime instructions, 4,000 characters of project
context, and 12,000 characters of activation composition before hidden tool
schemas were counted.

The investigation establishes promising seams, not a predetermined rewrite.
This ticket should quantify which reductions materially improve whole-run
usage and preserve the coordination behavior that the context exists to
support.

## Comments

- This ticket changes context generation and tool response contracts. It does
  not change how issue 53 reports the usage Codex actually emitted.
- Cached input is a subset of input usage and may be cheaper under a particular
  API model price, but it still represents repeated model context and should
  remain measurable.
