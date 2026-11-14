import type { UserBoardProjection } from "../../application/browser-transport-contract.ts";
import type { HttpDispatcher } from "../http/dispatcher.ts";
import type { HttpRouteContext } from "../http/route-context.ts";
import { sendJson } from "../http/response.ts";
import { readJsonBody, stringArrayField } from "../http/request.ts";
import type { BrowserCoordinationCapabilities } from "./capabilities.ts";

type AutomationCapabilities = Pick<BrowserCoordinationCapabilities,
  "queryUserBoard" | "resumeAutomation" | "resumeWithCurrentProcess" | "pauseAutomation" |
  "queryActivityMenuHistory" | "dismissActivityMenuHistory" | "queryActivityMenuOverview" | "queryArchivalMenu" | "clearActivityMenuHistory"
>;

export function registerAutomationRoutes(
  dispatcher: HttpDispatcher<HttpRouteContext>,
  application: AutomationCapabilities,
): void {
  const cursor = (url: URL): number | undefined => {
    const value = url.searchParams.get("before");
    if (value === null) return undefined;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1) throw new Error("before must be a positive integer");
    return number;
  };
  dispatcher.register("GET", "/api/activity-menu/overview", "browser/automation", ({ response }) => {
    sendJson(response, 200, application.queryActivityMenuOverview());
  });
  dispatcher.register("GET", "/api/activity-menu/archivals", "browser/automation", ({ response, url }) => {
    sendJson(response, 200, application.queryArchivalMenu(cursor(url)));
  });
  dispatcher.register("GET", "/api/activity-menu/history", "browser/automation", ({ response, url }) => {
    sendJson(response, 200, application.queryActivityMenuHistory(cursor(url)));
  });
  dispatcher.register("POST", "/api/activity-menu/history/dismiss", "browser/automation", async ({ request, response }) => {
    const body = await readJsonBody(request);
    if (body.kind !== undefined) {
      if (body.kind !== "preparation" && body.kind !== "run" && body.kind !== "archival") throw new Error("Unknown history kind");
      application.clearActivityMenuHistory(body.kind);
    } else {
      const ids = stringArrayField(body, "ids");
      if (ids.length > 1000) throw new Error("At most 1000 history entries can be dismissed at once");
      application.dismissActivityMenuHistory(ids);
    }
    sendJson(response, 200, { accepted: true });
  });
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
