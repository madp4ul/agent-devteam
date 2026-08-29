import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

import { AgentToolScopeRegistry } from "../../src/mcp/agent-tool-scope.ts";
import type { AgentCoordinationCapabilities } from "../../src/web/agent-api/capabilities.ts";
import { createAgentApiRoutes } from "../../src/web/agent-api/routes.ts";
import { registerAutomationRoutes } from "../../src/web/browser-api/automation-routes.ts";
import { registerConversationRoutes } from "../../src/web/browser-api/conversation-routes.ts";
import { registerSettingsRoutes } from "../../src/web/browser-api/settings-routes.ts";
import { createHttpDispatcher } from "../../src/web/http/dispatcher.ts";
import type { HttpRouteContext } from "../../src/web/http/route-context.ts";
import { sendJson } from "../../src/web/http/response.ts";

test("browser routes expose a query, mutation status mapping, and query parameter through narrow capabilities", async () => {
  const occurrenceQueries: Array<number | undefined> = [];
  const updates: unknown[] = [];
  const application = {
    queryNotificationPolicy: () => ({ enabled: true }),
    queryProcessCostStatistics: () => ({ total: 0 }),
    queryNotificationOccurrences: (after?: number) => {
      occurrenceQueries.push(after);
      return { occurrences: [] };
    },
    updateNotificationPolicy: (request: unknown) => {
      updates.push(request);
      return { accepted: false, reason: "not-found" };
    },
  } as unknown as Parameters<typeof registerSettingsRoutes>[1];
  const server = await startRouteServer((dispatcher) => registerSettingsRoutes(dispatcher, application));
  try {
    const query = await fetch(`${server.baseUrl}/api/settings/notifications`);
    assert.equal(query.status, 200);
    assert.deepEqual(await query.json(), { enabled: true });

    const occurrences = await fetch(`${server.baseUrl}/api/notification-occurrences?after=7`);
    assert.equal(occurrences.status, 200);
    assert.deepEqual(occurrenceQueries, [7]);

    const mutation = await fetch(`${server.baseUrl}/api/settings/notifications`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "global", enabled: false }),
    });
    assert.equal(mutation.status, 404);
    assert.deepEqual(updates, [{ change: { type: "global", enabled: false } }]);
  } finally {
    await server.close();
  }
});

test("route dispatch awaits and propagates an asynchronous capability failure", async () => {
  const application = {
    queryUserBoard: () => ({ startup: { mode: "ready" } }),
    resumeAutomation: async () => { throw new Error("resume failed"); },
    resumeWithCurrentProcess: async () => ({ accepted: true }),
    pauseAutomation: () => ({ accepted: true }),
  } as unknown as Parameters<typeof registerAutomationRoutes>[1];
  const server = await startRouteServer((dispatcher) => registerAutomationRoutes(dispatcher, application));
  try {
    const response = await fetch(`${server.baseUrl}/api/automation/resume`, { method: "POST" });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid-request", diagnostic: "resume failed" });
  } finally {
    await server.close();
  }
});

test("agent routes authenticate before dispatch and derive current-task identity only from immutable scope", async () => {
  const scopes = new AgentToolScopeRegistry();
  const token = scopes.issue({ taskId: "scoped-task", agentId: "agent-1", attemptId: "attempt-1" });
  const comments: unknown[] = [];
  const application = {
    queryBoardSummaries: () => ({ available: true, boards: [{ id: "board-1" }] }),
    addTaskComment: (command: unknown) => {
      comments.push(command);
      return {
        accepted: true,
        task: { id: "scoped-task", revision: 4 },
        comment: { id: "comment-1" },
      };
    },
  } as unknown as AgentCoordinationCapabilities;
  const routes = createAgentApiRoutes(application, scopes);
  const server = await startHandlerServer((request, response, method, url) =>
    routes.dispatch(request, response, method, url)
  );
  try {
    const missing = await fetch(`${server.baseUrl}/agent-api/boards/summary`);
    assert.equal(missing.status, 401);
    const invalid = await fetch(`${server.baseUrl}/agent-api/boards/summary`, {
      headers: { authorization: "Bearer invalid" },
    });
    assert.equal(invalid.status, 401);

    const query = await fetch(`${server.baseUrl}/agent-api/boards/summary`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(query.status, 200);

    const mutation = await fetch(`${server.baseUrl}/agent-api/current-task/comments`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        taskId: "attacker-selected-task",
        agentId: "attacker-selected-agent",
        body: "Scoped comment",
        idempotencyKey: "comment-key",
      }),
    });
    assert.equal(mutation.status, 200);
    assert.deepEqual(comments, [{
      taskId: "scoped-task",
      body: "Scoped comment",
      idempotencyKey: "comment-key",
      actor: { kind: "agent", id: "agent-1" },
      attemptId: "attempt-1",
    }]);
  } finally {
    await server.close();
  }
});

test("conversation upload and attachment download remain raw streaming routes", async () => {
  let uploaded = "";
  let uploadContentIsRequest = false;
  const application = {
    createConversationUpload: async (command: { content: AsyncIterable<Uint8Array> }) => {
      uploadContentIsRequest = typeof (command.content as { headers?: unknown }).headers === "object";
      for await (const chunk of command.content) uploaded += Buffer.from(chunk).toString("utf8");
      return { accepted: true, upload: { id: "upload-1" } };
    },
    readConversationAttachment: () => ({
      available: true,
      attachment: { mediaType: "text/plain", sizeBytes: 13, fileName: "notes one.txt" },
      content: (async function* () {
        yield Buffer.from("download-");
        yield Buffer.from("data");
      })(),
    }),
  } as unknown as Parameters<typeof registerConversationRoutes>[1];
  const server = await startRouteServer((dispatcher) => registerConversationRoutes(dispatcher, application));
  try {
    const upload = await fetch(`${server.baseUrl}/api/tasks/task%201/conversations/conversation%201/uploads?fileName=notes.txt`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "streamed-upload",
    });
    assert.equal(upload.status, 201);
    assert.equal(uploaded, "streamed-upload");
    assert.equal(uploadContentIsRequest, true);

    const download = await fetch(`${server.baseUrl}/api/tasks/task%201/conversations/conversation%201/attachments/attachment%201`);
    assert.equal(download.status, 200);
    assert.equal(await download.text(), "download-data");
    assert.equal(download.headers.get("content-type"), "text/plain");
    assert.equal(download.headers.get("content-length"), "13");
    assert.equal(download.headers.get("content-disposition"), "attachment; filename*=UTF-8''notes%20one.txt");
    assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  } finally {
    await server.close();
  }
});

async function startRouteServer(
  register: (dispatcher: ReturnType<typeof createHttpDispatcher<HttpRouteContext>>) => void,
): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const dispatcher = createHttpDispatcher<HttpRouteContext>();
  register(dispatcher);
  return startHandlerServer(async (request, response, method, url) => {
    const result = await dispatcher.dispatch(method, url.pathname, { request, response, url });
    if (result.kind !== "matched") sendJson(response, 404, result);
  });
}

async function startHandlerServer(
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
    method: string,
    url: URL,
  ) => Promise<void>,
): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://local.invalid");
    void handler(request, response, method, url).catch((error: unknown) => {
      sendJson(response, 400, {
        error: "invalid-request",
        diagnostic: error instanceof Error ? error.message : "Unexpected failure",
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    }),
  };
}
