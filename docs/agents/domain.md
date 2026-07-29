# Domain Documentation

This repository uses a single domain context.

## Before exploring

Read these when they exist:

- `CONTEXT.md` for the project glossary
- Relevant decisions under `docs/adr/`

Do not report their absence or create them preemptively. `domain-modeling` and
`grill-with-docs` create them lazily when terminology or durable decisions are
resolved.

## Vocabulary

Use canonical terms from `CONTEXT.md` in specifications, tickets, code, tests,
and documentation. If a needed concept is missing or ambiguous, resolve it
through `domain-modeling`.

## Architectural decisions

Read ADRs relevant to the area being changed. If proposed work contradicts an
ADR, surface the conflict instead of silently overriding the decision.
