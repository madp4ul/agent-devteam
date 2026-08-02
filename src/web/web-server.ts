import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import {
  CoordinationApplication,
  type BoardView,
  type TaskQueryResult,
} from "../application/coordination-application.ts";

export interface WebServerOptions {
  host: string;
  port: number;
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
    void handleRequest(application, request, response).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unexpected server error";
      sendHtml(response, 500, page("Server error", `<h1>Server error</h1><p>${escapeHtml(message)}</p>`));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://${options.host}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  };
}

async function handleRequest(
  application: CoordinationApplication,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://local.invalid");
  if (method === "GET" && url.pathname === "/") {
    sendHtml(response, 200, renderBoardPage(application));
    return;
  }
  if (method === "POST" && url.pathname === "/automation/resume") {
    const result = application.resumeAutomation();
    sendHtml(response, result.accepted ? 200 : 409, renderBoardPage(application));
    return;
  }

  const taskMatch = /^\/tasks\/([^/]+)$/.exec(url.pathname);
  if (method === "GET" && taskMatch?.[1] !== undefined) {
    renderTaskResponse(application, response, decodeURIComponent(taskMatch[1]));
    return;
  }
  const moveMatch = /^\/tasks\/([^/]+)\/move$/.exec(url.pathname);
  if (method === "POST" && moveMatch?.[1] !== undefined) {
    const taskId = decodeURIComponent(moveMatch[1]);
    const form = new URLSearchParams(await readBody(request));
    const expectedRevision = Number(form.get("expectedRevision"));
    const destinationColumnId = form.get("destinationColumnId") ?? "";
    const result = application.moveTask({
      taskId,
      destinationColumnId,
      expectedRevision,
      actor: { kind: "user", id: "local-user" },
      idempotencyKey: form.get("idempotencyKey") ?? randomUUID(),
    });
    renderTaskResponse(application, response, taskId, result.accepted ? 200 : 409);
    return;
  }

  sendHtml(response, 404, page("Not found", "<h1>Not found</h1>"));
}

function renderBoardPage(application: CoordinationApplication): string {
  const startup = application.queryStartup();
  if (startup.mode === "configuration-error") {
    const diagnostics = startup.diagnostics
      .map(
        (diagnostic) => `<li>
          <p><strong>${escapeHtml(diagnostic.file)}:${diagnostic.line}:${diagnostic.column}</strong></p>
          <p>Invalid value: <code>${escapeHtml(formatValue(diagnostic.invalidValue))}</code></p>
          <p>Rule: ${escapeHtml(diagnostic.rule)}</p>
          <p>Consequence: ${escapeHtml(diagnostic.consequence)}</p>
          ${diagnostic.correction === undefined ? "" : `<p>Correction: ${escapeHtml(diagnostic.correction)}</p>`}
        </li>`,
      )
      .join("");
    return page(
      "Configuration error",
      `<header><h1>Configuration error</h1><p>Automation and board mutation are blocked.</p></header>
       <main><ol class="diagnostics">${diagnostics}</ol></main>`,
    );
  }

  const automation = application.queryAutomation();
  const boards = application.queryBoards();
  const boardMarkup = boards.available
    ? boards.boards.map(renderBoard).join("")
    : "";
  const automationLabel = automation.state === "running" ? "Automation running" : "Automation paused";
  const resume =
    automation.state === "paused"
      ? '<form method="post" action="/automation/resume"><button type="submit">Resume automation</button></form>'
      : "";
  return page(
    startup.processName,
    `<header>
       <p class="eyebrow">${escapeHtml(startup.processName)}</p>
       <h1>${automationLabel}</h1>
       <p>Process definition <code>${startup.processDefinitionVersion}</code></p>
       ${resume}
     </header>
     <main>${boardMarkup}</main>`,
  );
}

function renderBoard(board: BoardView): string {
  return `<section aria-labelledby="board-${escapeHtml(board.id)}">
    <h2 id="board-${escapeHtml(board.id)}">${escapeHtml(board.name)}</h2>
    <p>${escapeHtml(board.guidance)}</p>
    <div class="board">
      ${board.columns
        .map(
          (column) => `<section class="column" aria-labelledby="column-${escapeHtml(board.id)}-${escapeHtml(column.id)}">
            <h3 id="column-${escapeHtml(board.id)}-${escapeHtml(column.id)}">${escapeHtml(column.name)}</h3>
            <p>${column.watchingAgentId === null ? "Unwatched" : `Watched by ${escapeHtml(column.watchingAgentId)}`}</p>
            <ul>${column.tasks
              .map(
                (task) => `<li><a href="/tasks/${encodeURIComponent(task.id)}"><strong>${escapeHtml(task.id)}</strong> ${escapeHtml(task.title)}</a></li>`,
              )
              .join("")}</ul>
          </section>`,
        )
        .join("")}
    </div>
  </section>`;
}

function renderTaskResponse(
  application: CoordinationApplication,
  response: ServerResponse,
  taskId: string,
  successStatus = 200,
): void {
  const result = application.queryTask(taskId);
  if (!result.available) {
    const status = result.reason === "not-found" ? 404 : 409;
    sendHtml(response, status, page("Task unavailable", "<h1>Task unavailable</h1>"));
    return;
  }
  sendHtml(response, successStatus, renderTaskPage(result));
}

function renderTaskPage(result: Extract<TaskQueryResult, { available: true }>): string {
  const { task, board } = result;
  const currentColumn = board.columns.find((column) => column.id === task.columnId);
  const destinations = board.columns.filter((column) => column.id !== task.columnId);
  return page(
    `${task.id} ${task.title}`,
    `<nav><a href="/">Back to board</a></nav>
     <main>
       <article>
         <p class="eyebrow">${escapeHtml(task.id)}</p>
         <h1>${escapeHtml(task.title)}</h1>
         <p>${escapeHtml(task.description)}</p>
         <p>Current column: <strong>${escapeHtml(currentColumn?.name ?? task.columnId)}</strong></p>
         <form method="post" action="/tasks/${encodeURIComponent(task.id)}/move">
           <label>Destination
             <select name="destinationColumnId" aria-label="Move task to column">
               ${destinations
                 .map(
                   (column) => `<option value="${escapeHtml(column.id)}">${escapeHtml(column.name)}</option>`,
                 )
                 .join("")}
             </select>
           </label>
           <input type="hidden" name="expectedRevision" value="${task.revision}">
           <input type="hidden" name="idempotencyKey" value="${randomUUID()}">
           <button type="submit">Move task</button>
         </form>
       </article>
     </main>`,
  );
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

function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
  });
  response.end(html);
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0 auto; max-width: 90rem; padding: 2rem; }
    .board { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
    .column, article, .diagnostics li { border: 1px solid ButtonBorder; border-radius: .5rem; padding: 1rem; }
    .eyebrow { font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    code { overflow-wrap: anywhere; }
    button, select { font: inherit; padding: .5rem; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatValue(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}
