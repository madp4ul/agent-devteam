# Use a product-owned board over authoritative coordination state

Status: accepted

The first version will use a product-owned custom board rather than Kanboard,
with the coordination framework's relational state changed only through its
application-level command-and-query seam. The Kanboard spike showed that
post-commit webhooks cannot join the authoritative transaction and do not
reliably identify the acting user; retaining Kanboard would therefore sacrifice
atomic state, activity, activation, and provenance guarantees or require a
broad fork. The production application will use TypeScript so the same product
can integrate the TypeScript Codex SDK and Atlassian Pragmatic Drag and Drop.

## Considered options

- Use Kanboard as a writable board beside framework-owned coordination state.
- Reduce Kanboard to a read projection while intercepting its write paths.
- Own the board and coordination state in one product.

## Consequences

- The product must build and maintain its board and task-detail experience.
- Accessible non-drag movement remains a permanent interaction; pointer
  dragging is progressive enhancement.
- UI, future MCP, and runtime adapters must use the same deep application
  module rather than duplicate coordination rules.
- The ticket-14 Python spike is evidence for behavior and deployment
  feasibility, not the production implementation or schema.
