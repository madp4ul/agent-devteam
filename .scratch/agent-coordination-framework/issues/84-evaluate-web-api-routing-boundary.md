# 84 — Evaluate the Web API Routing Boundary

**Type:** research

**What to decide:** Determine whether the local HTTP adapter should keep its
current direct Node.js routing, adopt a small routing abstraction, or use a web
framework so browser and agent endpoints become easier for this project's AI
maintainer to locate, understand, change, test, and review independently.

**Blocked by:** None

**Status:** resolved

## Maintainer decision

The agent doing this research is also the intended long-term maintainer and the
likely implementer of its recommendation. Optimize for that agent's effective
work in this repository: navigability, bounded context, safe edits, reliable
tests, and confidence about cross-endpoint behavior. Do not recommend a
framework because it is fashionable, familiar to a human team, or requested as
a premise. A well-evidenced recommendation to keep direct Node.js HTTP handling
is valid.

## Investigation

- Characterize the current browser API, agent API, static-asset handling, shared
  body/response helpers, error behavior, capability interfaces, and tests. Name
  the concrete maintenance costs of the current long conditional route chains
  rather than treating file length alone as a defect.
- Identify the smallest useful seam for isolating endpoints. Compare at least:
  keeping the current structure, extracting project-owned route modules behind
  a tiny typed dispatcher, adopting a focused router, and adopting a fuller web
  framework.
- Evaluate serious candidates against the current Node.js and TypeScript
  runtime using primary sources and a small repository-shaped proof when source
  inspection cannot settle the important ergonomics.
- Assess route discovery, path-parameter and query parsing, typed request and
  response contracts, validation, async error mapping, streaming or binary
  attachment responses, method-not-allowed and not-found behavior, shared
  middleware, capability narrowing, dependency/runtime cost, security surface,
  and endpoint-level testing.
- Preserve the architectural rule that the web layer is an adapter and the
  application remains the authority for commands, queries, transactions, and
  projections. Do not let framework conventions move business decisions into
  handlers.
- Determine whether browser and agent routes should share one mechanism while
  retaining their different capability and authorization boundaries.
- Describe an incremental migration shape that keeps behavior and tests green
  if change is justified; do not perform the refactor in this ticket.

## Expected result

Write a cited research note under the effort's `research/` directory and append
the answer here. Recommend one concrete direction, including “keep the current
approach,” and explain why it best supports this repository's AI maintainer.
Include the proposed module/registration shape, dependency choice and version
boundary if any, risks, rejected alternatives, migration scope, and the
specific evidence that would justify follow-up implementation tickets.

## Acceptance criteria

- [x] Claims about candidate libraries and Node.js behavior cite primary
  documentation, source, or specifications.
- [x] The recommendation is based on observed repository maintenance work and
  an explicit comparison, not on the initial framework suggestion.
- [x] The result identifies whether endpoint isolation requires a dependency at
  all and whether it materially reduces context and change coupling.
- [x] Existing HTTP behavior, application authority, browser/agent separation,
  and test coverage have explicit preservation requirements.
- [x] Any recommended implementation is small enough to split into fresh-context
  tickets and includes a clear no-change stopping condition.

## Answer

Keep the stable Node.js 24 `node:http` server and introduce a small,
dependency-free, project-owned typed dispatcher. Share only that mechanical
dispatcher between the browser and agent APIs; retain separate route
registrations, capability interfaces, actor derivation, prefixes, and the
agent bearer-scope check. The full evidence and primary-source comparison are
in [Web API Routing Boundary Research](../research/web-api-routing-boundary.md).
The durable framework-reconsideration boundary is
[ADR 0016](../../../docs/adr/0016-keep-the-local-http-adapter-framework-free-until-platform-needs-emerge.md).

This is justified by the present maintenance shape rather than file length
alone. `src/web/web-server.ts` is 1,027 lines, but the concrete cost is that 49
method/path branches and 26 path regexes interleave matching, parsing,
authentication, application calls, status mapping, static assets, host
integration, and streaming. A maintainer changing one endpoint must reason
about ordered fallthrough and unrelated routes, while focused adapter tests
currently require a real application and listening server. The adapter's
existing separation is worth preserving: browser and agent capabilities are
already distinct, agent identity and current-task scope come from the bearer
token, and `CoordinationApplication` remains authoritative.

Use literal and named single-segment path templates only. The dispatcher should
co-locate method, template, typed parameters, and handler; prefer static paths
over parameter paths; reject duplicates or ambiguity at startup; decode a path
parameter once; await handlers; and report internal not-found versus
method-not-allowed outcomes while initially preserving today's public response
behavior. It must not own bodies, middleware, validation, responses, static
assets, authentication, or application policy. Do not base the seam on Node's
still-experimental `URLPattern`.

The intended registration shape is:

```text
src/web/web-server.ts                 # lifecycle, prefix selection, static assets
src/web/http/dispatcher.ts            # small pure matcher/registration seam
src/web/http/request.ts               # existing body and field decoding behavior
src/web/http/response.ts              # existing response and status helpers
src/web/browser-api/routes.ts          # browser route-set composition
src/web/browser-api/*-routes.ts        # resource-focused browser handlers
src/web/agent-api/routes.ts            # authentication and scoped composition
src/web/agent-api/*-routes.ts          # discovery/current-task handlers
```

No routing dependency is warranted. `find-my-way` 9.x is the focused fallback,
but its wider grammar, automatic decoding, string-keyed parameter types, and
runtime dependencies do not remove this repository's capability, validation,
status, streaming, or test work. Fastify 5.x offers strong hooks, schema
handling, streaming support, and injection tests, but adopting its body,
error, validation, serialization, and lifecycle semantics would be a server
platform migration far larger than the route-isolation problem. Keeping the
current chains avoids migration risk but leaves the observed navigation,
precedence, focused-testing, and change-coupling costs intact.

Split any implementation into fresh-context tickets: (1) prove and unit-test
the tiny dispatcher; (2) extract existing codecs and migrate one low-risk
browser cluster; (3) migrate browser resources in bounded groups, isolating
conversation streaming and workspace integration; (4) migrate separately
authenticated agent discovery and current-task routes; and (5) remove the old
chains only after a complete route-inventory check and the full suite pass.
Preserve exact URL/query/path decoding, 64 KiB JSON limit, status and error
payloads, idempotency, current 404/405 behavior, streaming uploads and
downloads, attachment headers, static traversal protection and SPA/HEAD
behavior, application authority, and browser/agent scope separation. Add pure
matcher tests, fake-capability endpoint tests, authenticated negative tests,
and an inspectable route catalog while retaining existing web, MCP,
integration, and browser coverage.

Stop after the dispatcher proof and retain direct Node routing if the seam
cannot stay small and dependency-free, preserve raw request/response behavior,
or make a route testable through a fake narrow capability without rebuilding
the full application. Also stop splitting when a module would add navigation
without meaningful isolation. Reconsider `find-my-way` only when wildcard,
constraint, scale, or matching needs outgrow literal/named segments; reconsider
Fastify only through a new server-platform decision driven by repeated needs
for shared middleware, schema-governed validation/serialization, or framework
injection.
