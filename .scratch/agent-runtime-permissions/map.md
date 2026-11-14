# Explicit runtime permissions

## Tickets

- [01 — Explicitly select workspace-write for every agent start and resume](issues/01-select-explicit-workspace-permissions.md): task, resolved.

## Decision

On 14 November 2026 the user requested an implementation issue for one preventive layer against accidental read-only agent execution. Select the framework's intended workspace-write profile explicitly at the runtime boundary. Do not expand this into mandatory preflight checks, monitoring, new UI, or a separate permission system.

Evidence: [T-0052 investigation and escalation proof](../agent-conversation-priority/map.md). Conversation responsiveness remains a separate research effort.

## Delivery

Ticket 01 is implemented and transferred into the main checkout, unstaged. Runtime tests, native saved-read-only regression and typecheck pass; the broader suite's independently reproduced conversation-history failure is documented in the ticket. The temporary checkout and its Git registration are removed. Active framework execution was left alone; a normal host restart loads the new selection.
