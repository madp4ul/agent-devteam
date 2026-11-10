# 01 — Project shared-resource catalog

**What to build:** Users and agents create, inspect, edit and archive project-local
resources; users navigate a quiet overview row and a small resource detail page.
**Blocked by:** None — can start immediately.
**Status:** done
**Spec:** [Shared resources](../spec.md)

- [x] Durable sequential R IDs, title/description, archive state, migration and restart coverage.
- [x] Application-authoritative queries and commands, browser and scoped MCP APIs.
- [x] Supporting overview cards and detail create/edit/archive flows; no user claim/release controls.
- [x] Resource detail supports later owner/queue display; archived records inspectable, excluded by default.
- [x] Application/API/browser behavior tests, dark/light appearance and any required icon geometry.
- [x] Typechecks and relevant tests pass; document public API.

Implementation validation: application catalog/restart/retry tests, authenticated HTTP and real stdio MCP integration, released migration suite, typechecks, build, and dark/light browser catalog flows. Full-suite and final Standards/Spec review run at parent delivery boundary.
