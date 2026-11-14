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
import { userActor } from "./actor.ts";
import type { BrowserCoordinationCapabilities } from "./capabilities.ts";
import { resolveWorkspaceFileReference, type WorkspaceFileTarget } from "../workspace-file-reference.ts";

type ArchiveWorkspaceCapabilities = Pick<BrowserCoordinationCapabilities,
  | "queryArchivedTaskOverviews"
  | "archiveCompletedTasks"
  | "startArchivalOperation"
  | "queryArchivalOperations"
  | "archivalOperationsVersion"
  | "queryArchivalOperation"
  | "dismissArchivalOperation"
  | "archiveTask"
  | "unarchiveTask"
  | "queryTaskInspectionForUser"
  | "queryTaskWorkspaceGitState"
  | "queryTaskArchivalPreview"
  | "queryArchivalWorkspaceForOpen"
>;

export interface WorkspaceOpeners {
  openWorkspace?: (taskId: string, workspace: TaskWorkspaceView) => Promise<void>;
  openWorkspaceInVisualStudioCode?: (taskId: string, workspace: TaskWorkspaceView) => Promise<void>;
  openWorkspaceFile?: (
    taskId: string,
    workspace: TaskWorkspaceView,
    target: WorkspaceFileTarget,
  ) => Promise<void>;
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
  dispatcher.register("GET", "/api/archive/operations", "browser/archive-workspace", ({ request, response, url }) => {
    const version = application.archivalOperationsVersion();
    response.setHeader("cache-control", "private, no-cache");
    response.setHeader("etag", version);
    if (request.headers["if-none-match"] === version) { response.writeHead(304); response.end(); return; }
    sendJson(response, 200, application.queryArchivalOperations(url.searchParams.get("taskId") ?? undefined, url.searchParams.get("active") === "1"));
  });
  dispatcher.register("GET", "/api/archive/operations/:operationId", "browser/archive-workspace", ({ response, params }) => {
    const operation = application.queryArchivalOperation(params.operationId);
    sendJson(response, operation ? 200 : 404, operation ?? { reason: "not-found" });
  });
  dispatcher.register("POST", "/api/archive/operations/:operationId/dismiss", "browser/archive-workspace", ({ response, params }) => {
    application.dismissArchivalOperation(params.operationId);
    sendJson(response, 200, { accepted: true });
  });
  dispatcher.register("POST", "/api/archive/completed", "browser/archive-workspace", async ({ request, response }) => {
    const body = await readJsonBody<ArchiveCompletedTasksRequest>(request);
    const command = {
      boardId: stringField(body, "boardId"),
      actor: userActor,
      idempotencyKey: stringField(body, "idempotencyKey"),
    };
    if (body.background === true) {
      const result = application.startArchivalOperation({ kind: "completion", boardId: command.boardId }, command);
      sendJson(response, result.accepted ? 202 : result.reason === "not-found" ? 404 : 409, result);
      return;
    }
    const result = await application.archiveCompletedTasks(command);
    sendJson(response, result.accepted ? 200 : 409, result);
  });
  dispatcher.register("POST", "/api/tasks/:taskId/archive", "browser/archive-workspace", async ({ request, response, params }) => {
    const body = await readJsonBody<ArchiveTaskRequest>(request);
    const command = {
      taskId: params.taskId,
      ...(body.discardWorkspaceChanges === true ? { discardWorkspaceChanges: true as const } : {}),
      ...(typeof body.archivalPreviewToken === "string" ? { archivalPreviewToken: body.archivalPreviewToken } : {}),
      actor: userActor,
      idempotencyKey: stringField(body, "idempotencyKey"),
    };
    if (body.background === true) {
      const result = application.startArchivalOperation({ kind: "task", taskId: command.taskId }, command);
      sendJson(response, result.accepted ? 202 : result.reason === "not-found" ? 404 : 409, result);
      return;
    }
    const result = await application.archiveTask(command);
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : 409, result);
  });
  dispatcher.register("GET", "/api/tasks/:taskId/archive/preview", "browser/archive-workspace", async ({ response, params }) => {
    const result = await application.queryTaskArchivalPreview(params.taskId);
    sendJson(response, result.available ? 200 : 409, result);
  });
  dispatcher.register("POST", "/api/tasks/:taskId/archive/open", "browser/archive-workspace", async ({ request, response, params }) => {
    const body = await readJsonBody<{ path: string; target: string }>(request);
    const selected = await application.queryArchivalWorkspaceForOpen(params.taskId, stringField(body, "path"));
    if (!selected.available) { sendJson(response, 409, selected); return; }
    const opener = body.target === "vscode" ? openers.openWorkspaceInVisualStudioCode : openers.openWorkspace;
    if (opener === undefined) { sendJson(response, 503, { reason: "host-integration-unavailable" }); return; }
    try {
      await opener(params.taskId, selected.workspace);
      sendJson(response, 200, { accepted: true });
    } catch (error) {
      sendJson(response, 409, { reason: "workspace-open-failed", diagnostic: error instanceof Error ? error.message : "Could not open workspace" });
    }
  });
  dispatcher.register("POST", "/api/tasks/:taskId/unarchive", "browser/archive-workspace", async ({ request, response, params }) => {
    const body = await readJsonBody<IdempotentBrowserRequest>(request);
    const result = application.unarchiveTask({
      taskId: params.taskId,
      actor: userActor,
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
  dispatcher.register(
    "POST",
    "/api/tasks/:taskId/workspace/files/open",
    "browser/archive-workspace",
    async ({ request, response, params }) => {
      const inspection = application.queryTaskInspectionForUser(params.taskId);
      if (!inspection.available) {
        sendJson(response, inspection.reason === "not-found" ? 404 : 409, inspection);
        return;
      }
      if (inspection.task.workspace === null) {
        sendJson(response, 409, {
          reason: "workspace-not-provisioned",
          diagnostic: "This task no longer has an available workspace.",
        });
        return;
      }
      const body = await readJsonBody<{ reference?: unknown }>(request);
      const resolution = await resolveWorkspaceFileReference(
        inspection.task.workspace.path,
        stringField(body, "reference"),
      );
      if (!resolution.resolved) {
        const status = resolution.reason === "file-outside-workspace"
          ? 403
          : resolution.reason === "file-not-found"
            ? 404
            : resolution.reason === "workspace-unavailable"
              ? 409
              : 400;
        sendJson(response, status, resolution);
        return;
      }
      if (openers.openWorkspaceFile === undefined) {
        sendJson(response, 503, {
          reason: "host-integration-unavailable",
          diagnostic: "Opening local files is unavailable on this host.",
        });
        return;
      }
      try {
        await openers.openWorkspaceFile(params.taskId, inspection.task.workspace, resolution.target);
        sendJson(response, 200, { accepted: true });
      } catch (error) {
        sendJson(response, 409, {
          reason: "file-open-failed",
          diagnostic: error instanceof Error ? error.message : "The linked file could not be opened.",
        });
      }
    },
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
