import type { IncomingMessage, ServerResponse } from "node:http";

import type { AgentToolScopeRegistry } from "../../mcp/agent-tool-scope.ts";
import { createHttpDispatcher, type RouteCatalogEntry } from "../http/dispatcher.ts";
import { sendJson } from "../http/response.ts";
import type { AgentCoordinationCapabilities } from "./capabilities.ts";
import { registerCurrentTaskRoutes } from "./current-task-routes.ts";
import { registerDiscoveryRoutes } from "./discovery-routes.ts";
import type { AgentRouteContext } from "./route-context.ts";

export interface AgentApiRoutes {
  dispatch(request: IncomingMessage, response: ServerResponse, method: string, url: URL): Promise<void>;
  catalog(): RouteCatalogEntry[];
}

export function createAgentApiRoutes(
  application: AgentCoordinationCapabilities,
  scopes: AgentToolScopeRegistry | undefined,
): AgentApiRoutes {
  const dispatcher = createHttpDispatcher<AgentRouteContext>();
  registerDiscoveryRoutes(dispatcher, application);
  registerCurrentTaskRoutes(dispatcher, application);

  return {
    async dispatch(request, response, method, url) {
      const authorization = request.headers.authorization ?? "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      const scope = scopes?.resolve(token);
      if (scope === undefined) {
        sendJson(response, 401, { error: "invalid-agent-tool-scope" });
        return;
      }
      const result = await dispatcher.dispatch(method, url.pathname, { request, response, url, scope });
      if (result.kind === "invalid-path-encoding") throw new URIError("URI malformed");
      if (result.kind !== "matched") sendJson(response, 404, { error: "unknown-agent-tool" });
    },
    catalog: () => dispatcher.catalog(),
  };
}
