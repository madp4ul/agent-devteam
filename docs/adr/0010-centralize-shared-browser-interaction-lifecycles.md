# Centralize shared browser interaction lifecycles

Status: accepted

Centralize browser interaction mechanics when multiple rendered experiences
share the same complete lifecycle. Modal focus entry, trapping, dismissal,
scroll locking, and restoration have one implementation. Live projections share
request-ordering and polling mechanics.

Keep feature policy with each consumer: pages decide what viewport, selection,
feedback, and navigation context to preserve, and dialogs decide their content,
accessible name, initial focus, and close action.

## Consequences

- Accessibility and concurrency fixes apply consistently to every consumer of
  the shared lifecycle.
- Feature-specific state does not leak into generic browser modules.
- Rendered browser tests exercise the shared interface through representative
  consumers instead of testing React implementation details.
