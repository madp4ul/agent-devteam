# 04 — Explain framework action tools and link their effects

**What to build:** Give every mutating or attention-reporting coordination
framework MCP call a tailored presentation of its domain effect. Comments show
their Markdown content and navigate to the exact task activity history source;
moves, child tasks, dependencies, and permission blocks show reliable domain
facts and link related tasks. Equivalent task activity history entries gain
the same missing task links. A rejected domain action is presented as
unsuccessful even when its MCP transport completed.

**Blocked by:** 02 — Identify generic MCP calls and disclose their evidence

**Status:** resolved

- [x] A task move shows the authoritative source and destination columns without repeating the MCP title or adding a trailing success word.
- [x] Child-task creation shows the child title, generated task ID, and destination column when available, and the child task is an internal link.
- [x] Dependency creation identifies both involved tasks and links the related task.
- [x] Permission-block reporting shows the authored reason rather than only stating that a permission block was reported.
- [x] Comment creation shows the actual comment body as compact rendered Markdown with a copy-Markdown control.
- [x] Long comment Markdown reuses the task activity history's rendered-line `Show more` / `Show less` behavior rather than character-count truncation.
- [x] A quiet comment action closes the conversation dialog, expands the exact task activity history comment, scrolls it into view, and moves focus to it.
- [x] Comment navigation remains correct when the comment is nested within an attempt record.
- [x] Task activity history child-creation entries link to the created child task.
- [x] Equivalent task references in dependency and other framework-action history entries link to an existing task destination when meaningful.
- [x] No link is invented for columns, boards, participants, or identifiers without a navigable destination.
- [x] An `accepted: false` framework result uses a rejected/unsuccessful marker and exposes its rejection reason even when the raw MCP status is `completed`.
- [x] Running actions fall back to requested arguments when authoritative results do not yet exist and update in place to confirmed result facts.
- [x] Technical failure remains distinguishable from domain rejection and exposes its diagnostic.
- [x] Successful actions use the shared success marker without `completed`, `confirmed`, or `succeeded` suffixes.
- [x] Every known framework action omits the generic raw MCP disclosure and shows only its semantic domain presentation and status.
- [x] Runtime-adapter coverage exercises comment, move, child-task, dependency, and permission-block calls across running, accepted, rejected, and failed outcomes where applicable.
- [x] Browser coverage verifies Markdown and copying, rendered-line disclosure, semantic status, live updates, task links, exact timeline navigation and focus, keyboard operation, containment, and dark/light appearance.
- [x] Existing task activity history ordering, attempt attribution, conversation navigation, and selected-source behavior remain green.

## Answer

Coordination action calls now retain and render their domain effects: moves,
child tasks, dependencies, permission blocks, and comments use authoritative
facts when available and requested facts while running. Domain rejection and
technical failure remain distinct, known actions omit generic raw MCP details,
and stable live rows update in place.

Created comments retain their exact history source. The quiet history action
closes the conversation, expands nested or top-level comment Markdown, scrolls
to it, and focuses it. Related-task history entries now link real task
destinations without inventing destinations for other identifiers. Runtime,
browser, keyboard, containment, and dual-theme coverage exercise these paths.
