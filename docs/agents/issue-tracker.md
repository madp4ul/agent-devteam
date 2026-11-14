# Issue tracker: Local Markdown

Issues and specifications for this repository live as Markdown files under
`.scratch/`.

## Conventions

- One effort per directory: `.scratch/<effort-slug>/`
- Its specification is `.scratch/<effort-slug>/spec.md`
- Implementation tickets are individual files under
  `.scratch/<effort-slug>/issues/<NN>-<slug>.md`
- Tickets are numbered from `01` in dependency order
- Never combine all tickets into one file
- Comments and conversation history are appended under `## Comments`

## Publishing and fetching

When a skill says "publish to the issue tracker," create the appropriate file
under `.scratch/<effort-slug>/`. First check existing active efforts and
`.scratch/archive/` for related work. Extend a relevant active effort rather
than creating a duplicate. Capture small unplanned ideas in `.scratch/BACKLOG.md`
with a short description and a source link when available; create a dedicated
effort when the idea needs its own specification or tickets. Historical overlap
alone does not require reopening an archived effort: link it as context for new
work.

When a skill needs a ticket, read the referenced Markdown file. The user may
identify it by path or ticket number.

## Manual archival and historical context

Archiving happens only when the user requests it, never automatically during
implementation or ticket resolution.

- An effort is eligible when it has at least one ticket and every issue under
  its `issues/` directory is explicitly `resolved` (or the legacy equivalent
  `done`). Open, claimed, missing, or ambiguous statuses prevent archival.
- Directories without tickets and standalone notes need separate manual review;
  they are not complete merely because they have no unresolved tickets.
- Move the whole effort from `.scratch/<effort>/` to
  `.scratch/archive/<effort>/`, preserving its specs, research, evidence, and
  ticket history. Do not rewrite historical statuses to manufacture closure.
- Update affected links, including relative links from moved documents, and
  add the effort to `.scratch/archive/README.md`. Keep historical Git-report
  paths and identities unchanged: they describe paths at the recorded commit.
- Leave all moves and edits unstaged for user review, following Git ownership.

The archive is searchable planning history, not disposable material. Read its
specifications, research, and resolved tickets when they explain related work.
Exclude archived efforts from the active work queue. Current implementation,
`docs/architecture.md`, `CONTEXT.md`, and applicable ADRs determine the current
system; an old spec may describe behavior that has since changed. Archived
efforts may retain parent statuses such as `ready-for-agent` or `awaiting user
review`; this archival pass uses ticket completion, not a new claim about those
historical review states.

## Wayfinding operations

- Map: `.scratch/<effort>/map.md`
- Child ticket: `.scratch/<effort>/issues/<NN>-<slug>.md`
- Type: `research`, `prototype`, `grilling`, or `task`
- Status: `open`, `claimed`, or `resolved`
- Blocking: record dependencies using `Blocked by: NN, NN`
- Frontier: open, unblocked, and unclaimed tickets, ordered by number
- Claim: set `Status: claimed` before beginning work
- Resolve: append the result under `## Answer`, set `Status: resolved`, and add
  a link and summary to the map's `Decisions so far`
- Follow-through: when a resolved decision requires implementation, publish its
  dependency-aware child tickets before handing the decision back as complete,
  and link those tickets from the decision and map
