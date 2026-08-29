import type { UpdateNotificationPolicyRequest } from "../../application/browser-transport-contract.ts";
import type { HttpDispatcher } from "../http/dispatcher.ts";
import {
  booleanField,
  notificationCauseField,
  readJsonBody,
  stringField,
} from "../http/request.ts";
import type { HttpRouteContext } from "../http/route-context.ts";
import { sendJson } from "../http/response.ts";
import type { BrowserCoordinationCapabilities } from "./capabilities.ts";

type SettingsCapabilities = Pick<BrowserCoordinationCapabilities,
  | "queryNotificationPolicy"
  | "queryProcessCostStatistics"
  | "updateNotificationPolicy"
  | "queryNotificationOccurrences"
>;

export function registerSettingsRoutes(
  dispatcher: HttpDispatcher<HttpRouteContext>,
  application: SettingsCapabilities,
): void {
  dispatcher.register("GET", "/api/settings/notifications", "browser/settings", ({ response }) => {
    sendJson(response, 200, application.queryNotificationPolicy());
  });
  dispatcher.register("PATCH", "/api/settings/notifications", "browser/settings", async ({ request, response }) => {
    const body = await readJsonBody<UpdateNotificationPolicyRequest>(request);
    const type = stringField(body, "type");
    const enabled = booleanField(body, "enabled");
    const result = type === "global"
      ? application.updateNotificationPolicy({ change: { type, enabled } })
      : type === "cause"
        ? application.updateNotificationPolicy({
            change: { type, cause: notificationCauseField(body, "cause"), enabled },
          })
        : type === "column"
          ? application.updateNotificationPolicy({
              change: {
                type,
                boardId: stringField(body, "boardId"),
                columnId: stringField(body, "columnId"),
                enabled,
              },
            })
          : undefined;
    if (result === undefined) throw new Error("type must be global, cause, or column");
    sendJson(response, result.accepted ? 200 : 404, result);
  });
  dispatcher.register("GET", "/api/notification-occurrences", "browser/settings", ({ response, url }) => {
    const afterText = url.searchParams.get("after");
    const after = afterText === null ? undefined : Number(afterText);
    if (after !== undefined && (!Number.isInteger(after) || after < 0)) {
      throw new Error("after must be a non-negative integer");
    }
    sendJson(response, 200, application.queryNotificationOccurrences(after));
  });
  dispatcher.register("GET", "/api/settings/cost-statistics", "browser/settings", ({ response }) => {
    sendJson(response, 200, application.queryProcessCostStatistics());
  });
}
