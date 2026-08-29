import type { IncomingMessage } from "node:http";

import type {
  Actor,
  CreateChildTaskCommand,
  CreateTaskRelationshipCommand,
} from "../../application/task-contract.ts";

export async function readJsonBody<Payload extends object = Record<string, unknown>>(
  request: IncomingMessage,
): Promise<Record<string, unknown> & Payload> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 64 * 1024) throw new Error("Request body exceeds 64 KiB");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  const parsed = JSON.parse(text.length === 0 ? "{}" : text) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object");
  }
  return parsed as Record<string, unknown> & Payload;
}

export function stringField(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

export function numberField(body: Record<string, unknown>, name: string): number {
  const value = body[name];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

export function booleanField(body: Record<string, unknown>, name: string): boolean {
  const value = body[name];
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
}

export function notificationCauseField(
  body: Record<string, unknown>,
  name: string,
): "user-mention" | "failed-run" {
  const value = stringField(body, name);
  if (value !== "user-mention" && value !== "failed-run") {
    throw new Error(`${name} must be user-mention or failed-run`);
  }
  return value;
}

export function stringArrayField(body: Record<string, unknown>, name: string): string[] {
  const value = body[name];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${name} must be an array of strings`);
  }
  return value;
}

export function childTaskCommand(
  body: Record<string, unknown>,
  parentTaskId: string,
  actor: Actor,
  attemptId?: string,
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
    ...(attemptId === undefined ? {} : { attemptId }),
  };
}

export function relationshipCommand(
  body: Record<string, unknown>,
  type: CreateTaskRelationshipCommand["type"],
  sourceTaskId: string,
  actor: Actor,
  attemptId?: string,
): CreateTaskRelationshipCommand {
  return {
    type,
    sourceTaskId,
    targetTaskId: stringField(body, "targetTaskId"),
    idempotencyKey: stringField(body, "idempotencyKey"),
    actor,
    ...(attemptId === undefined ? {} : { attemptId }),
  };
}
