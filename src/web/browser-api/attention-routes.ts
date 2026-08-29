import type {
  ActivationRecoveryRequest,
  IdempotentBrowserRequest,
} from "../../application/browser-transport-contract.ts";
import type { HttpDispatcher } from "../http/dispatcher.ts";
import { readJsonBody, stringField } from "../http/request.ts";
import type { HttpRouteContext } from "../http/route-context.ts";
import { sendJson } from "../http/response.ts";
import { localUserActor } from "./actor.ts";
import type { BrowserCoordinationCapabilities } from "./capabilities.ts";

type AttentionCapabilities = Pick<BrowserCoordinationCapabilities,
  | "dismissStaleActivation"
  | "dismissActivation"
  | "markUserMentionAddressed"
  | "continuePermissionBlockedActivation"
  | "retryFailedActivation"
  | "dismissFailedActivation"
>;

export function registerAttentionRoutes(
  dispatcher: HttpDispatcher<HttpRouteContext>,
  application: AttentionCapabilities,
): void {
  dispatcher.register("POST", "/api/activations/:activationId/dismiss-stale", "browser/attention", async ({ request, response, params }) => {
    const body = await readJsonBody<IdempotentBrowserRequest>(request);
    const result = application.dismissStaleActivation({
      activationId: params.activationId,
      actor: localUserActor,
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : 409, result);
  });
  dispatcher.register("POST", "/api/activations/:activationId/dismiss", "browser/attention", async ({ request, response, params }) => {
    const body = await readJsonBody<IdempotentBrowserRequest>(request);
    const result = application.dismissActivation({
      activationId: params.activationId,
      actor: localUserActor,
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : 409, result);
  });
  dispatcher.register("POST", "/api/attention/:attentionReasonId/mark-addressed", "browser/attention", async ({ request, response, params }) => {
    const body = await readJsonBody<IdempotentBrowserRequest>(request);
    const result = application.markUserMentionAddressed({
      attentionReasonId: params.attentionReasonId,
      actor: localUserActor,
      idempotencyKey: stringField(body, "idempotencyKey"),
    });
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : 409, result);
  });
  dispatcher.register("POST", "/api/attention/:attentionReasonId/retry", "browser/attention", recoveryHandler(application, "retry"));
  dispatcher.register("POST", "/api/attention/:attentionReasonId/dismiss", "browser/attention", recoveryHandler(application, "dismiss"));
  dispatcher.register("POST", "/api/attention/:attentionReasonId/continue", "browser/attention", recoveryHandler(application, "continue"));
}

function recoveryHandler(application: AttentionCapabilities, action: "retry" | "dismiss" | "continue") {
  return async ({ request, response, params }: HttpRouteContext & { params: { attentionReasonId: string } }) => {
    const body = await readJsonBody<ActivationRecoveryRequest>(request);
    const command = {
      attentionReasonId: params.attentionReasonId,
      actor: localUserActor,
      idempotencyKey: stringField(body, "idempotencyKey"),
    };
    const result = action === "continue"
      ? application.continuePermissionBlockedActivation({ ...command, message: stringField(body, "message") })
      : action === "retry"
        ? application.retryFailedActivation(command)
        : application.dismissFailedActivation(command);
    sendJson(response, result.accepted ? 200 : result.reason === "not-found" ? 404 : 409, result);
  };
}
