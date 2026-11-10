import type { AgentCoordinationCapabilities } from "./capabilities.ts";
import type { AgentRouteContext } from "./route-context.ts";
import type { HttpDispatcher } from "../http/dispatcher.ts";
import { readJsonBody, stringField } from "../http/request.ts";
import { sendJson } from "../http/response.ts";

export function registerResourceClaimRoutes(
  dispatcher: HttpDispatcher<AgentRouteContext>,
  application: Pick<AgentCoordinationCapabilities, "claimResource" | "releaseResource">,
): void {
  dispatcher.register("POST", "/agent-api/resources/:resourceId/claim", "agent/resource-claims", async ({ request, response, params, scope }) => {
    const body = await readJsonBody(request);
    const result = application.claimResource({ resourceId: params.resourceId, taskId: scope.taskId,
      actor: { kind: "agent", id: scope.agentId }, idempotencyKey: stringField(body, "idempotencyKey"),
      ...(scope.attemptId === undefined ? {} : { attemptId: scope.attemptId }),
    });
    sendJson(response, result.accepted ? 200 : 409, result);
  });
  dispatcher.register("POST", "/agent-api/resource-claims/:claimId/release", "agent/resource-claims", async ({ request, response, params, scope }) => {
    const body = await readJsonBody(request);
    const result = application.releaseResource({ claimId: params.claimId, taskId: scope.taskId,
      actor: { kind: "agent", id: scope.agentId }, idempotencyKey: stringField(body, "idempotencyKey"),
      ...(scope.attemptId === undefined ? {} : { attemptId: scope.attemptId }),
    });
    sendJson(response, result.accepted ? 200 : 409, result);
  });
}
