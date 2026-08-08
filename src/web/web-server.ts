import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CoordinationApplication,
  type Actor,
  type ActivationRecoveryAction,
  type ActivationRecoveryCommand,
  type CreateChildTaskCommand,
  type CreateTaskRelationshipCommand,
  type TaskWorkspaceView,
  type TaskOverviewView,
} from "../application/coordination-application.ts";
import type { AgentToolScopeRegistry } from "../mcp/agent-tool-scope.ts";

export interface WebServerOptions {
  host: string;
  port: number;
  agentToolScopes?: AgentToolScopeRegistry;
  assetDirectory?: string;
  openWorkspace?: (taskId: string, workspace: TaskWorkspaceView) => Promise<void>;
}

export interface RunningWebServer {
  baseUrl: string;
  close(): Promise<void>;
}

export async function startWebServer(
  application: CoordinationApplication,
  options: WebServerOptions,
): Promise<RunningWebServer> {
  const server = createServer((request, response) => {
    void handleRequest(application, options, request, response).catch((error: unknown) => {
      const diagnostic = error instanceof Error ? error.message : "Unexpected server error";
      if ((request.url ?? "").startsWith("/api/") || (request.url ?? "").startsWith("/agent-api/")) {
        sendJson(response, 400, { error: "invalid-request", diagnostic });
      } else {
        sendText(response, 500, diagnostic);
      }
    });
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, resolveListen);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://${options.host}:${address.port}`,
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error === undefined ? resolveClose() : reject(error)));
      }),
  };
}

async function handleRequest(
  application: CoordinationApplication,
  options: WebServerOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://local.invalid");
  if (url.pathname.startsWith("/agent-api/")) {
    await handleAgentApi(application, options.agentToolScopes, request, response, method, url);
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    await handleBrowserApi(application, options, request, response, method, url);
    return;
  }
  if (method !== "GET" && method !== "HEAD") {
    sendJson(response, 405, { error: "method-not-allowed" });
    return;
  }
  await serveBrowserAsset(options.assetDirectory ?? defaultAssetDirectory(), url.pathname, response, method);
}

async function handleBrowserApi(
  application: CoordinationApplication,
  options: WebServerOptions,
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  url: URL,
): Promise<void> {
  if (method === "GET" && url.pathname === "/api/board") {
    const startup = application.queryStartup();
    const automation = application.queryAutomation();
    if (startup.mode === "configuration-error") {
      sendJson(response, 409, { startup, automation, activeRuns: [], boards: [], attention: [] });
      return;
    }
    const summaries = application.queryBoardSummaries();
    if (!summaries.available) {
      sendJson(response, 409, { startup, automation, activeRuns: [], boards: [], attention: [] });
      return;
    }
    const boards = summaries.boards.map((board) => ({
      ...board,
      columns: board.columns.map((column) => ({
        ...column,
        tasks: readAllColumnTaskOverviews(application, board.id, column.id),
      })),
    }));
    const attention = application.queryNeedsAttention();
    sendJson(response, 200, {
      startup,
      automation,
      activeRuns: application.queryActiveRuns(),
      boards,
      attention: attention.available ? attention.tasks : [],
    });
    return;
  }
  if (method === "POST" && url.pathname === "/api/automation/resume") {
    const result = await application.resumeAutomation();
    sendJson(response, result.accepted ? 200 : 409, result);
    return;
  }
  if (method === "POST" && url.pathname === "/api/automation/resume-with-current-process") {
    const result = await application.resumeWithCurrentProcess();
    sendJson(response, result.accepted ? 200 : 409, result);
    return;
  }
  if (method === "POST" && url.pathname === "/api/automation/pause") {
    sendJson(response, 200, application.pauseAutomation());
    return;
  }
  if (method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJsonBody(request);
    const result = application.createTask({
      boardId: stringField(body, "boardId"),
      columnId: stringField(body, "columnId"),
      title: stringField(body, "title"),
      description: stringField(body, "description"),
      idempotencyKey: stringField(body, "idempotencyKey"),
      actor: { kind: "user", id: "local-user" },
    });
    sendMutation(response, result, 201);
    return;
  }
  const transcriptMatch = /^\/api\/attempts\/([^/]+)\/transcript$/.exec(url.pathname);
  const dismissStaleMatch = /^\/api\/activations\/([^/]+)\/dismiss-stale$/.exec(url.pathname);
  if (method === "POST" && dismissStaleMatch?.[1] !== undefined) {
    const body = await readJsonBody(request);
    const result = application.dismissStaleActivation({
      activationId: decodeURIComponent(dismissStaleMatch[1]),
      actor: { kind: "user", id: "local-user" },
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : 409, result);
    return;
  }
  if (method === "GET" && transcriptMatch?.[1] !== undefined) {
    const result = await application.queryAttemptTranscript(decodeURIComponent(transcriptMatch[1]));
    const status = result.available
      ? 200
      : result.reason === "not-found"
        ? 404
        : result.reason === "configuration-error"
          ? 409
          : 503;
    sendJson(response, status, result);
    return;
  }
  const taskMatch = /^\/api\/tasks\/([^/]+)$/.exec(url.pathname);
  const openWorkspaceMatch = /^\/api\/tasks\/([^/]+)\/workspace\/open$/.exec(url.pathname);
  if (method === "POST" && openWorkspaceMatch?.[1] !== undefined) {
    const taskId = decodeURIComponent(openWorkspaceMatch[1]);
    const inspection = application.queryTaskInspectionForUser(taskId);
    if (!inspection.available) {
      sendJson(response, inspection.reason === "not-found" ? 404 : 409, inspection);
      return;
    }
    if (inspection.task.workspace === null) {
      sendJson(response, 409, { reason: "workspace-not-provisioned" });
      return;
    }
    if (options.openWorkspace === undefined) {
      sendJson(response, 503, {
        reason: "host-integration-unavailable",
        diagnostic: "Opening task workspaces is unavailable on this host.",
      });
      return;
    }
    try {
      const workspaceStatus = await stat(inspection.task.workspace.path);
      if (!workspaceStatus.isDirectory()) {
        throw new Error("The recorded task workspace is not a directory.");
      }
      await options.openWorkspace(taskId, inspection.task.workspace);
      sendJson(response, 200, { accepted: true });
    } catch (error) {
      sendJson(response, 409, {
        reason: "workspace-open-failed",
        diagnostic: error instanceof Error ? error.message : "The task workspace could not be opened.",
      });
    }
    return;
  }
  if (method === "GET" && taskMatch?.[1] !== undefined) {
    const taskId = decodeURIComponent(taskMatch[1]);
    const result = application.queryTask(taskId);
    const inspection = application.queryTaskInspectionForUser(taskId);
    if (result.available && inspection.available) {
      sendJson(response, 200, {
        ...result,
        inspection: inspection.task,
        activeRun: application.queryActiveRuns().find((run) => run.taskId === taskId) ?? null,
      });
    } else {
      const reason = !result.available ? result.reason : "not-found";
      sendJson(response, reason === "not-found" ? 404 : 409, !result.available ? result : inspection);
    }
    return;
  }
  const interruptMatch = /^\/api\/tasks\/([^/]+)\/interrupt$/.exec(url.pathname);
  if (method === "POST" && interruptMatch?.[1] !== undefined) {
    const body = await readJsonBody(request);
    const result = application.interruptTask({
      taskId: decodeURIComponent(interruptMatch[1]),
      actor: { kind: "user", id: "local-user" },
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    if (result.accepted) {
      await result.confirmed;
      sendJson(response, 200, { accepted: true, state: "interrupted" });
    } else {
      sendJson(response, result.reason === "not-found" ? 404 : 409, result);
    }
    return;
  }
  const continueInterruptedMatch = /^\/api\/tasks\/([^/]+)\/continue$/.exec(url.pathname);
  if (method === "POST" && continueInterruptedMatch?.[1] !== undefined) {
    const body = await readJsonBody(request);
    const result = application.continueInterruptedTask({
      taskId: decodeURIComponent(continueInterruptedMatch[1]),
      message: stringField(body, "message"),
      actor: { kind: "user", id: "local-user" },
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : 409, result);
    return;
  }
  if (method === "PATCH" && taskMatch?.[1] !== undefined) {
    const body = await readJsonBody(request);
    const result = application.editTask({
      taskId: decodeURIComponent(taskMatch[1]),
      title: stringField(body, "title"),
      description: stringField(body, "description"),
      expectedRevision: numberField(body, "expectedRevision"),
      idempotencyKey: stringField(body, "idempotencyKey"),
      actor: { kind: "user", id: "local-user" },
    });
    sendMutation(response, result);
    return;
  }
  const moveMatch = /^\/api\/tasks\/([^/]+)\/move$/.exec(url.pathname);
  if (method === "POST" && moveMatch?.[1] !== undefined) {
    const body = await readJsonBody(request);
    const result = application.moveTask({
      taskId: decodeURIComponent(moveMatch[1]),
      destinationColumnId: stringField(body, "destinationColumnId"),
      expectedRevision: numberField(body, "expectedRevision"),
      idempotencyKey: stringField(body, "idempotencyKey"),
      actor: { kind: "user", id: "local-user" },
    });
    sendMutation(response, result);
    return;
  }
  const childrenMatch = /^\/api\/tasks\/([^/]+)\/children$/.exec(url.pathname);
  if (method === "POST" && childrenMatch?.[1] !== undefined) {
    const body = await readJsonBody(request);
    const result = application.createChildTask(childTaskCommand(
      body,
      decodeURIComponent(childrenMatch[1]),
      { kind: "user", id: "local-user" },
    ));
    sendMutation(response, result, 201);
    return;
  }
  const relationshipsMatch = /^\/api\/tasks\/([^/]+)\/relationships$/.exec(url.pathname);
  if (method === "POST" && relationshipsMatch?.[1] !== undefined) {
    const body = await readJsonBody(request);
    const relationshipType = stringField(body, "type");
    if (relationshipType !== "parent-child" && relationshipType !== "dependency") {
      throw new Error("type must be parent-child or dependency");
    }
    const result = application.createTaskRelationship(relationshipCommand(
      body,
      relationshipType,
      decodeURIComponent(relationshipsMatch[1]),
      { kind: "user", id: "local-user" },
    ));
    sendRelationshipMutation(response, result);
    return;
  }
  const commentsMatch = /^\/api\/tasks\/([^/]+)\/comments$/.exec(url.pathname);
  if (method === "POST" && commentsMatch?.[1] !== undefined) {
    const body = await readJsonBody(request);
    const result = application.addTaskComment({
      taskId: decodeURIComponent(commentsMatch[1]),
      body: stringField(body, "body"),
      idempotencyKey: stringField(body, "idempotencyKey"),
      actor: { kind: "user", id: "local-user" },
    });
    const status = result.accepted
      ? 201
      : result.reason === "not-found"
        ? 404
        : result.reason === "empty-comment"
          ? 400
          : 409;
    sendJson(response, status, result);
    return;
  }
  const markAddressedMatch = /^\/api\/attention\/([^/]+)\/mark-addressed$/.exec(url.pathname);
  if (method === "POST" && markAddressedMatch?.[1] !== undefined) {
    const body = await readJsonBody(request);
    const result = application.markUserMentionAddressed({
      attentionReasonId: decodeURIComponent(markAddressedMatch[1]),
      actor: { kind: "user", id: "local-user" },
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    const status = result.accepted
      ? 200
      : result.reason === "not-found"
        ? 404
        : 409;
    sendJson(response, status, result);
    return;
  }
  const recoveryMatch = /^\/api\/attention\/([^/]+)\/(retry|dismiss|continue)$/.exec(url.pathname);
  if (method === "POST" && recoveryMatch?.[1] !== undefined && recoveryMatch[2] !== undefined) {
    const body = await readJsonBody(request);
    const command = {
      attentionReasonId: decodeURIComponent(recoveryMatch[1]),
      actor: { kind: "user" as const, id: "local-user" },
      idempotencyKey: stringField(body, "idempotencyKey"),
    };
    const result = recoverActivation(
      application,
      recoveryMatch[2] as ActivationRecoveryAction,
      command,
    );
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : 409, result);
    return;
  }
  sendJson(response, 404, { error: "unknown-browser-api" });
}

function recoverActivation(
  application: CoordinationApplication,
  action: ActivationRecoveryAction,
  command: ActivationRecoveryCommand,
): ReturnType<CoordinationApplication["retryFailedActivation"]> {
  const handlers = {
    retry: () => application.retryFailedActivation(command),
    dismiss: () => application.dismissFailedActivation(command),
    continue: () => application.continuePermissionBlockedActivation(command),
  } satisfies Record<ActivationRecoveryAction, () => ReturnType<CoordinationApplication["retryFailedActivation"]>>;
  return handlers[action]();
}

function readAllColumnTaskOverviews(
  application: CoordinationApplication,
  boardId: string,
  columnId: string,
): TaskOverviewView[] {
  const tasks = [];
  let cursor: string | undefined;
  do {
    const page = application.queryTaskOverviews({
      boardId,
      columnIds: [columnId],
      pageSize: 50,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!page.available) throw new Error(`Could not project column ${columnId}`);
    tasks.push(...page.tasks);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return tasks;
}

function sendMutation(
  response: ServerResponse,
  result: ReturnType<CoordinationApplication["createTask"]>,
  acceptedStatus = 200,
): void {
  if (result.accepted) {
    sendJson(response, acceptedStatus, result);
    return;
  }
  const status =
    result.reason === "empty-title" ||
    result.reason === "empty-description" ||
    result.reason === "invalid-starting-ref" ||
    result.reason === "invalid-destination"
      ? 400
      : result.reason === "not-found"
        ? 404
        : 409;
  sendJson(response, status, result);
}

async function serveBrowserAsset(
  assetDirectory: string,
  pathname: string,
  response: ServerResponse,
  method: string,
): Promise<void> {
  const requested = pathname.startsWith("/assets/")
    ? resolve(assetDirectory, `.${pathname}`)
    : resolve(assetDirectory, "index.html");
  const fromRoot = relative(resolve(assetDirectory), requested);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    sendText(response, 404, "Not found");
    return;
  }
  try {
    const body = await readFile(requested);
    response.writeHead(200, {
      "content-type": contentType(requested),
      "content-length": body.byteLength,
      ...(pathname.startsWith("/assets/")
        ? { "cache-control": "public, max-age=31536000, immutable" }
        : { "cache-control": "no-cache" }),
    });
    response.end(method === "HEAD" ? undefined : body);
  } catch {
    sendText(response, 404, "Browser application assets are unavailable. Run the production build.");
  }
}

function defaultAssetDirectory(): string {
  return fileURLToPath(new URL("../../dist/web/", import.meta.url));
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

async function handleAgentApi(
  application: CoordinationApplication,
  scopes: AgentToolScopeRegistry | undefined,
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  url: URL,
): Promise<void> {
  const authorization = request.headers.authorization ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const scope = scopes?.resolve(token);
  if (scope === undefined) {
    sendJson(response, 401, { error: "invalid-agent-tool-scope" });
    return;
  }
  if (method === "GET" && url.pathname === "/agent-api/boards/summary") {
    sendAgentQuery(response, application.queryBoardSummaries());
    return;
  }
  if (method === "POST" && url.pathname === "/agent-api/tasks/query") {
    const body = await readJsonBody(request);
    sendAgentQuery(response, application.queryTaskOverviews({
      boardId: stringField(body, "boardId"),
      columnIds: stringArrayField(body, "columnIds"),
      ...(body.pageSize === undefined ? {} : { pageSize: numberField(body, "pageSize") }),
      ...(body.cursor === undefined ? {} : { cursor: stringField(body, "cursor") }),
    }));
    return;
  }
  const activityMatch = /^\/agent-api\/tasks\/([^/]+)\/activity$/.exec(url.pathname);
  if (method === "GET" && activityMatch?.[1] !== undefined) {
    sendAgentQuery(response, application.queryTaskActivity(decodeURIComponent(activityMatch[1])));
    return;
  }
  const attachmentsMatch = /^\/agent-api\/tasks\/([^/]+)\/attachments$/.exec(url.pathname);
  if (method === "GET" && attachmentsMatch?.[1] !== undefined) {
    sendAgentQuery(response, application.queryTaskAttachments(decodeURIComponent(attachmentsMatch[1])));
    return;
  }
  const inspectionMatch = /^\/agent-api\/tasks\/([^/]+)$/.exec(url.pathname);
  if (method === "GET" && inspectionMatch?.[1] !== undefined) {
    sendAgentQuery(response, application.queryTaskInspection(decodeURIComponent(inspectionMatch[1])));
    return;
  }
  if (method === "GET" && url.pathname === "/agent-api/collaborators") {
    sendAgentQuery(response, application.queryCollaborators());
    return;
  }
  if (method === "GET" && url.pathname === "/agent-api/current-task") {
    const result = application.queryTaskInspection(scope.taskId);
    if (!result.available) sendAgentQuery(response, result);
    else sendJson(response, 200, result.task);
    return;
  }
  if (method === "POST" && url.pathname === "/agent-api/current-task/comments") {
    const body = await readJsonBody(request);
    const result = application.addTaskComment({
      taskId: scope.taskId,
      body: stringField(body, "body"),
      idempotencyKey: stringField(body, "idempotencyKey"),
      actor: { kind: "agent", id: scope.agentId },
    });
    sendJson(response, result.accepted ? 200 : 409, result);
    return;
  }
  if (method === "POST" && url.pathname === "/agent-api/current-task/move") {
    const body = await readJsonBody(request);
    const result = application.moveTask({
      taskId: scope.taskId,
      destinationColumnId: stringField(body, "destinationColumnId"),
      expectedRevision: numberField(body, "expectedRevision"),
      idempotencyKey: stringField(body, "idempotencyKey"),
      actor: { kind: "agent", id: scope.agentId },
    });
    sendJson(response, result.accepted ? 200 : 409, result);
    return;
  }
  if (method === "POST" && url.pathname === "/agent-api/current-task/children") {
    const body = await readJsonBody(request);
    const result = application.createChildTask(childTaskCommand(
      body,
      scope.taskId,
      { kind: "agent", id: scope.agentId },
    ));
    sendJson(response, result.accepted ? 201 : result.reason === "not-found" ? 404 : 409, result);
    return;
  }
  if (method === "POST" && url.pathname === "/agent-api/current-task/dependencies") {
    const body = await readJsonBody(request);
    const result = application.createTaskRelationship(relationshipCommand(
      body,
      "dependency",
      scope.taskId,
      { kind: "agent", id: scope.agentId },
    ));
    sendRelationshipMutation(response, result);
    return;
  }
  if (method === "POST" && url.pathname === "/agent-api/current-task/permission-block") {
    const body = await readJsonBody(request);
    sendJson(response, 200, {
      accepted: true,
      taskId: scope.taskId,
      summary: stringField(body, "summary"),
    });
    return;
  }
  sendJson(response, 404, { error: "unknown-agent-tool" });
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 64 * 1024) throw new Error("Request body exceeds 64 KiB");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const text = await readBody(request);
  const parsed = JSON.parse(text.length === 0 ? "{}" : text) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function stringField(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

function numberField(body: Record<string, unknown>, name: string): number {
  const value = body[name];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

function stringArrayField(body: Record<string, unknown>, name: string): string[] {
  const value = body[name];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${name} must be an array of strings`);
  }
  return value;
}

function childTaskCommand(
  body: Record<string, unknown>,
  parentTaskId: string,
  actor: Actor,
): CreateChildTaskCommand {
  return {
    parentTaskId,
    boardId: stringField(body, "boardId"),
    columnId: stringField(body, "columnId"),
    title: stringField(body, "title"),
    description: stringField(body, "description"),
    ...(body.startingRef === undefined ? {} : { startingRef: stringField(body, "startingRef") }),
    idempotencyKey: stringField(body, "idempotencyKey"),
    actor,
  };
}

function relationshipCommand(
  body: Record<string, unknown>,
  type: CreateTaskRelationshipCommand["type"],
  sourceTaskId: string,
  actor: Actor,
): CreateTaskRelationshipCommand {
  return {
    type,
    sourceTaskId,
    targetTaskId: stringField(body, "targetTaskId"),
    idempotencyKey: stringField(body, "idempotencyKey"),
    actor,
  };
}

function sendRelationshipMutation(
  response: ServerResponse,
  result: ReturnType<CoordinationApplication["createTaskRelationship"]>,
): void {
  sendJson(response, result.accepted ? 201 : result.reason === "not-found" ? 404 : 409, result);
}

function sendAgentQuery(
  response: ServerResponse,
  result:
    | ReturnType<CoordinationApplication["queryBoardSummaries"]>
    | ReturnType<CoordinationApplication["queryTaskOverviews"]>
    | ReturnType<CoordinationApplication["queryTaskInspection"]>
    | ReturnType<CoordinationApplication["queryTaskActivity"]>
    | ReturnType<CoordinationApplication["queryTaskAttachments"]>
    | ReturnType<CoordinationApplication["queryCollaborators"]>,
): void {
  if (result.available) {
    sendJson(response, 200, result);
    return;
  }
  const status = result.reason === "configuration-error"
    ? 409
    : result.reason === "not-found" || result.reason === "board-not-found" || result.reason === "column-not-found"
      ? 404
      : 400;
  sendJson(response, status, result);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}
