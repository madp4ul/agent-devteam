import type { IncomingMessage, ServerResponse } from "node:http";

export interface HttpRouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
}
