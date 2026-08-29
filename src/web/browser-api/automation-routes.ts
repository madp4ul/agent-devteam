import type { UserBoardProjection } from "../../application/browser-transport-contract.ts";
import type { HttpDispatcher } from "../http/dispatcher.ts";
import type { HttpRouteContext } from "../http/route-context.ts";
import { sendJson } from "../http/response.ts";
import type { BrowserCoordinationCapabilities } from "./capabilities.ts";

type AutomationCapabilities = Pick<BrowserCoordinationCapabilities,
  "queryUserBoard" | "resumeAutomation" | "resumeWithCurrentProcess" | "pauseAutomation"
>;

export function registerAutomationRoutes(
  dispatcher: HttpDispatcher<HttpRouteContext>,
  application: AutomationCapabilities,
): void {
  dispatcher.register("GET", "/api/board", "browser/automation", ({ response }) => {
    const board: UserBoardProjection = application.queryUserBoard();
    sendJson(response, board.startup.mode === "configuration-error" ? 409 : 200, board);
  });
  dispatcher.register("POST", "/api/automation/resume", "browser/automation", async ({ response }) => {
    const result = await application.resumeAutomation();
    sendJson(response, result.accepted ? 200 : 409, result);
  });
  dispatcher.register("POST", "/api/automation/resume-with-current-process", "browser/automation", async ({ response }) => {
    const result = await application.resumeWithCurrentProcess();
    sendJson(response, result.accepted ? 200 : 409, result);
  });
  dispatcher.register("POST", "/api/automation/pause", "browser/automation", ({ response }) => {
    sendJson(response, 200, application.pauseAutomation());
  });
}
