# Keep the local HTTP adapter framework-free until platform needs emerge

Status: accepted

Keep the host's local HTTP adapter on stable Node.js HTTP primitives and own
only the narrow routing and codec mechanics the product presently needs.
Browser and agent endpoints may share a small dispatcher, but they retain
separate registration, capability, actor, and authorization boundaries.
`CoordinationApplication` remains authoritative; route handlers only adapt
transport inputs and application results.

This is a steady-state maintenance decision, not a transition-budget decision.
The current adapter needs searchable route registration, deterministic
literal/named-segment matching, and focused endpoint tests. It does not
currently need a framework-owned middleware lifecycle, schema-governed public
API, plugin system, content negotiation, or request context. Raw Node streams
also keep conversation uploads and attachment downloads explicit. A framework
would provide real capabilities, but without those recurring needs it would
add permanent lifecycle, dependency, upgrade, and security surface while
leaving application-specific authorization and result/status mapping local.

## Reconsideration boundary

Do not repeat general framework research because the route file or route count
grew, a new endpoint was added, transition resources became available, or a
framework became fashionable or familiar. Start a fresh web-platform decision
only when the implemented system exhibits at least one of these observable
conditions:

- The HTTP API becomes a governed contract for clients outside the bundled
  browser and project-scoped agent adapter, requiring versioning, generated
  API documentation, content negotiation, or compatibility policy.
- Runtime request and response schemas are needed as an authoritative contract
  across multiple browser and agent resource groups, rather than as validation
  for one exceptional endpoint.
- The same request-lifecycle policy—such as authentication, authorization,
  structured logging, correlation, rate limiting, or error handling—must be
  composed across at least three independently maintained route groups, and
  explicit adapter functions no longer keep that policy local and testable.
- Several independently useful features require encapsulated plugins, shared
  request context, ordered hooks, or coordinated startup/shutdown behavior, so
  the project-owned adapter has begun to implement a middleware lifecycle.
- Focused endpoint tests remain materially dependent on listening sockets or a
  complete `CoordinationApplication` after the typed-dispatcher work, and that
  setup measurably obstructs routine testing or failure diagnosis across
  multiple route groups.
- The owned routing seam must grow beyond literal and named single-segment
  paths into wildcards, host or protocol constraints, complex precedence, or
  other matching behavior whose correctness and maintenance exceed a small
  transparent module. This condition first justifies reconsidering a focused
  router; it does not by itself justify a full framework.

Meeting a trigger authorizes comparison; it does not predetermine adoption or
Fastify as the winner. Evaluate the current supported framework/router versions
and primary documentation at that time rather than inheriting the versions
considered in the original research.

## Evidence required before framework adoption

Before replacing Node HTTP, build a bounded repository-shaped proof containing
at least one ordinary browser query and mutation, one bearer-authenticated
scope-derived agent mutation, malformed input and async error mapping, the
streaming upload and attachment download paths, static-asset/SPA behavior, and
focused no-listener endpoint tests. Compare it with the project-owned adapter
under the same transport contracts.

Adopt a framework only if that proof shows all of the following:

- framework schemas, hooks, encapsulation, or injection replace meaningful
  project-owned mechanics instead of wrapping them;
- route discovery, capability narrowing, endpoint test setup, and failure
  diagnosis become materially clearer for the long-term AI maintainer;
- browser and agent authorization boundaries remain explicit, and immutable
  agent task/actor scope cannot be supplied by request input;
- application decisions, transactions, and projection assembly remain outside
  handlers and hooks;
- raw streaming, static assets, body limits, decoding, status/error payloads,
  and security headers remain compatible or change only through separately
  approved behavior decisions; and
- the permanent dependency, lifecycle, upgrade, and security surface is
  proportionate to recurring features the repository will actually use.

If the proof still requires project-owned routing semantics, body and error
wrappers, authorization composition, streaming exceptions, and a separate test
harness around the framework, retain the project-owned adapter. Framework
adoption is convincing only when it simplifies the maintained steady state,
not merely when migration can be completed safely.

## Consequences

- The current routing refactor may introduce a dependency-free typed
  dispatcher, but must stop before it becomes a private framework.
- Focused router and full-framework decisions have different triggers and must
  not be conflated.
- Future maintainers can inspect the trigger list before commissioning new
  comparative research.
- A trigger being met should be recorded with repository evidence in the new
  decision so the reason for reconsideration is reviewable.
