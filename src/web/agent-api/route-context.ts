import type { AgentToolScope } from "../../mcp/agent-tool-scope.ts";
import type { HttpRouteContext } from "../http/route-context.ts";

export interface AgentRouteContext extends HttpRouteContext {
  scope: AgentToolScope;
}
