import type {
  ContinueAgentConversationRequest,
  RetireAgentConversationRequest,
} from "../../application/browser-transport-contract.ts";
import { conversationAttachmentPolicy } from "../../application/conversation-attachment-policy.ts";
import type { HttpDispatcher } from "../http/dispatcher.ts";
import { readJsonBody, stringArrayField, stringField } from "../http/request.ts";
import type { HttpRouteContext } from "../http/route-context.ts";
import { sendJson } from "../http/response.ts";
import { localUserActor } from "./actor.ts";
import type { BrowserCoordinationCapabilities } from "./capabilities.ts";

type ConversationCapabilities = Pick<BrowserCoordinationCapabilities,
  | "queryAttemptTranscript"
  | "queryAgentConversation"
  | "continueAgentConversation"
  | "createConversationUpload"
  | "removeConversationUpload"
  | "readConversationAttachment"
  | "retireAgentConversation"
>;

export function registerConversationRoutes(
  dispatcher: HttpDispatcher<HttpRouteContext>,
  application: ConversationCapabilities,
): void {
  dispatcher.register("GET", "/api/attempts/:attemptId/transcript", "browser/conversations", async ({ response, params }) => {
    const result = await application.queryAttemptTranscript(params.attemptId);
    const status = result.available
      ? 200
      : result.reason === "not-found"
        ? 404
        : result.reason === "configuration-error"
          ? 409
          : 503;
    sendJson(response, status, result);
  });
  dispatcher.register("POST", "/api/tasks/:taskId/conversations/:conversationId/uploads", "browser/conversations", async ({ request, response, url, params }) => {
    const fileName = url.searchParams.get("fileName");
    if (fileName === null || fileName.trim().length === 0) throw new Error("fileName must be supplied");
    const declaredLength = Number(request.headers["content-length"] ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > conversationAttachmentPolicy.maximumTotalBytes) {
      sendJson(response, 413, { accepted: false, reason: "file-too-large" });
      return;
    }
    const result = await application.createConversationUpload({
      taskId: params.taskId,
      conversationId: params.conversationId,
      fileName,
      mediaType: request.headers["content-type"] ?? "application/octet-stream",
      content: request,
    });
    const status = result.accepted
      ? 201
      : result.reason === "not-found"
        ? 404
        : result.reason === "file-too-large" || result.reason === "attachment-limit-exceeded"
          ? 413
          : result.reason === "task-archived"
            ? 409
            : 507;
    sendJson(response, status, result);
  });
  dispatcher.register("DELETE", "/api/tasks/:taskId/conversations/:conversationId/uploads/:uploadId", "browser/conversations", ({ response, params }) => {
    const removed = application.removeConversationUpload(params);
    if (removed) response.writeHead(204).end();
    else sendJson(response, 404, { error: "not-found" });
  });
  dispatcher.register("GET", "/api/tasks/:taskId/conversations/:conversationId/attachments/:attachmentId", "browser/conversations", async ({ response, params }) => {
    const result = application.readConversationAttachment(params);
    if (!result.available) {
      sendJson(response, 404, result);
      return;
    }
    response.writeHead(200, {
      "content-type": result.attachment.mediaType || "application/octet-stream",
      "content-length": String(result.attachment.sizeBytes),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.attachment.fileName)}`,
      "x-content-type-options": "nosniff",
    });
    for await (const chunk of result.content) response.write(chunk);
    response.end();
  });
  dispatcher.register("GET", "/api/tasks/:taskId/conversations/:conversationId", "browser/conversations", async ({ response, params }) => {
    const result = await application.queryAgentConversation(params.taskId, params.conversationId);
    sendJson(response, result.available ? 200 : result.reason === "not-found" ? 404 : 409, result);
  });
  dispatcher.register("POST", "/api/tasks/:taskId/conversations/:conversationId/retire", "browser/conversations", async ({ request, response, params }) => {
    const body = await readJsonBody<RetireAgentConversationRequest>(request);
    const result = application.retireAgentConversation({
      ...params,
      reason: stringField(body, "reason"),
      actor: localUserActor,
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : result.reason === "empty-reason" ? 400 : 409, result);
  });
  dispatcher.register("POST", "/api/tasks/:taskId/conversations/:conversationId", "browser/conversations", async ({ request, response, params }) => {
    const body = await readJsonBody<ContinueAgentConversationRequest>(request);
    const result = application.continueAgentConversation({
      ...params,
      body: stringField(body, "body"),
      ...(body.attachmentIds === undefined ? {} : { attachmentIds: stringArrayField(body, "attachmentIds") }),
      actor: localUserActor,
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : result.reason === "empty-message" ? 400 : 409, result);
  });
}
