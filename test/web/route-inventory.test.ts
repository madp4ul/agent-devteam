import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentCoordinationCapabilities } from "../../src/web/agent-api/capabilities.ts";
import { createAgentApiRoutes } from "../../src/web/agent-api/routes.ts";
import type { BrowserCoordinationCapabilities } from "../../src/web/browser-api/capabilities.ts";
import { createBrowserApiRoutes } from "../../src/web/browser-api/routes.ts";

test("browser route catalog accounts for the complete pre-dispatcher API inventory", () => {
  const routes = createBrowserApiRoutes({} as BrowserCoordinationCapabilities, {}).catalog();

  assert.deepEqual(routeKeys(routes), [
    "DELETE /api/tasks/:taskId/conversations/:conversationId/uploads/:uploadId",
    "DELETE /api/tasks/:taskId/relationships/:relationshipId",
    "GET /api/archive",
    "GET /api/attempts/:attemptId/transcript",
    "GET /api/board",
    "GET /api/notification-occurrences",
    "GET /api/settings/cost-statistics",
    "GET /api/settings/notifications",
    "GET /api/tasks/:taskId",
    "GET /api/tasks/:taskId/conversations/:conversationId",
    "GET /api/tasks/:taskId/conversations/:conversationId/attachments/:attachmentId",
    "GET /api/tasks/:taskId/workspace/git-state",
    "PATCH /api/settings/notifications",
    "PATCH /api/tasks/:taskId",
    "POST /api/activations/:activationId/dismiss",
    "POST /api/activations/:activationId/dismiss-stale",
    "POST /api/archive/completed",
    "POST /api/attention/:attentionReasonId/continue",
    "POST /api/attention/:attentionReasonId/dismiss",
    "POST /api/attention/:attentionReasonId/mark-addressed",
    "POST /api/attention/:attentionReasonId/retry",
    "POST /api/automation/pause",
    "POST /api/automation/resume",
    "POST /api/automation/resume-with-current-process",
    "POST /api/tasks",
    "POST /api/tasks/:taskId/archive",
    "POST /api/tasks/:taskId/children",
    "POST /api/tasks/:taskId/comments",
    "POST /api/tasks/:taskId/continue",
    "POST /api/tasks/:taskId/conversations/:conversationId",
    "POST /api/tasks/:taskId/conversations/:conversationId/retire",
    "POST /api/tasks/:taskId/conversations/:conversationId/uploads",
    "POST /api/tasks/:taskId/interrupt",
    "POST /api/tasks/:taskId/move",
    "POST /api/tasks/:taskId/relationships",
    "POST /api/tasks/:taskId/unarchive",
    "POST /api/tasks/:taskId/workspace/open",
    "POST /api/tasks/:taskId/workspace/open-vscode",
  ]);
  assert.ok(routes.every((route) => route.owner.startsWith("browser/") && route.template.startsWith("/api/")));
});

test("agent route catalog is separate and accounts for discovery and current-task APIs", () => {
  const routes = createAgentApiRoutes({} as AgentCoordinationCapabilities, undefined).catalog();

  assert.deepEqual(routeKeys(routes), [
    "GET /agent-api/boards/summary",
    "GET /agent-api/collaborators",
    "GET /agent-api/current-task",
    "GET /agent-api/operating-context",
    "GET /agent-api/tasks/:taskId",
    "GET /agent-api/tasks/:taskId/activity",
    "GET /agent-api/tasks/:taskId/attachments",
    "GET /agent-api/tasks/archive",
    "POST /agent-api/current-task/children",
    "POST /agent-api/current-task/comments",
    "POST /agent-api/current-task/dependencies",
    "POST /agent-api/current-task/move",
    "POST /agent-api/current-task/permission-block",
    "POST /agent-api/tasks/query",
  ]);
  assert.ok(routes.every((route) => route.owner.startsWith("agent/") && route.template.startsWith("/agent-api/")));
});

function routeKeys(routes: ReadonlyArray<{ method: string; template: string }>): string[] {
  return routes.map((route) => `${route.method} ${route.template}`).sort();
}
