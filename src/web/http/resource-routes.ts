import type { CoordinationApplication } from "../../application/coordination-application.ts";
import type { ResourceCommand, ResourceMutationResult } from "../../application/resource-contract.ts";
import type { HttpDispatcher } from "./dispatcher.ts";
import type { HttpRouteContext } from "./route-context.ts";
import { numberField, readJsonBody, stringField } from "./request.ts";
import { sendJson } from "./response.ts";

type ResourceCapabilities = Pick<CoordinationApplication, "queryResources" | "queryResource" | "createResource" | "editResource" | "archiveResource">;

export function registerResourceRoutes<Context extends HttpRouteContext>(
  dispatcher: HttpDispatcher<Context>, application: ResourceCapabilities,
  prefix: "/api" | "/agent-api", actor: (context: Context) => Omit<ResourceCommand, "idempotencyKey">,
): void {
  const owner = prefix === "/api" ? "browser/resources" : "agent/resources";
  dispatcher.register("GET", `${prefix}/resources`, owner, context => {
    const result = application.queryResources(context.url.searchParams.get("includeArchived") === "true");
    sendJson(context.response, result.available ? 200 : 409, result);
  });
  dispatcher.register("GET", `${prefix}/resources/:resourceId`, owner, context => {
    const result = application.queryResource(context.params.resourceId);
    sendJson(context.response, result.available ? 200 : result.reason === "not-found" ? 404 : 409, result);
  });
  dispatcher.register("POST", `${prefix}/resources`, owner, async context => {
    const body = await readJsonBody(context.request);
    const result = application.createResource({ ...actor(context), title: stringField(body, "title"), description: body.description === undefined ? "" : stringField(body, "description"), idempotencyKey: stringField(body, "idempotencyKey") });
    sendJson(context.response, mutationStatus(result, 201), result);
  });
  dispatcher.register("PATCH", `${prefix}/resources/:resourceId`, owner, async context => {
    const body = await readJsonBody(context.request);
    const result = application.editResource({ ...actor(context), resourceId: context.params.resourceId,
      expectedRevision: numberField(body, "expectedRevision"), idempotencyKey: stringField(body, "idempotencyKey"),
      ...(body.title === undefined ? {} : { title: stringField(body, "title") }),
      ...(body.description === undefined ? {} : { description: stringField(body, "description") }),
    });
    sendJson(context.response, mutationStatus(result), result);
  });
  dispatcher.register("POST", `${prefix}/resources/:resourceId/archive`, owner, async context => {
    const body = await readJsonBody(context.request);
    const result = application.archiveResource({ ...actor(context), resourceId: context.params.resourceId,
      expectedRevision: numberField(body, "expectedRevision"), idempotencyKey: stringField(body, "idempotencyKey") });
    sendJson(context.response, mutationStatus(result), result);
  });
}
function mutationStatus(result: ResourceMutationResult, success = 200): number {
  return result.accepted ? success : result.reason === "not-found" ? 404 : ["empty-title", "empty-change", "invalid-idempotency-key"].includes(result.reason) ? 400 : 409;
}
