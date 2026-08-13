# Agent Instructions

## Agent skills

### Issue tracker

Issues and specifications are stored as local Markdown under `.scratch/`. See
`docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repository using `CONTEXT.md` and `docs/adr/`, created
lazily as decisions emerge. See `docs/agents/domain.md`.

### Architecture docs

`docs/architecture.md` is the inspection map for the implemented system. Read it
before changing module boundaries, state ownership, authoritative flows, runtime
integration, or startup invariants. Update it in the same change whenever one of
those architectural facts changes; record durable decision reasoning in an ADR.

### Development workflow

When the user asks which workflow or skill should come next, consult
`.agents/skills/ask-matt/SKILL.md` and
`docs/agents/development-workflow.md`.

The default delivery flow is:

`wayfinder or grill-with-docs -> to-spec -> to-tickets -> implement -> code-review -> user review`

### Git ownership

The user owns staging, commits, and pushes. Agents must leave their changes
unstaged and must not disturb staged content. Staged content represents changes
the user has reviewed and accepted. See
`docs/agents/development-workflow.md` for the complete working agreement.

Do not change Git's global trust configuration. Use the documented
command-scoped override for read-only inspection when necessary.
