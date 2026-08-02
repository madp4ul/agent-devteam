import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const baseUrl = requiredOptionOrEnvironment(
  process.argv.slice(2),
  "--base-url",
  "COORDINATION_AGENT_API_BASE_URL",
);
const token = requiredOptionOrEnvironment(
  process.argv.slice(2),
  "--token",
  "COORDINATION_AGENT_TOOL_TOKEN",
);

const server = new McpServer(
  {
    name: "agent-coordination-current-task",
    version: "0.1.0",
  },
  {
    instructions:
      "These tools are scoped to the activation's current task. Inspect current state before acting. Add comments and moves idempotently. A tool never accepts a different task ID.",
  },
);

server.registerTool(
  "inspect_current_task",
  {
    description:
      "Inspect the complete current task assigned to this activation, including comments and relationships.",
    inputSchema: {},
  },
  async () => callAgentApi("GET", "/agent-api/current-task"),
);

server.registerTool(
  "add_comment",
  {
    description: "Add an authored agent comment to the current task idempotently.",
    inputSchema: {
      body: z.string().min(1),
      idempotencyKey: z.string().min(1),
    },
  },
  async (arguments_) => callAgentApi("POST", "/agent-api/current-task/comments", arguments_),
);

server.registerTool(
  "move_current_task",
  {
    description: "Move the current task to a named destination column idempotently.",
    inputSchema: {
      destinationColumnId: z.string().min(1),
      expectedRevision: z.number().int().min(1),
      idempotencyKey: z.string().min(1),
    },
  },
  async (arguments_) => callAgentApi("POST", "/agent-api/current-task/move", arguments_),
);

await server.connect(new StdioServerTransport());

async function callAgentApi(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return {
    content: [{ type: "text", text }],
    ...(response.ok ? {} : { isError: true }),
  };
}

function requiredOptionOrEnvironment(
  arguments_: string[],
  name: string,
  environmentName: string,
): string {
  const index = arguments_.indexOf(name);
  const value = index === -1 ? process.env[environmentName] : arguments_[index + 1];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required ${name} option or ${environmentName} environment variable`);
  }
  return value;
}
