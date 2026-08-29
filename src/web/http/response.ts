import type { ServerResponse } from "node:http";

import type { CoordinationApplication } from "../../application/coordination-application.ts";

export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

export function sendText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

export function sendMutation(
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
    result.reason === "completion-is-not-starting-column" ||
    result.reason === "invalid-destination"
      ? 400
      : result.reason === "not-found"
        ? 404
        : 409;
  sendJson(response, status, result);
}

export function sendRelationshipMutation(
  response: ServerResponse,
  result: ReturnType<CoordinationApplication["createTaskRelationship"]>,
): void {
  sendJson(response, result.accepted ? 201 : result.reason === "not-found" ? 404 : 409, result);
}

export function sendAgentQuery(
  response: ServerResponse,
  result:
    | ReturnType<CoordinationApplication["queryBoardSummaries"]>
    | ReturnType<CoordinationApplication["queryTaskOverviews"]>
    | ReturnType<CoordinationApplication["queryArchivedTaskOverviews"]>
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
