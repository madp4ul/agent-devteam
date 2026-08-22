# Improve Agent Conversation Display

Status: ready-for-agent

## Problem Statement

The agent conversation dialog preserves useful agent-run transcript evidence,
but presents that evidence with substantially less clarity than the Codex
conversation view. Codex messages, commands, MCP tool calls, and diagnostics
all receive similarly large bordered cards, leaving excessive empty space and
making supporting tool activity compete visually with the conversation itself.

Tool calls are especially difficult to scan. Commands expose long host-shell
invocations whose PowerShell prefixes obscure their purpose, and then append a
raw status such as `completed` even when that status adds no useful
information. MCP calls are identified generically as `mcp_tool_call`; framework
calls often reduce a meaningful action to repetitive text such as "comment
confirmed · completed" while hiding the comment that was actually authored.
An MCP exchange can also complete successfully while the requested framework
action is rejected, causing the transport outcome to misrepresent the domain
outcome.

Conversation prose is rendered as plain text even though task descriptions and
comments already support Markdown, rendered-line truncation, and copying the
original Markdown. Framework actions that reference comments or other tasks do
not consistently link to those entities. The same link omissions occur in
some corresponding task activity history entries, such as child-task
creation.

## Solution

Present each agent run transcript as a compact activity stream. Messages remain
the primary content, while tool activity becomes a quieter sequence of dense
rows with a dedicated semantic status marker. Successful calls use a subtle
success icon instead of trailing success prose; running, rejected, and failed
calls use distinct icons and accessible status text in the same fixed
position.

Render Codex messages, authored conversation follow-ups, and displayed comment
bodies with the shared Markdown presentation. Every Markdown-rendered block
offers the existing copy-Markdown interaction and copies the original source,
including its formatting. Codex messages rely on their containing run for
authorship instead of repeating a "Codex message" heading; user follow-ups keep
a compact `You` label because they occur between runs.

Collapse command invocations and output behind one disclosure. The collapsed
row says only that a command ran and shows its semantic status. Opening the
disclosure reveals the exact command followed by its available output, so no
evidence is lost and no brittle command-parsing or summarization system is
required.

Identify MCP calls by their actual, humanized server and tool names, such as
`GitHub · Create issue` or `Coordination · Add comment`. Unknown external MCP
calls remain title-only when collapsed; one disclosure reveals their exact
arguments and result. Framework MCP tools receive tailored presentations based
on their stable contracts. These presentations show useful domain facts rather
than repeating the title, status, or raw arguments. They retain the same raw
details disclosure for inspection.

Framework comments show their rendered Markdown body in compact form by
default, using the task timeline's rendered-line truncation and `Show more` /
`Show less` behavior. A quiet action navigates to the exact comment in the task
activity history, expanding and focusing it. Framework actions that involve
another task link that task wherever the action appears, both in the
conversation stream and in corresponding task activity history entries.

## User Stories

1. As a user, I want agent conversations to fit more useful evidence on screen, so that I can understand a run without excessive scrolling.
2. As a user, I want messages to remain more prominent than supporting tool activity, so that the conversation retains a clear visual hierarchy.
3. As a user, I want tool calls to appear as compact stream rows, so that repetitive operational evidence does not dominate the dialog.
4. As a user, I want run boundaries to remain visible, so that every transcript item stays attributable to the correct agent run.
5. As a user, I want completed tools to use a quiet success marker, so that success is recognizable without repetitive trailing text.
6. As a user, I want running tools to show a spinner in the status position, so that I can see live progress without reading a status suffix.
7. As a user, I want failed tools to show a failure marker and diagnostic, so that unsuccessful work is immediately distinguishable.
8. As a user, I want rejected framework actions to look unsuccessful even when the MCP exchange completed, so that transport success never conceals a domain rejection.
9. As a user relying on assistive technology, I want every visual status marker to have an accessible textual name, so that status is not communicated by shape, motion, or color alone.
10. As a user, I want tool status markers to remain readable in dark and light themes, so that appearance settings do not hide operational state.
11. As a user, I want Codex messages rendered as Markdown, so that their lists, code, links, and emphasis are readable.
12. As a user, I want my conversation follow-ups rendered as Markdown, so that authored formatting remains visible when I revisit the conversation.
13. As a user, I want framework-authored comment bodies rendered as Markdown, so that the conversation matches the task activity history.
14. As a user, I want every Markdown block to offer a copy control, so that I can recover its original Markdown source.
15. As a user, I want copying Markdown to preserve formatting syntax rather than copy only rendered text, so that I can reuse the content faithfully.
16. As a user, I want Codex messages to avoid a redundant "Codex message" heading, so that the run identity establishes authorship once.
17. As a user, I want my follow-ups to retain a compact `You` label, so that turns between agent runs remain attributable.
18. As a user, I want short messages to use compact vertical padding, so that a one-line message does not occupy the space of several lines.
19. As a user, I want long PowerShell command invocations hidden initially, so that shell-launcher noise does not impede scanning.
20. As a user, I want one command disclosure to reveal both the exact invocation and its output, so that related command evidence stays together.
21. As a user, I want commands without output to remain inspectable, so that the invocation is still available as evidence.
22. As a user, I want long command output to remain bounded and scrollable, so that one tool cannot overwhelm or widen the conversation dialog.
23. As a user, I want command calls to avoid unreliable generated summaries, so that the interface does not misstate arbitrary shell behavior.
24. As a user, I want MCP calls titled with their actual server and tool, so that I can identify what capability the agent used.
25. As a user, I want MCP identifiers humanized for display, so that machine-oriented underscores and casing do not reduce readability.
26. As a user, I want exact MCP server and tool identifiers retained in details, so that display-friendly names do not remove diagnostic evidence.
27. As a user, I want unknown MCP calls to remain title-only while collapsed, so that arbitrary arguments do not become noisy or misleading summaries.
28. As a user, I want one MCP disclosure to reveal exact arguments and results, so that the complete tool exchange remains inspectable.
29. As a user, I want large MCP details bounded, so that an unusually large result does not break the conversation layout.
30. As a user, I want framework MCP calls to use their stable domain contracts, so that they describe what happened in coordination terms.
31. As a user, I want framework tool bodies to add information not already present in their title, so that calls do not display duplicate headings or summaries.
32. As a user, I want framework tools to avoid trailing `completed`, `confirmed`, or `succeeded` prose, so that their success marker carries that information once.
33. As a user, I want a task move to show its source and destination columns, so that the transition is immediately understandable.
34. As a user, I want child-task creation to show the child title, ID, and destination column when available, so that I know what work was created and where it went.
35. As a user, I want a created child task to link to its task page, so that I can inspect it directly.
36. As a user, I want dependency creation to show both involved tasks, so that the resulting relationship is clear.
37. As a user, I want a related task in a dependency action to link to its task page, so that I can follow the relationship.
38. As a user, I want inspection and listing calls to state the task, board, columns, activity, attachments, or collaborators they inspected, so that read activity has meaningful scope.
39. As a user, I want task references in inspection calls to be links when a corresponding task page exists, so that I can navigate from evidence to the inspected entity.
40. As a user, I want permission-block reporting to show the reported reason, so that I know what prevented the run from proceeding.
41. As a user, I want rejected framework actions to show their rejection reason, so that I can distinguish validation outcomes from technical failures.
42. As a user, I want a framework comment call to show the actual comment body, so that I can understand the contribution without opening raw MCP arguments.
43. As a user, I want long comment bodies collapsed by rendered line count, so that comments remain compact without being cut at arbitrary character boundaries.
44. As a user, I want to expand and collapse a long comment body, so that I control how much authored content is visible.
45. As a user, I want a conversation comment to link to the exact task activity history entry, so that I can inspect its chronological context.
46. As a user, I want navigation to a task activity history source to expand, scroll to, and focus it, so that the destination is unambiguous.
47. As a user, I want task activity history child-creation entries to link to the created child, so that equivalent domain facts behave consistently outside the conversation.
48. As a user, I want other task references in task activity history to become links where a meaningful destination exists, so that entity navigation is consistent.
49. As a user, I want expanded tool details and my reading position preserved during live transcript refreshes, so that polling does not interrupt inspection.
50. As a user, I want running tool rows to update in place when they finish, so that one logical call does not appear as duplicate transcript entries.
51. As a user, I want diagnostics to remain visually distinct from ordinary tools and prose, so that runtime problems are easy to locate.
52. As a user, I want commands, raw MCP details, and diagnostics rendered literally rather than as Markdown, so that machine evidence is not reinterpreted as authored prose.
53. As a keyboard user, I want disclosures, copy controls, and navigation actions operable with visible focus, so that the compact layout remains accessible.
54. As a user on a narrow viewport, I want long paths, commands, identifiers, and output contained within the dialog, so that the page does not gain horizontal overflow.
55. As a user, I want the compact stream to remain legible in both themes, so that quieter supporting content does not become too faint.
56. As a user, I want existing conversation continuation, polling, selected-source navigation, token usage, and run timing to keep working, so that the display redesign does not regress conversation behavior.

## Implementation Decisions

- Treat the agent run transcript as a compact activity stream rather than a
  stack of equally weighted cards. Preserve chronological item order and
  visible run boundaries.
- Give Markdown message surfaces restrained padding and give tool calls a
  denser row treatment with light separators and a fixed status-icon column.
- Keep the run heading as the source of agent-message authorship. Do not render
  a second "Codex message" title inside each message.
- Use the shared Markdown renderer for Codex messages, authored conversation
  follow-ups, and displayed framework comment bodies.
- Attach the shared copy-Markdown control to every Markdown-rendered transcript
  block and copy the unrendered source string.
- Do not render diagnostics, commands, raw arguments, raw results, or command
  output as Markdown.
- Represent tool state with a shared, accessible SVG status component. Map
  semantic success to a success marker, active execution to a spinner, domain
  rejection to an unsuccessful marker with its reason, and technical failure
  to a failure marker with its diagnostic. Provide nonvisual status text.
- Determine a framework command's displayed state from the domain result when
  one exists. An `accepted: false` result is rejected even if the MCP item's
  transport status is `completed`.
- Remove appended success words from collapsed tool rows. Exceptional states
  may retain concise visible text when it adds information beyond the icon.
- Present commands with a generic human-readable title and no inferred purpose.
  Put the complete command and available output into one disclosure in that
  order. Retain existing output bounding and truncation protections.
- Preserve enough structured transcript evidence to render commands and MCP
  calls without rebuilding presentation from a lossy summary string.
- Present unknown MCP headings as a humanized server name, separator, and
  humanized tool name. Preserve their exact identifiers in disclosed raw
  details.
- For non-framework MCP tools, show no default body unless a later explicit,
  stable semantic renderer is added. The disclosure presents structured
  arguments and results in a bounded literal format.
- Implement tailored transcript presentation data for every framework MCP tool
  exposed to agents, including operating-context inspection, board and task
  listing, task/activity/attachment inspection, collaborator listing, current
  task inspection, comments, moves, child-task creation, dependency creation,
  and permission-block reporting.
- Tailored framework presentations must add domain information rather than
  repeat their heading or status. Prefer authoritative result facts over
  requested arguments, falling back to arguments only while a call is running
  or when the result omits the fact.
- Framework cards put the complete non-authored action description in one
  header and omit a body that would only restate it. Current-task tools omit
  the current task ID; tools requiring an explicit task, board, column, or
  related-task identifier include that requested scope in the header.
- Known framework MCP tools show only their semantic presentation and status;
  they do not expose server identifiers, tool identifiers, raw transport
  status, arguments, or results in a diagnostic disclosure. Compatibility with
  historical transcript shapes is not required.
- Reuse the task activity history's rendered-line preview behavior for comment
  bodies rather than introducing character-count truncation.
- Make the comment-to-history action close the conversation dialog, reveal the
  relevant task activity history entry, expand it, scroll it into view, and
  move focus to it.
- Render task references as internal navigation links when the application has
  a meaningful task destination. Apply the same linking rule to equivalent
  task activity history descriptions, including child-task creation and
  dependency-related events.
- Do not invent links for identifiers that have no corresponding navigable UI
  destination.
- Preserve disclosure state and scroll anchoring when live polling replaces
  transcript data. Stable tool item identities continue to update one row in
  place.
- Use the existing conversation query and runtime transcript boundaries rather
  than introducing a separate display store. Extend their typed data only as
  needed to retain structured evidence and semantic outcomes.
- This display redesign does not change agent conversation, agent run,
  activation, task activity history, or MCP execution semantics.
- No ADR is required: the work refines presentation and retained transcript
  evidence at existing seams and does not introduce a hard-to-reverse system
  architecture decision.

## Testing Decisions

- Test externally observable behavior rather than component structure, CSS
  implementation details, or private formatting helpers.
- Use runtime-adapter tests as the first seam for raw streamed Codex items.
  Verify that command events retain command and output details; MCP events
  retain server, tool, arguments, and result; framework calls expose reliable
  domain facts; live updates replace the same item; and `accepted: false`
  becomes a rejected semantic outcome despite transport completion.
- Cover every framework MCP tool with representative running, successful, and
  unsuccessful evidence where those outcomes apply. Prefer table-driven cases
  when they preserve readable failures.
- Use browser tests as the primary user-facing seam. Verify stream order, run
  attribution, compact message and tool hierarchy, Markdown rendering,
  copy-source behavior, command and MCP disclosures, status accessibility,
  framework semantic bodies, comment truncation, and entity navigation.
- Extend existing live-polling browser coverage to prove that a running row
  updates in place and that scroll position and open disclosures do not reset.
- Extend task activity history browser coverage to prove that child and related
  task references navigate to the correct task.
- Reuse existing browser precedents for selected conversation sources,
  timeline source focusing, long unbroken transcript content, copy-Markdown
  controls, rendered-line previews, and dialog focus containment.
- Add appearance coverage in both dark and light themes because the compact
  stream, semantic icons, separators, message surfaces, hover states, focus
  states, and diagnostics form a changed interactive visual pattern.
- Verify icon geometry against its control or status slot where the repository's
  shared icon-button and centered-SVG conventions apply.
- Verify that status meaning remains available without color and that animated
  running state respects the application's accessibility expectations.
- Keep existing conversation continuation, token usage, run duration, selected
  attempt/message positioning, narrow-viewport containment, and polling tests
  green.

## Out of Scope

- Pixel-for-pixel reproduction of the Codex desktop conversation interface.
- Natural-language summarization or heuristic parsing of arbitrary shell
  commands, including stripping host-specific PowerShell launch prefixes to
  guess user intent.
- A generic semantic summarizer for arbitrary third-party MCP argument and
  result schemas.
- Markdown rendering of raw tool evidence, diagnostics, command invocations,
  command output, MCP arguments, or MCP results.
- New pages or destinations solely to make otherwise non-navigable identifiers
  into links.
- Changes to MCP tool behavior, agent permissions, task coordination semantics,
  agent conversation continuity, or task activity history semantics.
- A throwaway visual prototype; the repository is small enough to implement
  and tune the design directly in the production conversation dialog.
- Persistence redesign for agent run transcripts beyond any typed evidence
  required by the existing conversation query flow.

## Further Notes

- The implementation must begin from the post-conversation-retirement working
  tree and preserve the user's Git ownership. Changes remain unstaged for user
  review.
- The existing task activity history is the visual and interaction precedent
  for Markdown comments, copying source Markdown, multiline disclosure, source
  focusing, and task navigation.
- The current transcript stores a generic tool name, status, lossy summary, and
  optional string output. The implementation will likely need a more expressive
  discriminated contract so the browser can render commands, generic MCP calls,
  and known framework calls without parsing display strings.
- Official OpenAI API documentation exposes typed tool-call categories and
  structured MCP arguments/results, supporting semantic presentation when the
  runtime adapter retains those fields. The implementation should still rely on
  the installed Codex SDK's actual event contract and fixture evidence rather
  than assuming every OpenAI API item is emitted by the Codex SDK.
