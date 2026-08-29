import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { TaskWorkspaceView } from "../application/browser-transport-contract.ts";
import type { AgentToolScopeRegistry } from "../mcp/agent-tool-scope.ts";
import type { AgentCoordinationCapabilities } from "./agent-api/capabilities.ts";
import { createAgentApiRoutes, type AgentApiRoutes } from "./agent-api/routes.ts";
import type { BrowserCoordinationCapabilities } from "./browser-api/capabilities.ts";
import { createBrowserApiRoutes, type BrowserApiRoutes } from "./browser-api/routes.ts";
import { sendJson, sendText } from "./http/response.ts";

type WebCoordinationCapabilities = BrowserCoordinationCapabilities & AgentCoordinationCapabilities;

export interface WebServerOptions {
  host: string;
  port: number;
  agentToolScopes?: AgentToolScopeRegistry;
  assetDirectory?: string;
  openWorkspace?: (taskId: string, workspace: TaskWorkspaceView) => Promise<void>;
  openWorkspaceInVisualStudioCode?: (taskId: string, workspace: TaskWorkspaceView) => Promise<void>;
}

export interface RunningWebServer {
  baseUrl: string;
  close(): Promise<void>;
}

export async function startWebServer(
  application: WebCoordinationCapabilities,
  options: WebServerOptions,
): Promise<RunningWebServer> {
  const browserApi = createBrowserApiRoutes(application, options);
  const agentApi = createAgentApiRoutes(application, options.agentToolScopes);
  const server = createServer((request, response) => {
    void handleRequest(options, browserApi, agentApi, request, response).catch((error: unknown) => {
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
    close: () => new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error === undefined ? resolveClose() : reject(error)));
    }),
  };
}

async function handleRequest(
  options: WebServerOptions,
  browserApi: BrowserApiRoutes,
  agentApi: AgentApiRoutes,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://local.invalid");
  if (url.pathname.startsWith("/agent-api/")) {
    await agentApi.dispatch(request, response, method, url);
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    await browserApi.dispatch(request, response, method, url);
    return;
  }
  if (method !== "GET" && method !== "HEAD") {
    sendJson(response, 405, { error: "method-not-allowed" });
    return;
  }
  await serveBrowserAsset(options.assetDirectory ?? defaultAssetDirectory(), url.pathname, response, method);
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
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}
