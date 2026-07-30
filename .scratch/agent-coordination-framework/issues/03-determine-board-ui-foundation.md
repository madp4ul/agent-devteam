# Determine the Board UI Foundation

Type: wayfinder:research
Status: resolved
Blocked by:
Parent: ../map.md

## Question

Can an existing board implementation or reusable UI component meet the local,
single-user board requirements, or should the product plan assume a custom
board interface inspired by Jira, Azure DevOps, and GitHub?

## Answer

[The board UI foundation research](../research/board-ui-foundation.md)
recommends using Kanboard as the default human-facing board and live
board-state foundation for the first usable version. It already supplies most
required board behavior under an active MIT-licensed project. Keep it behind a
framework-owned adapter, add only narrow product behavior through a plugin, and
validate the remaining fit with a short integration spike. If that spike
requires a broad fork, fall back to a custom UI using a maintained
drag-and-drop component rather than implementing drag-and-drop from scratch.
