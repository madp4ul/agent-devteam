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
  | "queryTaskActivity"
  | "queryTaskAttachments"
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
  dispatcher.register("GET", "/agent-api/tasks/:taskId/activity", "agent/discovery", ({ response, params }) => {
    sendAgentQuery(response, application.queryTaskActivity(params.taskId));
  });
  dispatcher.register("GET", "/agent-api/tasks/:taskId/attachments", "agent/discovery", ({ response, params }) => {
    sendAgentQuery(response, application.queryTaskAttachments(params.taskId));
  });
  dispatcher.register("GET", "/agent-api/tasks/:taskId", "agent/discovery", ({ response, params }) => {
    sendAgentQuery(response, application.queryTaskInspection(params.taskId));
  });
  dispatcher.register("GET", "/agent-api/collaborators", "agent/discovery", ({ response }) => {
    sendAgentQuery(response, application.queryCollaborators());
  });
}
