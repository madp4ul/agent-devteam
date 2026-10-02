import type { HttpDispatcher } from "../http/dispatcher.ts";
import {
  childTaskCommand,
  booleanField,
  numberField,
  readJsonBody,
  relationshipCommand,
  stringField,
} from "../http/request.ts";
import { sendAgentQuery, sendJson } from "../http/response.ts";
import type { BoardMutationResult, TaskView, TaskRelationshipMutationResult, RemoveTaskRelationshipResult, EditTaskRelationshipResumeAgentResult } from "../../application/task-contract.ts";
import type { ServerResponse } from "node:http";
import type { AgentCoordinationCapabilities } from "./capabilities.ts";
import type { AgentRouteContext } from "./route-context.ts";

type CurrentTaskCapabilities = Pick<AgentCoordinationCapabilities,
  | "queryTaskInspection"
  | "queryOperatingContext"
  | "addTaskComment"
  | "setTaskCommentPin"
  | "createTask"
  | "editTask"
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
  dispatcher.register("POST", "/agent-api/tasks/:taskId/comments", "agent/current-task", async ({ request, response, scope, params }) => {
    const body = await readJsonBody(request);
    const result = application.addTaskComment({
      taskId: params.taskId === "current" ? scope.taskId : params.taskId,
      callerTaskId: scope.taskId,
      body: stringField(body, "body"),
      ...(body.pinned === undefined ? {} : { pinned: booleanField(body, "pinned") }),
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
  for (const [action, pinned] of [["pin", true], ["unpin", false]] as const) {
    dispatcher.register("POST", `/agent-api/tasks/:taskId/comments/:commentId/${action}`, "agent/current-task", async ({ request, response, scope, params }) => {
      const body = await readJsonBody(request);
      const result = application.setTaskCommentPin({ taskId: params.taskId === "current" ? scope.taskId : params.taskId,
        commentId: params.commentId, pinned, callerTaskId: scope.taskId, actor: { kind: "agent", id: scope.agentId },
        ...(scope.attemptId === undefined ? {} : { attemptId: scope.attemptId }), idempotencyKey: stringField(body, "idempotencyKey") });
      sendJson(response, result.accepted ? 200 : 409, result);
    });
  }
  dispatcher.register("POST", "/agent-api/tasks", "agent/current-task", async ({ request, response, scope }) => {
    const body = await readJsonBody(request);
    const result = application.createTask({
      boardId: stringField(body, "boardId"), columnId: stringField(body, "columnId"),
      title: stringField(body, "title"), description: stringField(body, "description"),
      idempotencyKey: stringField(body, "idempotencyKey"), callerTaskId: scope.taskId,
      actor: { kind: "agent", id: scope.agentId },
      ...(scope.attemptId === undefined ? {} : { attemptId: scope.attemptId }),
    });
    sendTaskMutation(response, result, 201);
  });
  dispatcher.register("PATCH", "/agent-api/tasks/:taskId", "agent/current-task", async ({ request, response, scope, params }) => {
    const body = await readJsonBody(request);
    const result = application.editTask({
      taskId: params.taskId === "current" ? scope.taskId : params.taskId,
      ...(body.title === undefined ? {} : { title: stringField(body, "title") }),
      ...(body.description === undefined ? {} : { description: stringField(body, "description") }),
      expectedRevision: numberField(body, "expectedRevision"),
      idempotencyKey: stringField(body, "idempotencyKey"), callerTaskId: scope.taskId,
      actor: { kind: "agent", id: scope.agentId },
      ...(scope.attemptId === undefined ? {} : { attemptId: scope.attemptId }),
    });
    sendTaskMutation(response, result);
  });
  dispatcher.register("POST", "/agent-api/tasks/:taskId/move", "agent/current-task", async ({ request, response, scope, params }) => {
    const body = await readJsonBody(request);
    const command = {
      taskId: params.taskId === "current" ? scope.taskId : params.taskId,
      callerTaskId: scope.taskId,
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
    if (!result.accepted) sendTaskMutation(response, result);
    else sendJson(response, 200, {
      accepted: true,
      revision: result.task.revision,
      transition: result.transition,
    });
  });
  dispatcher.register("POST", "/agent-api/tasks/:taskId/children", "agent/current-task", async ({ request, response, scope, params }) => {
    const body = await readJsonBody(request);
    const resumeAgent = stringField(body, "resumeAgent");
    const result = application.createChildTask({ ...childTaskCommand(
      { ...body, resumeAgentId: resumeAgent === "self" ? scope.agentId : resumeAgent },
      params.taskId === "current" ? scope.taskId : params.taskId,
      { kind: "agent", id: scope.agentId },
      scope.attemptId,
    ), callerTaskId: scope.taskId });
    sendTaskMutation(response, result, 201);
  });
  dispatcher.register("POST", "/agent-api/tasks/:taskId/child-relationships", "agent/current-task", async ({ request, response, scope, params }) => {
    const body = await readJsonBody(request);
    const resumeAgent = stringField(body, "resumeAgent");
    const childTaskId = stringField(body, "childTaskId");
    const result = application.createTaskRelationship({
      type: "parent-child", sourceTaskId: params.taskId === "current" ? scope.taskId : params.taskId,
      targetTaskId: childTaskId === "current" ? scope.taskId : childTaskId,
      resumeAgentId: resumeAgent === "self" ? scope.agentId : resumeAgent,
      actor: { kind: "agent", id: scope.agentId }, callerTaskId: scope.taskId,
      ...(scope.attemptId === undefined ? {} : { attemptId: scope.attemptId }),
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendAgentRelationshipMutation(response, result, 201);
  });
  dispatcher.register("POST", "/agent-api/tasks/:taskId/dependencies", "agent/current-task", async ({ request, response, scope, params }) => {
    const body = await readJsonBody(request);
    const resumeAgent = stringField(body, "resumeAgent");
    const targetTaskId = stringField(body, "targetTaskId");
    const result = application.createTaskRelationship({ ...relationshipCommand(
      { ...body, targetTaskId: targetTaskId === "current" ? scope.taskId : targetTaskId, resumeAgentId: resumeAgent === "self" ? scope.agentId : resumeAgent },
      "dependency",
      params.taskId === "current" ? scope.taskId : params.taskId,
      { kind: "agent", id: scope.agentId },
      scope.attemptId,
    ), callerTaskId: scope.taskId });
    sendAgentRelationshipMutation(response, result, 201);
  });
  dispatcher.register("PATCH", "/agent-api/tasks/:taskId/relationships/:relationshipId/resume-agent", "agent/current-task", async ({ request, response, scope, params }) => {
    const body = await readJsonBody(request);
    const resumeAgent = stringField(body, "resumeAgent");
    const result = application.editTaskRelationshipResumeAgent({
      taskId: params.taskId === "current" ? scope.taskId : params.taskId,
      relationshipId: params.relationshipId,
      resumeAgentId: resumeAgent === "self" ? scope.agentId : resumeAgent,
      actor: { kind: "agent", id: scope.agentId },
      callerTaskId: scope.taskId,
      ...(scope.attemptId === undefined ? {} : { attemptId: scope.attemptId }),
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendAgentRelationshipMutation(response, result);
  });
  dispatcher.register("DELETE", "/agent-api/tasks/:taskId/relationships/:relationshipId", "agent/current-task", async ({ request, response, scope, params }) => {
    const body = await readJsonBody(request);
    const taskId = params.taskId === "current" ? scope.taskId : params.taskId;
    const result = application.removeTaskRelationship({
      taskId,
      relationshipId: params.relationshipId,
      actor: { kind: "agent", id: scope.agentId },
      callerTaskId: scope.taskId,
      ...(scope.attemptId === undefined ? {} : { attemptId: scope.attemptId }),
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendAgentRelationshipMutation(response, result);
  });
  dispatcher.register("POST", "/agent-api/current-task/permission-block", "agent/current-task", async ({ request, response, scope }) => {
    const body = await readJsonBody(request);
    stringField(body, "summary");
    sendJson(response, 200, { accepted: true, taskId: scope.taskId });
  });
}

function compactTask(task: TaskView) {
  return { id: task.id, title: task.title, boardId: task.boardId, columnId: task.columnId, revision: task.revision };
}

function sendTaskMutation(response: ServerResponse, result: BoardMutationResult, status = 200): void {
  if (result.accepted) sendJson(response, status, { accepted: true, task: compactTask(result.task) });
  else if (result.reason === "revision-conflict") sendJson(response, 409, {
    accepted: false, reason: result.reason, currentTask: compactTask(result.currentTask),
  });
  else sendJson(response, result.reason === "not-found" ? 404 : 409, {
    ...result,
    ...(result.reason === "completion-is-not-starting-column" ? {
      explanation: "Tasks cannot be created in Completion; create in a workflow column and move to Completion when finished.",
    } : {}),
  });
}

function sendAgentRelationshipMutation(response: ServerResponse,
  result: TaskRelationshipMutationResult | RemoveTaskRelationshipResult | EditTaskRelationshipResumeAgentResult,
  status = 200): void {
  sendJson(response, result.accepted ? status : result.reason === "not-found" ? 404 : 409,
    result.accepted ? { accepted: true, relationship: result.relationship } : result);
}
