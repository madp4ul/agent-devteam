# 86 — Isolate Web API Routes Behind a Typed Dispatcher

**Type:** task

**What to build:** Replace the browser and agent API conditional route chains
with separately registered route modules behind one small, dependency-free,
project-owned typed dispatcher while preserving every existing HTTP contract,
security boundary, streaming path, and application-authority rule.

**Blocked by:** 84 — Evaluate the Web API Routing Boundary.

**Status:** resolved

## Decision source

Implement the recommendation from
[issue 84](./84-evaluate-web-api-routing-boundary.md) and its cited
[research note](../research/web-api-routing-boundary.md). Keep Node.js 24
`node:http`; do not add `find-my-way`, Fastify, another router/framework, or a
dependency on Node's experimental `URLPattern`. Treat
[ADR 0016](../../../docs/adr/0016-keep-the-local-http-adapter-framework-free-until-platform-needs-emerge.md)
as the durable decision and framework-reconsideration boundary.

The purpose is bounded maintainer context and safer endpoint changes, not a new
application layer or an HTTP behavior redesign. `CoordinationApplication`
remains authoritative for queries, commands, transactions, and projections.

## Delivery sequence

Keep the suite green at each boundary and do not replace the complete adapter
in one rewrite.

1. Add the dispatcher as a pure, independently tested module. Treat this as a
   stopping gate before migrating routes.
2. Extract the existing request/response codecs without changing their
   behavior, then migrate one low-risk browser cluster such as Settings.
3. Migrate the remaining browser resources in coherent groups. Keep
   conversation uploads/downloads and host workspace integration as explicit
   review boundaries rather than burying them in generic middleware.
4. Build a separately authenticated agent route set, then migrate discovery
   and current-task routes while preserving immutable scope-derived identity.
5. Delete the old conditional dispatchers only after route-inventory coverage
   proves that every method/path pair is represented and the full relevant
   suite is green.

## Required module and registration shape

Use this shape unless a nearby name must change to match repository naming:

```text
src/web/web-server.ts                 # lifecycle, prefix selection, static assets
src/web/http/dispatcher.ts            # pure method/path registration and matching
src/web/http/request.ts               # existing body and field decoding behavior
src/web/http/response.ts              # existing response and status helpers
src/web/browser-api/routes.ts          # browser route-set composition
src/web/browser-api/*-routes.ts        # resource-focused browser handlers
src/web/agent-api/routes.ts            # authentication and scoped composition
src/web/agent-api/*-routes.ts          # discovery/current-task handlers
```

Group browser handlers by meaningful maintenance context: Settings,
automation, tasks, conversations, archive/workspace, and attention are the
starting groups. Group agent handlers into discovery and current-task
contexts. Avoid one file per trivial endpoint and record any justified grouping
change in the ticket answer.

Every route's method and literal path template must be searchable beside its
handler. Route modules accept only the capability subset required by their
coherent endpoint group; do not replace the existing browser/agent separation
with a broad framework context or service locator.

## Dispatcher contract

- [ ] Support only a closed HTTP-method union, literal path segments, and named
  single-segment parameters. Do not add arbitrary regular expressions,
  wildcards, constraints, middleware, schemas, dependency injection, body
  parsing, response serialization, or static-file behavior.
- [ ] Infer or otherwise statically constrain each handler's named parameters
  from its registered template so a handler cannot silently request a missing
  parameter.
- [ ] Decode each named parameter exactly once. Make malformed percent-encoding
  an explicit matcher/dispatch outcome that the adapter maps to today's
  invalid-request response.
- [ ] Prefer static segments over parameter segments independent of
  registration order. Reject duplicate and structurally ambiguous routes at
  startup with actionable diagnostics.
- [ ] Await async handlers so the existing top-level API error boundary remains
  authoritative.
- [ ] Distinguish matched, not-found, and method-not-allowed outcomes
  internally, including the allowed methods, while preserving the currently
  observable API/static 404 and 405 responses during this refactor.
- [ ] Expose a deterministic route catalog containing method, template, and
  owning module/group so an AI maintainer can inspect the complete transport
  surface without opening handler bodies.
- [ ] Keep the dispatcher small and transparent enough to understand and test
  as one deep mechanical module; do not grow a private web framework.

## Boundaries and behavior to preserve

- [ ] Keep raw `IncomingMessage`, `ServerResponse`, and `URL` available to
  handlers. The dispatcher must never buffer request or response content.
- [ ] Preserve the 64 KiB ordinary JSON-body limit, JSON-object requirement,
  field parsing, query parsing, path decoding, idempotency input, result/status
  mappings, content types, content lengths, and API exception payloads.
- [ ] Preserve existing unknown browser API, unknown agent API,
  method-not-allowed, and static-route behavior exactly. Any intentional
  normalization of 404/405 semantics requires a separate behavior ticket.
- [ ] Keep conversation uploads streaming from the raw request, including the
  declared-size precheck and application-enforced limits. Keep attachment
  downloads streaming with media type, byte length, encoded filename,
  disposition, and `x-content-type-options: nosniff`.
- [ ] Keep static-asset traversal protection, SPA fallback, MIME mapping,
  caching headers, GET/HEAD behavior, and unavailable-build response unchanged.
- [ ] Browser handlers continue to receive only browser capabilities and derive
  `{ kind: "user", id: "local-user" }` inside the adapter.
- [ ] Agent bearer authentication happens visibly before scoped handler
  dispatch. Current-task handlers derive task ID, agent ID, and optional
  attempt ID only from the resolved immutable scope and never from model input.
- [ ] Route handlers remain transport adapters. They must not access
  persistence, coordinate lower-level application queries, own transactions,
  reconstruct projections, or move business decisions out of
  `CoordinationApplication`.
- [ ] Keep browser and agent route registrations separate even where they call
  the same application capability. Share only dispatcher and genuinely common
  codec mechanics.

## Verification

- [ ] Add pure dispatcher tests for exact matches, named segments, static-over-
  parameter precedence in both registration orders, duplicates, structural
  ambiguity, malformed encoding, async propagation, not-found,
  method-not-allowed with allowed methods, and deterministic catalog output.
- [ ] Add focused route tests using fake narrow capability objects rather than
  a real `CoordinationApplication`. Cover at least one browser query/mutation,
  one query parameter, one result/status mapping, one async failure, one
  authenticated agent query, one scoped current-task mutation, invalid/missing
  bearer scope, and attempts to supply another task identity.
- [ ] Add focused compatibility coverage for streaming upload and attachment
  download behavior without converting either path into buffered JSON/body
  handling.
- [ ] Add a route-inventory assertion that accounts for every pre-refactor
  browser and agent method/path template and detects accidental loss,
  duplication, or prefix crossover.
- [ ] Keep all existing web-server, MCP, integration, and browser tests green.
  Run TypeScript typechecking and the production build as final verification.
- [ ] Inspect `docs/architecture.md` after extraction. Update it only if the
  implemented inspection map, authority boundary, runtime integration, or
  startup invariants changed; do not add source-file inventory noise.

## Stopping and reconsideration rules

After the pure dispatcher proof, stop migration and retain direct Node routing
if the dispatcher cannot remain dependency-free and limited to literal/named
segments, cannot preserve raw streaming and exact response behavior, or cannot
make a representative route testable with a fake narrow capability without
reconstructing the full application. Record the failed evidence under
`## Answer`; helper extraction may remain only when it independently improves
the existing adapter.

During grouping, stop splitting when a proposed module would contain only
trivial registration and force readers through more files without reducing
capability or change coupling.

Do not adopt a fallback within this ticket. If later evidence requires
wildcards, constraints, substantial route scale, or matching machinery beyond
this narrow contract, open fresh research for `find-my-way` 9.x. If repeated
requirements demand shared middleware, schema-governed validation or
serialization, or framework request injection, open a separate server-platform
decision under the objective triggers and proof requirements in ADR 0016;
re-evaluate current candidates and versions rather than assuming Fastify 5.x.

## Answer

Implemented the framework-free typed dispatcher and migrated the complete local
HTTP transport surface away from the conditional route chains.

The pure dispatcher now owns only the closed method union, literal/named
single-segment matching, one-time parameter decoding, static precedence,
startup diagnostics for duplicate, ambiguous, and repeated-parameter routes,
awaited handler invocation, internal match outcomes, and a deterministic route
catalog. Request decoding and response/status mechanics moved into focused HTTP
codec modules without buffering raw streaming routes.

Browser routes are separately composed as Settings, automation, tasks,
conversations, archive/workspace, and attention groups. Agent routes are
separately authenticated before dispatch and composed as discovery and
current-task groups. Each group declares its required application capability
subset; browser provenance comes from one adapter-owned local-user actor, while
current-task agent identity remains derived only from immutable bearer scope.
Conversation uploads and downloads retain raw request/content streaming and
their existing size and response-header behavior. Static assets remain in the
Node server lifecycle adapter.

The route catalog accounts for all 38 browser and 14 agent method/template
pairs and enforces prefix separation. Added pure dispatcher, fake-capability
route, authentication/scope, streaming compatibility, and inventory tests.
Updated `docs/architecture.md` with the implemented inspection boundary.

Verification after two-axis review fixes:

- TypeScript typechecking passed.
- 23 focused dispatcher/route/existing web-server tests passed.
- Production Vite build passed.
- The full Node suite ran 262 tests: all issue-86 and web tests passed; two
  unrelated existing runtime prompt-composition assertions failed because the
  current prompt omits an expected sentence. Issue 86 changes no runtime prompt
  or runtime test files.
- The full Playwright suite passed 127/130. An isolated rerun cleared the
  dropped-file failure; two unchanged browser scenarios remained reproducible:
  process-evolution task detail received an application-originated
  `{ available: false, reason: "not-found" }`, and an attention test counted an
  existing informational icon button. The pre-refactor route used the same
  application query, and issue 86 changes no browser client or Playwright test
  files.

No routing dependency or framework was added. This implementation performed no
Git staging; concurrent work staged some shared documentation while issue 86
was in progress, and that reviewed index state was left untouched.
