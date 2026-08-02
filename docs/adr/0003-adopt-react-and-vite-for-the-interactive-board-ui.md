# Adopt React and Vite for the Interactive Board UI

Status: accepted

The initial server-rendered HTML is sufficient through the minimal Codex
handoff, but the task-19 board introduces coordinated client state for task
creation, drag-and-drop, conflicts, filters, scroll restoration, timelines, and
transcript overlays. Starting with ticket 19, the product will use a TypeScript
React application built with Vite. React fits the user's existing experience,
the TypeScript ecosystem, and the interaction model without requiring a larger
framework-selection effort.

## Considered options

- Continue server-rendered HTML with isolated vanilla TypeScript enhancements.
- Build the browser application with Vue and Vite.
- Build the browser application with React and Vite.
- Adopt a full-stack React framework with its own server and rendering model.

## Consequences

- Ticket 17 keeps changes to the temporary server-rendered interface minimal;
  ticket 19 owns the browser-UI migration rather than growing both approaches.
- The existing Node host remains the self-contained localhost process. It
  serves the built browser assets and a narrow HTTP/JSON adapter; no separate
  frontend server, server-side rendering framework, or cloud runtime is added.
- React is an adapter at the existing application command-and-query seam. Board
  rules, revisions, activity, activations, and durable state remain authoritative
  behind `CoordinationApplication` and are not reimplemented in client state.
- Vite's production output must be bundled into the eventual self-contained
  host-native distribution.
- Atlassian Pragmatic Drag and Drop enhances pointer interaction, while the
  accessible non-drag movement interface remains a permanent supported path.
