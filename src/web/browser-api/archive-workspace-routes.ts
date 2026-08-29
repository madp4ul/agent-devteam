import { stat } from "node:fs/promises";

import type {
  ArchiveCompletedTasksRequest,
  ArchiveTaskRequest,
  IdempotentBrowserRequest,
  TaskWorkspaceView,
} from "../../application/browser-transport-contract.ts";
import type { HttpDispatcher } from "../http/dispatcher.ts";
import { readJsonBody, stringField } from "../http/request.ts";
import type { HttpRouteContext } from "../http/route-context.ts";
import { sendJson } from "../http/response.ts";
import { localUserActor } from "./actor.ts";
import type { BrowserCoordinationCapabilities } from "./capabilities.ts";

type ArchiveWorkspaceCapabilities = Pick<BrowserCoordinationCapabilities,
  | "queryArchivedTaskOverviews"
  | "archiveCompletedTasks"
  | "archiveTask"
  | "unarchiveTask"
  | "queryTaskInspectionForUser"
  | "queryTaskWorkspaceGitState"
>;

export interface WorkspaceOpeners {
  openWorkspace?: (taskId: string, workspace: TaskWorkspaceView) => Promise<void>;
  openWorkspaceInVisualStudioCode?: (taskId: string, workspace: TaskWorkspaceView) => Promise<void>;
}

export function registerArchiveWorkspaceRoutes(
  dispatcher: HttpDispatcher<HttpRouteContext>,
  application: ArchiveWorkspaceCapabilities,
  openers: WorkspaceOpeners,
): void {
  dispatcher.register("GET", "/api/archive", "browser/archive-workspace", ({ response }) => {
    const result = application.queryArchivedTaskOverviews();
    sendJson(response, result.available ? 200 : 409, result);
  });
  dispatcher.register("POST", "/api/archive/completed", "browser/archive-workspace", async ({ request, response }) => {
    const body = await readJsonBody<ArchiveCompletedTasksRequest>(request);
    const result = await application.archiveCompletedTasks({
      boardId: stringField(body, "boardId"),
      actor: localUserActor,
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendJson(response, result.accepted ? 200 : 409, result);
  });
  dispatcher.register("POST", "/api/tasks/:taskId/archive", "browser/archive-workspace", async ({ request, response, params }) => {
    const body = await readJsonBody<ArchiveTaskRequest>(request);
    const result = await application.archiveTask({
      taskId: params.taskId,
      ...(body.discardWorkspaceChanges === true ? { discardWorkspaceChanges: true } : {}),
      actor: localUserActor,
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : 409, result);
  });
  dispatcher.register("POST", "/api/tasks/:taskId/unarchive", "browser/archive-workspace", async ({ request, response, params }) => {
    const body = await readJsonBody<IdempotentBrowserRequest>(request);
    const result = application.unarchiveTask({
      taskId: params.taskId,
      actor: localUserActor,
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : 409, result);
  });
  dispatcher.register(
    "POST",
    "/api/tasks/:taskId/workspace/open",
    "browser/archive-workspace",
    workspaceOpenHandler(application, openers.openWorkspace, false),
  );
  dispatcher.register(
    "POST",
    "/api/tasks/:taskId/workspace/open-vscode",
    "browser/archive-workspace",
    workspaceOpenHandler(application, openers.openWorkspaceInVisualStudioCode, true),
  );
  dispatcher.register("GET", "/api/tasks/:taskId/workspace/git-state", "browser/archive-workspace", async ({ response, params }) => {
    const result = await application.queryTaskWorkspaceGitState(params.taskId);
    const status = result.available
      ? 200
      : result.reason === "not-found"
        ? 404
        : result.reason === "git-status-unavailable"
          ? 503
          : 409;
    sendJson(response, status, result);
  });
}

function workspaceOpenHandler(
  application: Pick<ArchiveWorkspaceCapabilities, "queryTaskInspectionForUser">,
  opener: ((taskId: string, workspace: TaskWorkspaceView) => Promise<void>) | undefined,
  visualStudioCode: boolean,
){
  return async ({ response, params }: HttpRouteContext & { params: { taskId: string } }) => {
    const inspection = application.queryTaskInspectionForUser(params.taskId);
    if (!inspection.available) {
      sendJson(response, inspection.reason === "not-found" ? 404 : 409, inspection);
      return;
    }
    if (inspection.task.workspace === null) {
      sendJson(response, 409, { reason: "workspace-not-provisioned" });
      return;
    }
    if (opener === undefined) {
      sendJson(response, 503, {
        reason: "host-integration-unavailable",
        diagnostic: visualStudioCode
          ? "Opening task workspaces in Visual Studio Code is unavailable on this host."
          : "Opening task workspaces is unavailable on this host.",
      });
      return;
    }
    try {
      const workspaceStatus = await stat(inspection.task.workspace.path);
      if (!workspaceStatus.isDirectory()) throw new Error("The recorded task workspace is not a directory.");
      await opener(params.taskId, inspection.task.workspace);
      sendJson(response, 200, { accepted: true });
    } catch (error) {
      sendJson(response, 409, {
        reason: "workspace-open-failed",
        diagnostic: error instanceof Error ? error.message : "The task workspace could not be opened.",
      });
    }
  };
}
