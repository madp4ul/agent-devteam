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
  | "removeTaskRelationship"
  | "editTaskRelationshipResumeAgent"
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
    const resumeAgent = stringField(body, "resumeAgent");
    const result = application.createChildTask(childTaskCommand(
      { ...body, resumeAgentId: resumeAgent === "self" ? scope.agentId : resumeAgent },
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
    const resumeAgent = stringField(body, "resumeAgent");
    const result = application.createTaskRelationship(relationshipCommand(
      { ...body, resumeAgentId: resumeAgent === "self" ? scope.agentId : resumeAgent },
      "dependency",
      scope.taskId,
      { kind: "agent", id: scope.agentId },
      scope.attemptId,
    ));
    if (!result.accepted) sendRelationshipMutation(response, result);
    else sendJson(response, 201, { accepted: true, relationship: result.relationship });
  });
  dispatcher.register("PATCH", "/agent-api/tasks/:taskId/relationships/:relationshipId/resume-agent", "agent/current-task", async ({ request, response, scope, params }) => {
    const body = await readJsonBody(request);
    const resumeAgent = stringField(body, "resumeAgent");
    const result = application.editTaskRelationshipResumeAgent({
      taskId: params.taskId === "current" ? scope.taskId : params.taskId,
      relationshipId: params.relationshipId,
      resumeAgentId: resumeAgent === "self" ? scope.agentId : resumeAgent,
      actor: { kind: "agent", id: scope.agentId },
      ...(scope.attemptId === undefined ? {} : { attemptId: scope.attemptId }),
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendRelationshipMutation(response, result, 200);
  });
  dispatcher.register("DELETE", "/agent-api/tasks/:taskId/relationships/:relationshipId", "agent/current-task", async ({ request, response, scope, params }) => {
    const body = await readJsonBody(request);
    const taskId = params.taskId === "current" ? scope.taskId : params.taskId;
    const selectedTask = application.queryTaskInspection(taskId);
    if (
      !selectedTask.available ||
      selectedTask.task.relationships.every((relationship) =>
        relationship.id !== params.relationshipId || relationship.sourceTaskId !== taskId)
    ) {
      sendJson(response, selectedTask.available ? 409 : 404, {
        accepted: false,
        reason: selectedTask.available ? "relationship-conflict" : "not-found",
      });
      return;
    }
    const result = application.removeTaskRelationship({
      taskId,
      relationshipId: params.relationshipId,
      actor: { kind: "agent", id: scope.agentId },
      ...(scope.attemptId === undefined ? {} : { attemptId: scope.attemptId }),
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : 409, result);
  });
  dispatcher.register("POST", "/agent-api/current-task/permission-block", "agent/current-task", async ({ request, response, scope }) => {
    const body = await readJsonBody(request);
    stringField(body, "summary");
    sendJson(response, 200, { accepted: true, taskId: scope.taskId });
  });
}
