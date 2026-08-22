# Conversation transcript maintainability

## Problem Statement

The conversation transcript feature has grown substantially since the first
maintainability round. Known coordination-tool calls are already translated by
the Codex runtime into semantic transcript facts, but the browser still knows
how to decode raw SDK-shaped arguments and results for those same calls. A new
coordination presentation can therefore require parallel changes to runtime
normalization, the shared runtime contract, browser fallback parsing, a large
conversation dialog, and two large test suites.

The problem is not file length by itself. Several large coordination modules
remain cohesive and continue to provide useful locality. The problem is that
conversation history, transcript interpretation, rendering, polling,
continuation, retirement, focus, and action-menu behavior now share one browser
module, while the interface for a known coordination transcript item is not
complete enough to prevent raw transport knowledge from leaking across the
runtime seam.

The largest browser suites have also outgrown their previous capability-level
organization. Conversation transcript presentation and conversation lifecycle
coverage now share one large suite, while task timeline, comment composition,
workspace, relationship, and attention behaviors share another. This makes
relevant coverage slower to locate and requires future agents to load more
unrelated context.

## Solution

Give known coordination transcript entries one complete semantic projection at
the runtime seam and make the browser consume that projection without decoding
raw Codex or MCP result shapes. Preserve raw evidence for inspection and generic
MCP display, but keep transport-shape knowledge inside the runtime adapter.

Then deepen the browser conversation-history module so that ordering messages,
runs, retirement and replacement markers, rendering transcript evidence,
presenting token usage, and navigating to durable effects sit behind one small
interface. Keep remote loading, polling, continuation, retirement commands,
modal lifecycle, and dialog-level focus in the conversation dialog shell.

Finally, reorganize the growing transcript and task browser tests by observable
sub-capability. Retain coverage at the public runtime and rendered-browser seams,
using focused pure projection tests only where an exhaustive normalization
matrix would otherwise repeat full runtime setup without increasing confidence.

## User Stories

1. As the project maintainer, I want each known coordination call normalized once, so that adding or changing a presentation does not require duplicate raw-result parsing.
2. As the project maintainer, I want the browser to consume typed coordination facts, so that it does not need to understand Codex SDK or MCP transport shapes.
3. As the project maintainer, I want requested facts to remain visible while a call is running and authoritative facts to replace them when it completes, so that live transcript behavior stays truthful.
4. As the project maintainer, I want successful, rejected, failed, and running coordination calls represented unambiguously, so that transport completion cannot be confused with domain acceptance.
5. As the project maintainer, I want raw evidence retained independently of semantic presentation, so that diagnostics remain inspectable without becoming browser interpretation logic.
6. As a user, I want known coordination activity to retain its compact domain presentation, so that maintenance work does not expose noisy raw tool details.
7. As a user, I want generic MCP calls to retain their literal evidence disclosure, so that unfamiliar tools remain inspectable.
8. As a user, I want comments, moves, child tasks, dependencies, permission blocks, and inspections to retain their current labels, facts, links, and status treatment.
9. As a user, I want a running transcript row to update in place, so that polling does not duplicate evidence or move my reading position.
10. As a user, I want conversation messages, runs, pending follow-ups, retirement, and replacement context to keep their chronological order.
11. As a user, I want transcript links and comment-history navigation to continue reaching the corresponding durable task evidence.
12. As a user, I want token usage, runtime duration, thread replacement, and unavailable evidence to remain attached to the correct run.
13. As a keyboard or screen-reader user, I want dialog focus, actions, disclosures, status labels, and retirement controls to remain operable and named as before.
14. As a user, I want conversation continuation and retirement behavior to remain unchanged while transcript rendering is reorganized.
15. As the project maintainer, I want conversation-history rendering behind one small interface, so that display changes do not require navigating dialog networking and mutation code.
16. As the project maintainer, I want polling and mutation state to remain in the dialog shell, so that the history module does not become another owner of conversation state.
17. As the project maintainer, I want transcript normalization verified through the runtime interface, so that tests protect externally observable adapter behavior.
18. As the project maintainer, I want an exhaustive normalization matrix to use a focused internal seam where appropriate, so that test setup remains proportional to the behavior under test.
19. As the project maintainer, I want rendered transcript behavior tested in a focused browser suite, so that presentation regressions are easy to locate.
20. As the project maintainer, I want conversation lifecycle coverage separate from transcript presentation coverage, so that unrelated scenarios do not share one oversized context.
21. As the project maintainer, I want task comment-composition, timeline, workspace, relationship, and attention coverage grouped by sub-capability, so that future task-page changes have an obvious verification home.
22. As the project maintainer, I want every maintenance ticket to preserve a green typecheck and relevant test suites, so that the refactor never requires a long-lived broken state.
23. As the project maintainer, I want large cohesive coordination modules left intact, so that this effort does not become a line-count-driven repository rewrite.
24. As the project maintainer, I want each ticket to fit one fresh implementation context, so that I can implement and review the work efficiently.

## Implementation Decisions

- Preserve the Codex runtime as the adapter that understands raw SDK event and
  MCP result shapes.
- Define a complete typed transcript representation for known coordination
  calls. It owns semantic status, domain facts, requested-to-authoritative
  progression, user-facing diagnostic facts, summary information where still
  useful, and separately retained raw evidence.
- Normalize a coordination event once. Do not independently decode the same raw
  result to determine status, summary, and presentation.
- Keep generic MCP entries distinct from known coordination entries at the
  browser-facing interface. Generic entries retain literal arguments, result,
  error, raw status, and optional summary for disclosure.
- The browser may choose labels, layout, links, and visual hierarchy from typed
  semantic facts. It must not inspect raw arguments or results to recover facts
  for a known coordination entry.
- Preserve stable transcript item identity so running entries continue to be
  replaced by their terminal evidence in place.
- Build one deep conversation-history browser module. Its interface accepts the
  assembled conversation and selected context plus narrow navigation callbacks;
  it owns history ordering, run boundaries, transcript item selection and
  rendering, run metrics, and durable-effect links.
- Keep fetching, refresh sequencing, polling policy, continuation submission,
  retirement submission, dialog focus, and modal lifecycle outside the history
  module.
- Do not introduce a new state owner, persistence representation, network
  process, repository abstraction, or configurable extension seam.
- Reorganize tests by observable sub-capability rather than file-size targets.
  Shared fixtures should express Codex events, coordination results,
  conversations, and task scenarios in domain language.
- Keep the current single application authority and complete user-facing
  projections unchanged.
- Record a focused ADR only if implementation establishes a durable new
  runtime/browser interface decision not already explained by the existing
  adapter and contract ADRs. Update the architecture overview only if the major
  adapter flow or state ownership changes.
- Leave all changes unstaged for user review and do not disturb existing staged
  or unstaged work.

## Testing Decisions

- The primary runtime seam is the transcript returned by the agent runtime after
  processing representative Codex event streams. It verifies raw-event
  adaptation, stable live-row replacement, semantic status, retained evidence,
  and complete known coordination projections.
- A focused pure projection seam may cover the exhaustive matrix of known
  coordination tools, malformed or partial evidence, requested fallbacks, and
  authoritative-result precedence. Representative cases must still cross the
  complete runtime seam.
- The primary browser seam is the rendered conversation dialog. Browser tests
  verify domain facts, status, links, disclosure policy, live updates, focus,
  containment, and both appearances without inspecting React implementation
  details.
- Conversation continuation, retirement, selection, polling, scrolling, and
  dialog accessibility remain covered through rendered browser behavior and the
  existing application or HTTP seams.
- Test-file reorganization must preserve every meaningful assertion and must not
  make test order significant.
- Task browser coverage is grouped around observable timeline and authored
  content, comment composition, workspace inspection, relationships, and
  attention/navigation behavior. Shared setup remains in domain-oriented browser
  fixtures.
- Typechecking, the full non-browser suite, the complete browser suite, the
  production build, and diff hygiene are final verification gates.

## Out of Scope

- New transcript content, new coordination tools, or changes to MCP permissions.
- Changes to conversation continuation, retirement, activation, attempt, or
  thread-continuity semantics.
- Fixing token-usage isolation or adding pricing and cost estimation.
- A visual redesign of the conversation dialog or task page.
- Splitting files solely to meet a maximum line count.
- Reorganizing the coordination application, task command store, automation
  state store, web server, database, or durable schema.
- Rewriting the sticky task-comment composer or moving task-page state without a
  demonstrated behavioral seam.
- Removing raw transcript evidence needed for diagnostics or generic MCP calls.
- Staging, committing, rebasing, or pushing changes.

## Further Notes

The first maintainability effort remains the baseline for terminology and
architectural intent. This is a focused follow-up caused by later transcript and
conversation-display growth, not evidence that its application, transaction,
contract, or browser-lifecycle seams failed.

The open follow-up token-isolation bug remains a separate behavior fix. It may be
implemented independently and should not broaden this maintenance effort.
