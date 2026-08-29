import type {
  AddTaskCommentRequest,
  ContinueInterruptedTaskRequest,
  CreateChildTaskRequest,
  CreateTaskRelationshipRequest,
  CreateTaskRequest,
  EditTaskRequest,
  IdempotentBrowserRequest,
  MoveTaskRequest,
  UserTaskDetailQueryResult,
} from "../../application/browser-transport-contract.ts";
import type { HttpDispatcher } from "../http/dispatcher.ts";
import {
  childTaskCommand,
  numberField,
  readJsonBody,
  relationshipCommand,
  stringField,
} from "../http/request.ts";
import type { HttpRouteContext } from "../http/route-context.ts";
import { sendJson, sendMutation, sendRelationshipMutation } from "../http/response.ts";
import { localUserActor } from "./actor.ts";
import type { BrowserCoordinationCapabilities } from "./capabilities.ts";

type TaskCapabilities = Pick<BrowserCoordinationCapabilities,
  | "createTask"
  | "queryUserTaskDetail"
  | "interruptTask"
  | "continueInterruptedTask"
  | "editTask"
  | "moveTask"
  | "createChildTask"
  | "createTaskRelationship"
  | "removeTaskRelationship"
  | "addTaskComment"
>;

export function registerTaskRoutes(
  dispatcher: HttpDispatcher<HttpRouteContext>,
  application: TaskCapabilities,
): void {
  dispatcher.register("POST", "/api/tasks", "browser/tasks", async ({ request, response }) => {
    const body = await readJsonBody<CreateTaskRequest>(request);
    const result = application.createTask({
      boardId: stringField(body, "boardId"),
      columnId: stringField(body, "columnId"),
      title: stringField(body, "title"),
      description: stringField(body, "description"),
      idempotencyKey: stringField(body, "idempotencyKey"),
      actor: localUserActor,
    });
    sendMutation(response, result, 201);
  });
  dispatcher.register("GET", "/api/tasks/:taskId", "browser/tasks", ({ response, params }) => {
    const result: UserTaskDetailQueryResult = application.queryUserTaskDetail(params.taskId);
    sendJson(response, result.available ? 200 : result.reason === "not-found" ? 404 : 409, result);
  });
  dispatcher.register("POST", "/api/tasks/:taskId/interrupt", "browser/tasks", async ({ request, response, params }) => {
    const body = await readJsonBody<IdempotentBrowserRequest>(request);
    const result = application.interruptTask({
      taskId: params.taskId,
      actor: localUserActor,
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    if (result.accepted) {
      await result.confirmed;
      sendJson(response, 200, { accepted: true, state: "interrupted" });
    } else {
      sendJson(response, result.reason === "not-found" ? 404 : 409, result);
    }
  });
  dispatcher.register("POST", "/api/tasks/:taskId/continue", "browser/tasks", async ({ request, response, params }) => {
    const body = await readJsonBody<ContinueInterruptedTaskRequest>(request);
    const result = application.continueInterruptedTask({
      taskId: params.taskId,
      message: stringField(body, "message"),
      actor: localUserActor,
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : 409, result);
  });
  dispatcher.register("PATCH", "/api/tasks/:taskId", "browser/tasks", async ({ request, response, params }) => {
    const body = await readJsonBody<EditTaskRequest>(request);
    const result = application.editTask({
      taskId: params.taskId,
      title: stringField(body, "title"),
      description: stringField(body, "description"),
      expectedRevision: numberField(body, "expectedRevision"),
      idempotencyKey: stringField(body, "idempotencyKey"),
      actor: localUserActor,
    });
    sendMutation(response, result);
  });
  dispatcher.register("POST", "/api/tasks/:taskId/move", "browser/tasks", async ({ request, response, params }) => {
    const body = await readJsonBody<MoveTaskRequest>(request);
    const result = application.moveTask({
      taskId: params.taskId,
      destinationColumnId: stringField(body, "destinationColumnId"),
      expectedRevision: numberField(body, "expectedRevision"),
      idempotencyKey: stringField(body, "idempotencyKey"),
      actor: localUserActor,
    });
    sendMutation(response, result);
  });
  dispatcher.register("POST", "/api/tasks/:taskId/children", "browser/tasks", async ({ request, response, params }) => {
    const body = await readJsonBody<CreateChildTaskRequest>(request);
    sendMutation(response, application.createChildTask(childTaskCommand(body, params.taskId, localUserActor)), 201);
  });
  dispatcher.register("POST", "/api/tasks/:taskId/relationships", "browser/tasks", async ({ request, response, params }) => {
    const body = await readJsonBody<CreateTaskRelationshipRequest>(request);
    const relationshipType = stringField(body, "type");
    if (relationshipType !== "parent-child" && relationshipType !== "dependency") {
      throw new Error("type must be parent-child or dependency");
    }
    sendRelationshipMutation(
      response,
      application.createTaskRelationship(relationshipCommand(body, relationshipType, params.taskId, localUserActor)),
    );
  });
  dispatcher.register("DELETE", "/api/tasks/:taskId/relationships/:relationshipId", "browser/tasks", async ({ request, response, params }) => {
    const body = await readJsonBody<IdempotentBrowserRequest>(request);
    const result = application.removeTaskRelationship({
      ...params,
      idempotencyKey: stringField(body, "idempotencyKey"),
      actor: localUserActor,
    });
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : 409, result);
  });
  dispatcher.register("POST", "/api/tasks/:taskId/comments", "browser/tasks", async ({ request, response, params }) => {
    const body = await readJsonBody<AddTaskCommentRequest>(request);
    const result = application.addTaskComment({
      taskId: params.taskId,
      body: stringField(body, "body"),
      idempotencyKey: stringField(body, "idempotencyKey"),
      actor: localUserActor,
    });
    sendJson(response, result.accepted ? 201 : result.reason === "not-found" ? 404 : result.reason === "empty-comment" ? 400 : 409, result);
  });
}
