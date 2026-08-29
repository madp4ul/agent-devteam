# Web API Routing Boundary Research

Date: 2026-08-29

## Question

Should the local Node.js HTTP adapter keep its direct conditional routing,
extract a project-owned routing seam, adopt a focused router, or move to a full
web framework so this project's AI maintainer can locate, change, test, and
review endpoints with less unrelated context?

## Recommendation

Keep Node.js HTTP as the server and introduce a **project-owned tiny typed
dispatcher**. Use the same dispatcher primitive for browser and agent routes,
but build two separate route sets behind their existing prefixes, capability
interfaces, actor derivation, and agent bearer-scope check. Do not add a routing
dependency or web framework now.

The useful seam is route selection and registration, not a new application
layer. Each route declaration should make one method, one path template, its
typed path parameters, and one handler visible together. Resource-focused
modules should translate HTTP inputs and application results while
`CoordinationApplication` remains the only authority for queries, commands,
transactions, and projections.

This recommendation improves the maintainer's navigation and editing safety
without replacing working transport behavior. Node describes its HTTP API as
deliberately low-level: it provides streaming and message parsing but does not
parse bodies or actual header values
([Node.js HTTP documentation](https://nodejs.org/docs/latest-v24.x/api/http.html)).
That is a good fit for the existing raw upload/download paths, but it supplies
no route organization. A small project-owned dispatcher fills precisely that
gap.

The durable decision, objective reconsideration triggers, and proof required
before any future framework adoption are recorded in
[ADR 0016](../../../docs/adr/0016-keep-the-local-http-adapter-framework-free-until-platform-needs-emerge.md).

## Repository evidence

The cost is not merely that `src/web/web-server.ts` is 1,027 lines:

- `handleBrowserApi` spans 492 lines and contains 35 method/path branches plus
  23 separately declared regular-expression matches. `handleAgentApi` spans
  166 lines with 14 method/path branches and three parameter matches: 49 route
  branches and 26 path regexes in total. A maintainer must scan ordering, match
  declarations, parsing, invocation, and status mapping to find one endpoint.
- Static assets, JSON bodies, query values, host workspace integration,
  authentication, application calls, and streaming attachments all share the
  file. The long chains therefore increase unrelated context and conflict
  likelihood when independently changing endpoints.
- Ordering is behavior. Static paths such as `/api/tasks/archive` coexist with
  parameter paths such as `/api/tasks/:taskId`; conversation paths share
  prefixes with uploads, attachments, continuation, and retirement. A route
  declaration table can make conflicts and precedence testable instead of
  implicit in branch order.
- The adapter already has the right security and architecture boundary. Its
  browser capability interface lists 37 application methods, while
  `BrowserCoordinationCapabilities` and `AgentCoordinationCapabilities` are
  distinct `Pick` types, the agent scope derives the current task and actor from
  the bearer token, and handlers call the application rather than persistence.
  Extraction should preserve and narrow those interfaces per route module, not
  replace them with one framework context.
- Shared helpers already centralize JSON/text responses, field extraction, and
  common mutation mapping. Extraction can retain these helpers. A router does
  not make the existing compile-time transport interfaces into runtime
  validation, so validation should not be claimed as a routing benefit.
- The browser adapter tests are eight full-server integration setups in a
  587-line file, each starting a real application and server. Agent HTTP
  behavior is exercised mainly through still larger MCP and browser workflows.
  These tests are valuable end-to-end coverage, but the current shape makes a
  one-endpoint status or parsing test expensive to arrange. Exported route-set
  builders accepting fake capability objects would enable focused adapter
  tests while retaining the existing HTTP and workflow tests.
- Existing behavior is specific and must be characterized before extraction:
  API handler exceptions currently become `400 { error: "invalid-request" }`;
  unknown browser and agent API combinations become their distinct 404 bodies;
  non-GET/HEAD static requests receive 405; uploads stream the raw request with
  a declared-size precheck; ordinary JSON bodies are capped at 64 KiB;
  downloads stream content with length, disposition, media type, and `nosniff`;
  browser and agent result-to-status mappings differ. A routing refactor must
  not silently “improve” any of these contracts.

## Smallest useful design

Use a small `web/http/dispatcher.ts` with a deliberately limited grammar:
literal path segments and named single-segment parameters only. It should:

- accept a closed HTTP-method union, path template, and async handler;
- decode each named parameter exactly once and turn malformed encoding into the
  adapter's explicit invalid-request result;
- select static segments ahead of parameter segments independent of
  registration order;
- reject duplicate or structurally ambiguous registrations at startup;
- distinguish `not-found` from `method-not-allowed` internally and expose the
  allowed methods, while initially mapping them to today's public responses;
- await handlers so the existing outer error boundary remains authoritative;
  and
- leave `IncomingMessage`, `ServerResponse`, `URL`, body reading, and streaming
  untouched.

Do not accept arbitrary route regular expressions, middleware, dependency
injection, schemas, or response serialization in this module. Those features
would turn a transparent seam into a private framework and enlarge the code an
AI maintainer must understand.

Node 24's built-in `URLPattern` is not a suitable hidden dependency for this
boundary because Node still labels it experimental
([Node.js 24 globals](https://nodejs.org/download/release/latest-v24.x/docs/api/globals.html#class-urlpattern),
[Node.js 24 URLPattern](https://nodejs.org/download/release/latest-v24.x/docs/api/url.html#class-urlpattern)).
The owned matcher should implement only the fixed segment grammar above.

A repository-shaped module layout is:

```text
src/web/
  web-server.ts                 # listen/close, prefix dispatch, static assets
  http/
    dispatcher.ts               # method + literal/named-segment matching only
    request.ts                  # body and field decoding helpers
    response.ts                 # JSON/text/status helpers
  browser-api/
    routes.ts                   # route-set composition
    settings-routes.ts
    automation-routes.ts
    task-routes.ts
    conversation-routes.ts
    archive-and-workspace-routes.ts
    attention-routes.ts
  agent-api/
    routes.ts                   # authenticate once, compose scoped routes
    discovery-routes.ts
    current-task-routes.ts
```

The exact file grouping may follow change hotspots, but each endpoint literal
should occur beside its handler and focused capability type. Browser and agent
routes share mechanics only. The agent prefix must still authenticate before
dispatch to scoped handlers, and current-task mutations must continue deriving
`taskId`, `agentId`, and optional `attemptId` from the resolved scope.

## Candidate comparison

| Option | What it solves | What remains project-owned | Maintainer assessment |
| --- | --- | --- | --- |
| Keep the current chains | No migration risk or dependency; raw streams and behavior stay visible. | Route discovery, ordering, endpoint isolation, test seams, and conflict detection. | Reject as the long-term shape. The concrete coupling is already large enough to justify extraction. |
| Project-owned typed dispatcher | Co-locates method/path/handler, makes precedence and duplicates testable, and permits resource modules with narrow capabilities. | Existing parsing, validation, status mapping, auth, streaming, and static serving remain explicit. | **Choose.** It is the smallest change that materially reduces context and edit coupling. |
| Focused router (`find-my-way` 9.x) | Supports methods, named parameters, wildcards, automatic parameter decoding, a default/bad-URL route, and route inventory/printing. Its current package supports Node 20+ and has three direct runtime dependencies ([official README](https://github.com/delvedor/find-my-way), [package metadata](https://github.com/delvedor/find-my-way/blob/main/package.json)). | Capability boundaries, async error policy, bodies, validation, result/status mapping, streaming, static files, and endpoint test design. | Reject for now. Its larger grammar and dependency surface solve scale/performance needs this local adapter has not demonstrated; most required wrapper code remains. Reconsider if the route grammar grows beyond literal and named segments. |
| Full framework (Fastify 5.x) | Declarative routes, async handlers, hooks and encapsulation, JSON-Schema request/response validation, custom errors, streams, and in-process request injection ([routes](https://fastify.dev/docs/latest/Reference/Routes/), [encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/), [validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), [testing](https://fastify.dev/docs/latest/Guides/Testing/), [reply streams](https://fastify.dev/docs/latest/Reference/Reply/)). | Application authority and capability design still remain local. Existing bodies, errors, static assets, and raw attachment streams must be deliberately adapted to framework lifecycle and defaults. | Reject. The stable 5.10 package brings a broad runtime stack ([v5.10 package metadata](https://github.com/fastify/fastify/blob/v5.10.0/package.json)); adopting schemas and hooks well would be a separate architectural migration, while using only its router would pay that cost without its benefits. |

`find-my-way` is the serious focused-router fallback, not because throughput is
important here, but because it is framework-independent and exposes route
parameters and inventory. Its documentation says `lookup` selects a registered
handler, otherwise calls the default route, and automatically decodes
parameters. That decoding would require deleting the adapter's current
`decodeURIComponent` calls rather than stacking both behaviors. Its route tree
and supported constraints are more machinery than the current fixed localhost
API requires
([official `find-my-way` documentation](https://github.com/delvedor/find-my-way)).
Its published declarations expose parameters as a string-keyed record and do
not infer names from the path literal, so it does not by itself provide the
repository-specific parameter typing sought here
([official declarations](https://raw.githubusercontent.com/delvedor/find-my-way/main/index.d.ts)).

Fastify has genuine benefits, especially `inject`, awaited async handlers,
encapsulated hooks, and schema compilation. It also deliberately parses JSON
and text bodies by content type, applies a default body limit, and requires a
custom parser to retain raw streaming behavior
([Fastify content-type parser](https://fastify.dev/docs/latest/Reference/ContentTypeParser/)).
Its request parameters are already percent-decoded and must be treated as
untrusted input
([Fastify request documentation](https://fastify.dev/docs/latest/Reference/Request/)).
Those defaults are reasonable, but migrating to them safely is much broader
than isolating routes and risks changing current error payloads and upload
semantics. The repository already uses real-loopback `fetch` tests, so
framework injection is an optimization rather than a missing capability.

## Contracts to preserve

Any implementation ticket must keep these constraints explicit:

1. `CoordinationApplication` remains the only command/query authority. Route
   modules decode transport data and map results; they do not coordinate
   lower-level queries or own transactions.
2. Browser routes receive only browser capabilities and always derive the
   local user actor. Agent routes authenticate before handler selection and
   receive only agent capabilities plus the resolved immutable scope.
3. Existing URL, query, path-decoding, JSON field, status, error-payload,
   idempotency, 404, and 405 behavior stays byte-for-byte compatible during
   migration unless a separately specified behavior ticket changes it.
4. Upload requests and attachment responses remain streaming. The dispatcher
   must never buffer them, and attachment downloads retain `nosniff`. Static
   assets retain traversal protection, SPA fallback, MIME mapping, and HEAD
   behavior.
5. Existing web, MCP, integration, and browser tests remain green. Add focused
   tests for dispatcher precedence/ambiguity/malformed encoding and route-level
   tests using fake capability objects, including one browser route, one
   authenticated agent route, one query parameter, one async failure, and the
   upload/download pair.
6. Route registration must remain searchable as plain method and path literals;
   avoid decorators, generated route files, implicit filesystem routing, or
   clever TypeScript types that obscure navigation.

## Incremental migration and follow-up evidence

Split implementation into fresh-context tickets rather than rewriting the
adapter at once:

1. Add and unit-test only the dependency-free dispatcher plus a minimal
   loopback test harness. Prove deterministic static/parameter precedence,
   duplicate rejection, async error propagation, malformed parameter handling,
   and internal 404/405 classification.
2. Extract request/response helpers without changing behavior, then migrate a
   small low-risk browser group such as settings. Compare exact responses with
   the old integration tests.
3. Migrate browser resources in bounded groups, leaving conversation streaming
   and host workspace routes for their own tickets.
4. Build the separately authenticated agent route set and migrate its discovery
   and current-task groups. Preserve scoped identity with focused negative
   tests.
5. Remove the conditional dispatchers only after route inventory coverage
   proves that every old method/path pair is registered and the full test suite
   is green.

The evidence that justifies those tickets is the current 658 lines of API
dispatch, 49 method branches, implicit precedence, broad capability interfaces,
and reliance on coarse full-server fixtures. No performance benchmark is
needed; the goal is bounded context and safer change review.

No throwaway proof was needed for this research decision. The important
ergonomics are settled by directly inspecting the repository: method/path and
handler are separated today, direct adapter endpoint tests construct a full
application and real server, and both candidate libraries leave capability and
status mapping project-owned. Step 1 is intentionally the bounded
implementation proof; its stopping condition prevents the proof from becoming
production framework work if the seam does not stay small.

Use this **no-change stopping condition** after step 1: stop and retain direct
Node routing (while still allowing ordinary helper extraction) if the
dispatcher cannot remain a small, dependency-free module with only literal and
named-segment matching; cannot preserve raw request/response streaming and
existing status/error behavior; or does not let a route be tested with a fake
narrow capability object without reconstructing the full application. Also
stop further file splitting if a resource module would contain only trivial
registration while forcing readers to traverse more files than the old chain.

Reconsider `find-my-way` 9.x only if future requirements add wildcards,
constraints, substantial route counts, or matching behavior that makes the
owned dispatcher grow beyond this narrow contract. Reconsider Fastify 5.x only
as a separately researched server-platform decision when the product needs a
shared middleware lifecycle, framework-owned schema validation/serialization,
or in-process injection strongly enough to justify migrating all HTTP semantics.

## Sources

All external claims above use primary project documentation or source:

- [Node.js 24 HTTP documentation](https://nodejs.org/docs/latest-v24.x/api/http.html)
- [Node.js 24 `URLPattern` status](https://nodejs.org/download/release/latest-v24.x/docs/api/globals.html#class-urlpattern)
- [`find-my-way` official documentation and source](https://github.com/delvedor/find-my-way)
- [`find-my-way` package metadata](https://github.com/delvedor/find-my-way/blob/main/package.json)
- [`find-my-way` TypeScript declarations](https://raw.githubusercontent.com/delvedor/find-my-way/main/index.d.ts)
- [Fastify route reference](https://fastify.dev/docs/latest/Reference/Routes/)
- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/)
- [Fastify content-type parsing](https://fastify.dev/docs/latest/Reference/ContentTypeParser/)
- [Fastify request and decoded-parameter behavior](https://fastify.dev/docs/latest/Reference/Request/)
- [Fastify reply and streaming behavior](https://fastify.dev/docs/latest/Reference/Reply/)
- [Fastify testing and injection](https://fastify.dev/docs/latest/Guides/Testing/)
- [Fastify 5.10 package metadata](https://github.com/fastify/fastify/blob/v5.10.0/package.json)
