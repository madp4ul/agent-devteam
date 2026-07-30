# Board UI Foundation Research

Date: 2026-07-29

## Question

Can an existing local board product provide the human-facing board and live
board state for the first usable version, or should the framework plan to build
its own board UI?

The important requirements are:

- local, single-user operation;
- multiple configurable boards and columns;
- task titles, descriptions, comments, generated IDs, and typed relationships;
- user and agent mentions;
- drag-and-drop movement within a board;
- events for task creation, movement, comments, and relationship changes;
- room to add a manual `Reactivate` action and agent-run information;
- a programmatic interface for the framework and its agent tools; and
- active maintenance under a license suitable for reuse and modification.

## Recommendation

Use **Kanboard as the default board UI and live board-state foundation for the
first usable version**, but put it behind a framework-owned adapter and validate
the choice with a small integration spike before the product specification
depends on it.

This is a better starting assumption than building a board UI immediately.
Kanboard already covers most of the visible and programmatic board behavior:

- Its board view supports drag-and-drop and compact or horizontally scrolling
  columns ([board documentation](https://docs.kanboard.org/v1/user/boards/)).
- Tasks have numeric IDs, Markdown descriptions, comments, and recorded column
  transitions. Its built-in typed links include `blocks / is blocked by` and
  `is a child of / is a parent of`
  ([task documentation](https://docs.kanboard.org/v1/user/tasks/)).
- `@username` mentions in task descriptions and comments create notifications
  ([notification documentation](https://docs.kanboard.org/v1/user/notifications/)).
- Its JSON-RPC API can read and change tasks, comments, columns, and internal
  task links
  ([API overview](https://docs.kanboard.org/v1/api/),
  [task API](https://docs.kanboard.org/v1/api/task_procedures/),
  [comment API](https://docs.kanboard.org/v1/api/comment_procedures/),
  [task-link API](https://docs.kanboard.org/v1/api/internal_task_link_procedures/)).
- Webhooks cover task creation and movement, comment changes, and internal-link
  changes. The receiver must return within one second, so the framework should
  acknowledge the webhook and queue the agent activation rather than launch an
  agent in the request
  ([webhook documentation](https://docs.kanboard.org/v1/dev/webhooks/)).
- Plugins can add API methods, routes, task-card content, styles, event
  listeners, and template overrides
  ([plugin hooks](https://docs.kanboard.org/v1/plugins/hooks/),
  [custom routes](https://docs.kanboard.org/v1/plugins/routes/),
  [template overrides](https://docs.kanboard.org/v1/plugins/overrides/)).
- It uses a single SQLite file by default, and its requirements explicitly
  describe SQLite as appropriate for a single user or small team
  ([SQLite documentation](https://docs.kanboard.org/v1/admin/sqlite/),
  [requirements](https://docs.kanboard.org/v1/admin/requirements/)).
- It is MIT-licensed and still maintained. The official repository listed
  release 1.2.52 on 2026-04-05 when checked
  ([repository and releases](https://github.com/kanboard/kanboard),
  [license](https://github.com/kanboard/kanboard/blob/main/LICENSE)).

The framework should not expose Kanboard directly to agents. Agents should use
the framework's board tools, while an adapter maps those operations to
Kanboard. This keeps agent activation, one-active-run-per-task, dependency
reactivation, process configuration, and workspace management in the
framework. It also leaves a practical path to replace Kanboard later.

Avoid a long-lived fork. Add the manual `Reactivate` control and small visual
extensions through a plugin, and keep the coordination service separate.

## Risks to validate before committing

Kanboard is close, but it does not implement the agent coordination semantics
itself. A short spike should prove all of these:

1. A repository process definition can idempotently create and update boards,
   columns, task-link labels, and agent identities without damaging live tasks.
2. A plugin can add a task-level `Reactivate` action that calls the local
   framework and displays enough agent-run status for recovery.
3. Webhooks and APIs preserve the event data and author identity needed for
   task movement, mentions, comments, and relationship reactivation.
4. The task detail view is usable when descriptions, comments, and
   relationships are all important. If not, a focused plugin enhancement is
   small enough to maintain.
5. A Docker Compose deployment can combine the official Kanboard image with
   the coordinator while preserving access to host Git repositories, task
   workspaces, Codex authentication, and any container-based project tools
   agents need ([Docker documentation](https://docs.kanboard.org/v1/admin/docker/)).

Kanboard's existing ability to move tasks between projects does not need to be
hidden or rejected. Creating follow-up tasks remains the preferred process
handoff, while users and agents retain the ability to improvise.

Containerization is the preferred local deployment model, so Kanboard's PHP
runtime does not need to be installed directly on the host. Its official image
can run as one service beside the coordinator. The integration spike still
needs to validate volumes, paths, authentication persistence, and access to
task workspaces.

If either point 2 or 4 requires broad core-template overrides or a fork,
switch to a custom board UI. Those are signs that maintenance savings from
reuse have disappeared.

## Comparison of complete board products

| Option | Requirement fit | Customization and integration | Maintenance checked 2026-07-29 | License | Assessment |
| --- | --- | --- | --- | --- | --- |
| **Kanboard** | High. Boards, comments, mentions, typed links, task history, APIs, webhooks, and local SQLite align closely. | Strong plugin surface plus JSON-RPC and webhooks. The remaining work is agent-specific rather than basic board behavior. | Active; repository listed version 1.2.52 from 2026-04-05. | MIT | Best candidate. Validate with a spike and use through an adapter. |
| **WeKan** | Medium. Mature real-time boards and local installation, but the product is designed for collaboration and uses Meteor plus MongoDB. | MIT source is modifiable, but its API is a weaker fit. An official 2025 issue confirms that linked cards still could not be created through the API. | Very active; repository listed version 9.31 from 2026-05-27. | MIT | Viable board product, but more operational weight and more API adaptation than Kanboard. |
| **Focalboard** | Superficially high: its standalone edition offered a single-user desktop app backed by SQLite. | Full source exists, but adopting it would mean taking ownership of an abandoned application and its build stack. | Official repository says it is not maintained; latest listed release was 8.0.0 from 2024-06-13. | Source builds are AGPLv3 or commercial; official compiled builds use MIT, with limited Apache-licensed areas. | Reject because maintenance has ended and source licensing is less simple than it first appears. |
| **Plane Community Edition** | High general project-management capability and a polished UI, but it is designed as a full multi-user platform rather than a small local component. | It has extensive APIs and webhooks, but adopting or changing its UI means integrating a large TypeScript/Python system. | Active; repository listed version 1.3.1 from 2026-05-14. | AGPLv3 | Reject for the first local version: too much deployment and product surface, plus stronger license obligations. |

Sources for the alternatives:

- WeKan's official repository describes its MIT license, Meteor/MongoDB-based
  local installation, real-time UI, current releases, and minimum resource
  expectations ([WeKan repository](https://github.com/wekan/wekan)). Its
  maintainer confirmed the linked-card API gap in
  [issue 5897](https://github.com/wekan/wekan/issues/5897).
- Focalboard's official repository documents the standalone desktop/server
  editions and explicitly says the project is not maintained
  ([Focalboard repository](https://github.com/mattermost-community/focalboard)).
  Its license file distinguishes MIT-licensed official binaries from AGPLv3 or
  commercial source builds
  ([Focalboard license](https://github.com/mattermost-community/focalboard/blob/main/LICENSE.txt)).
- Plane's official repository gives its AGPLv3 license and current releases
  ([Plane repository](https://github.com/makeplane/plane)). Its architecture
  includes several frontend and backend services plus PostgreSQL, Redis/Valkey,
  RabbitMQ, and object storage
  ([self-hosted architecture](https://developers.plane.so/self-hosting/plane-architecture)).

Jira, Azure DevOps, and GitHub Projects remain useful design references, but
they are not reusable local UI foundations for this standalone product.

## Custom-UI fallback

If the Kanboard spike fails, build a product-owned board UI over the
framework's own API and state model. Do not implement drag-and-drop mechanics
from scratch.

Two maintained low-level foundations are suitable:

- **Atlassian Pragmatic drag and drop** is Apache-2.0, works with any view
  layer, and powers Jira, Trello, and Confluence. It is intentionally low
  level, so it supplies behavior rather than a finished board. Its repository
  is a daily mirror of Atlassian's internal monorepo
  ([official repository](https://github.com/atlassian/pragmatic-drag-and-drop),
  [license](https://github.com/atlassian/pragmatic-drag-and-drop/blob/main/LICENSE)).
  Atlassian explicitly requires an accessible non-drag alternative; the
  product should therefore include a Move menu as well as pointer dragging
  ([accessibility guidance](https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines/)).
- **dnd-kit** is MIT-licensed and active; its official repository listed package
  releases as recently as 2026-04-13. Its current architecture provides a
  framework-independent core, a DOM layer, and React, Vue, Svelte, and Solid
  adapters, with pointer and keyboard sensors
  ([official repository](https://github.com/clauderic/dnd-kit),
  [license](https://github.com/clauderic/dnd-kit/blob/master/LICENSE)).

Pragmatic drag and drop is the preferred fallback because it is view-layer
independent and proven in the exact Jira/Trello interaction family the user
wants. dnd-kit is a strong alternative if the selected frontend stack has a
clearer integration with it.

Neither component supplies tasks, comments, relationships, persistence,
agent-run state, or the task-detail experience. Choosing one still means
building and maintaining the whole board product surface.

## Resulting product boundary

For the first usable version:

- **Kanboard owns** the human board UI and persistent board records.
- **The framework owns** the repository process definition, agent identities
  and instructions, activation rules, run state, relationship reactivation,
  workspace lifecycle, and the agent-facing board tools.
- **An adapter and small Kanboard plugin own** translation between those two
  sides, including the manual `Reactivate` action and product-specific
  restrictions.

This boundary gets a mature board sooner without making Kanboard the
framework's public domain model.
