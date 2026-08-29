import type { HttpDispatcher } from "../http/dispatcher.ts";
import {
  childTaskCommand,
  numberField,
  readJsonBody,
  relationshipCommand,
  stringField,
} from "../http/request.ts";
import { sendAgentQuery, sendJson, sendRelationshipMutation } from "../http/response.ts";
import type { AgentCoordinationCapabilities } from "./capabilities.ts";
import type { AgentRouteContext } from "./route-context.ts";

type CurrentTaskCapabilities = Pick<AgentCoordinationCapabilities,
  | "queryTaskInspection"
  | "queryOperatingContext"
  | "addTaskComment"
  | "resolveInertTaskMove"
  | "moveTask"
  | "createChildTask"
  | "createTaskRelationship"
>;

export function registerCurrentTaskRoutes(
  dispatcher: HttpDispatcher<AgentRouteContext>,
  application: CurrentTaskCapabilities,
): void {
  dispatcher.register("GET", "/agent-api/current-task", "agent/current-task", ({ response, scope }) => {
    const result = application.queryTaskInspection(scope.taskId);
    if (!result.available) sendAgentQuery(response, result);
    else sendJson(response, 200, result.task);
  });
  dispatcher.register("GET", "/agent-api/operating-context", "agent/current-task", ({ response, scope }) => {
    const result = application.queryOperatingContext(scope);
    if (!result.available) sendJson(response, 403, result);
    else sendJson(response, 200, result.context);
  });
  dispatcher.register("POST", "/agent-api/current-task/comments", "agent/current-task", async ({ request, response, scope }) => {
    const body = await readJsonBody(request);
    const result = application.addTaskComment({
      taskId: scope.taskId,
      body: stringField(body, "body"),
      idempotencyKey: stringField(body, "idempotencyKey"),
      actor: { kind: "agent", id: scope.agentId },
      ...(scope.attemptId === undefined ? {} : { attemptId: scope.attemptId }),
    });
    if (!result.accepted) sendJson(response, 409, result);
    else sendJson(response, 200, {
      accepted: true,
      taskId: result.task.id,
      revision: result.task.revision,
      commentId: result.comment.id,
    });
  });
  dispatcher.register("POST", "/agent-api/current-task/move", "agent/current-task", async ({ request, response, scope }) => {
    const body = await readJsonBody(request);
    const command = {
      taskId: scope.taskId,
      destinationColumnId: stringField(body, "destinationColumnId"),
      expectedRevision: numberField(body, "expectedRevision"),
      idempotencyKey: stringField(body, "idempotencyKey"),
      actor: { kind: "agent" as const, id: scope.agentId },
      ...(scope.attemptId === undefined ? {} : { attemptId: scope.attemptId }),
    };
    const inert = application.resolveInertTaskMove(command);
    if (inert?.accepted && "outcome" in inert) {
      sendJson(response, 200, {
        accepted: true,
        outcome: inert.outcome,
        revision: inert.task.revision,
        transition: inert.transition,
      });
      return;
    }
    const result = inert ?? application.moveTask(command);
    if (!result.accepted) sendJson(response, 409, result);
    else sendJson(response, 200, {
      accepted: true,
      revision: result.task.revision,
      transition: result.transition,
    });
  });
  dispatcher.register("POST", "/agent-api/current-task/children", "agent/current-task", async ({ request, response, scope }) => {
    const body = await readJsonBody(request);
    const result = application.createChildTask(childTaskCommand(
      body,
      scope.taskId,
      { kind: "agent", id: scope.agentId },
      scope.attemptId,
    ));
    if (!result.accepted) sendJson(response, result.reason === "not-found" ? 404 : 409, result);
    else sendJson(response, 201, {
      accepted: true,
      task: {
        id: result.task.id,
        boardId: result.task.boardId,
        columnId: result.task.columnId,
        revision: result.task.revision,
      },
    });
  });
  dispatcher.register("POST", "/agent-api/current-task/dependencies", "agent/current-task", async ({ request, response, scope }) => {
    const body = await readJsonBody(request);
    const result = application.createTaskRelationship(relationshipCommand(
      body,
      "dependency",
      scope.taskId,
      { kind: "agent", id: scope.agentId },
      scope.attemptId,
    ));
    if (!result.accepted) sendRelationshipMutation(response, result);
    else sendJson(response, 201, { accepted: true, relationship: result.relationship });
  });
  dispatcher.register("POST", "/agent-api/current-task/permission-block", "agent/current-task", async ({ request, response, scope }) => {
    const body = await readJsonBody(request);
    stringField(body, "summary");
    sendJson(response, 200, { accepted: true, taskId: scope.taskId });
  });
}
