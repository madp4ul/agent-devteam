import type { HttpDispatcher } from "../http/dispatcher.ts";
import { numberField, readJsonBody, stringArrayField, stringField } from "../http/request.ts";
import { sendAgentQuery } from "../http/response.ts";
import type { AgentCoordinationCapabilities } from "./capabilities.ts";
import type { AgentRouteContext } from "./route-context.ts";

type DiscoveryCapabilities = Pick<AgentCoordinationCapabilities,
  | "queryBoardSummaries"
  | "queryTaskOverviews"
  | "queryArchivedTaskOverviews"
  | "queryTaskInspection"
  | "queryTaskParticipants"
  | "queryTaskActivity"
  | "queryTaskAttachments"
  | "queryTaskHistory"
  | "queryCollaborators"
>;

export function registerDiscoveryRoutes(
  dispatcher: HttpDispatcher<AgentRouteContext>,
  application: DiscoveryCapabilities,
): void {
  dispatcher.register("GET", "/agent-api/boards/summary", "agent/discovery", ({ response }) => {
    sendAgentQuery(response, application.queryBoardSummaries());
  });
  dispatcher.register("POST", "/agent-api/tasks/query", "agent/discovery", async ({ request, response }) => {
    const body = await readJsonBody(request);
    sendAgentQuery(response, application.queryTaskOverviews({
      boardId: stringField(body, "boardId"),
      columnIds: stringArrayField(body, "columnIds"),
      ...(body.pageSize === undefined ? {} : { pageSize: numberField(body, "pageSize") }),
      ...(body.cursor === undefined ? {} : { cursor: stringField(body, "cursor") }),
    }));
  });
  dispatcher.register("GET", "/agent-api/tasks/archive", "agent/discovery", ({ response }) => {
    sendAgentQuery(response, application.queryArchivedTaskOverviews());
  });
  dispatcher.register("POST", "/agent-api/tasks/archive/query", "agent/discovery", async ({ request, response }) => {
    const body = await readJsonBody(request);
    sendAgentQuery(response, application.queryArchivedTaskOverviews({
      ...(body.pageSize === undefined ? {} : { pageSize: numberField(body, "pageSize") }),
      ...(body.cursor === undefined ? {} : { cursor: stringField(body, "cursor") }) }));
  });
  dispatcher.register("GET", "/agent-api/tasks/:taskId/activity", "agent/discovery", ({ response, params }) => {
    sendAgentQuery(response, application.queryTaskActivity(params.taskId));
  });
  dispatcher.register("GET", "/agent-api/tasks/:taskId/attachments", "agent/discovery", ({ response, params }) => {
    sendAgentQuery(response, application.queryTaskAttachments(params.taskId));
  });
  dispatcher.register("POST", "/agent-api/tasks/:taskId/attachments/query", "agent/discovery", async ({ request, response, params, scope }) => {
    const body = await readJsonBody(request);
    sendAgentQuery(response, application.queryTaskAttachments(params.taskId === "current" ? scope.taskId : params.taskId, {
      ...(body.pageSize === undefined ? {} : { pageSize: numberField(body, "pageSize") }),
      ...(body.cursor === undefined ? {} : { cursor: stringField(body, "cursor") }) }));
  });
  dispatcher.register("GET", "/agent-api/tasks/:taskId/participants", "agent/discovery", ({ response, params, scope }) => {
    sendAgentQuery(response, application.queryTaskParticipants(params.taskId === "current" ? scope.taskId : params.taskId));
  });
  dispatcher.register("POST", "/agent-api/tasks/:taskId/history", "agent/discovery", async ({ request, response, params, scope }) => {
    const body = await readJsonBody(request);
    sendAgentQuery(response, application.queryTaskHistory({ taskId: params.taskId === "current" ? scope.taskId : params.taskId,
      ...(body.targetWords === undefined ? {} : { targetWords: numberField(body, "targetWords") }),
      ...(body.cursor === undefined ? {} : { cursor: stringField(body, "cursor") }) }));
  });
  dispatcher.register("POST", "/agent-api/tasks/:taskId/inspect", "agent/discovery", async ({ request, response, params, scope }) => {
    const body = await readJsonBody(request);
    sendAgentQuery(response, application.queryTaskInspection(params.taskId === "current" ? scope.taskId : params.taskId,
      body.targetWords === undefined ? undefined : numberField(body, "targetWords")));
  });
  dispatcher.register("GET", "/agent-api/tasks/:taskId", "agent/discovery", ({ response, params, scope }) => {
    sendAgentQuery(response, application.queryTaskInspection(params.taskId === "current" ? scope.taskId : params.taskId));
  });
  dispatcher.register("GET", "/agent-api/collaborators", "agent/discovery", ({ response }) => {
    sendAgentQuery(response, application.queryCollaborators());
  });
}
