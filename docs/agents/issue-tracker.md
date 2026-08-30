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
under `.scratch/<effort-slug>/`.

When a skill needs a ticket, read the referenced Markdown file. The user may
identify it by path or ticket number.

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
