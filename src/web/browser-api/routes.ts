import type { IncomingMessage, ServerResponse } from "node:http";

import { createHttpDispatcher, type RouteCatalogEntry } from "../http/dispatcher.ts";
import type { HttpRouteContext } from "../http/route-context.ts";
import { sendJson } from "../http/response.ts";
import { registerArchiveWorkspaceRoutes, type WorkspaceOpeners } from "./archive-workspace-routes.ts";
import { registerAttentionRoutes } from "./attention-routes.ts";
import { registerAutomationRoutes } from "./automation-routes.ts";
import type { BrowserCoordinationCapabilities } from "./capabilities.ts";
import { registerConversationRoutes } from "./conversation-routes.ts";
import { registerSettingsRoutes } from "./settings-routes.ts";
import { registerTaskRoutes } from "./task-routes.ts";

export interface BrowserApiRoutes {
  dispatch(request: IncomingMessage, response: ServerResponse, method: string, url: URL): Promise<void>;
  catalog(): RouteCatalogEntry[];
}

export function createBrowserApiRoutes(
  application: BrowserCoordinationCapabilities,
  openers: WorkspaceOpeners,
): BrowserApiRoutes {
  const dispatcher = createHttpDispatcher<HttpRouteContext>();
  registerSettingsRoutes(dispatcher, application);
  registerAutomationRoutes(dispatcher, application);
  registerTaskRoutes(dispatcher, application);
  registerConversationRoutes(dispatcher, application);
  registerArchiveWorkspaceRoutes(dispatcher, application, openers);
  registerAttentionRoutes(dispatcher, application);

  return {
    async dispatch(request, response, method, url) {
      const result = await dispatcher.dispatch(method, url.pathname, { request, response, url });
      if (result.kind === "invalid-path-encoding") throw new URIError("URI malformed");
      if (result.kind !== "matched") sendJson(response, 404, { error: "unknown-browser-api" });
    },
    catalog: () => dispatcher.catalog(),
  };
}
