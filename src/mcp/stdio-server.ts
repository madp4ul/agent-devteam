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
    name: "agent-coordination-project",
    version: "0.1.0",
  },
  {
    instructions:
      "Read tools can inspect shared project tasks. Comments and relationship reassignment/removal support cross-task coordination; other mutations remain current-task scoped. current always identifies the caller's task. Mutation keys identify an intended operation across retries.",
  },
);

server.registerTool(
  "summarize_boards",
  {
    description:
      "List boards with ordered columns, watching agents, and task counts without task payloads.",
    inputSchema: {},
  },
  async () => callAgentApi("GET", "/agent-api/boards/summary"),
);

server.registerTool(
  "list_tasks",
  {
    description:
      "List a bounded page of compact task overviews from one or more explicit columns.",
    inputSchema: {
      boardId: z.string().min(1),
      columnIds: z.array(z.string().min(1)).min(1),
      pageSize: z.number().int().min(1).max(50).optional(),
      cursor: z.string().min(1).optional(),
    },
  },
  async (arguments_) => callAgentApi("POST", "/agent-api/tasks/query", arguments_),
);

server.registerTool(
  "list_archived_tasks",
  {
    description:
      "Deliberately list tasks retained in archive history. Archived tasks are excluded from ordinary column listings.",
    inputSchema: {},
  },
  async () => callAgentApi("GET", "/agent-api/tasks/archive"),
);

server.registerTool(
  "inspect_task",
  {
    description:
      "Inspect a complete task description, comments, relationships, and current coordination state.",
    inputSchema: { taskId: z.string().min(1) },
  },
  async ({ taskId }) =>
    callAgentApi("GET", `/agent-api/tasks/${encodeURIComponent(taskId)}`),
);

server.registerTool(
  "list_task_activity",
  {
    description: "Read a task's immutable framework activity on demand.",
    inputSchema: { taskId: z.string().min(1) },
  },
  async ({ taskId }) =>
    callAgentApi("GET", `/agent-api/tasks/${encodeURIComponent(taskId)}/activity`),
);

server.registerTool(
  "list_task_attachments",
  {
    description: "Read a task's attachments on demand.",
    inputSchema: { taskId: z.string().min(1) },
  },
  async ({ taskId }) =>
    callAgentApi("GET", `/agent-api/tasks/${encodeURIComponent(taskId)}/attachments`),
);

server.registerTool(
  "task.participant.list",
  {
    description: "List every applied process agent with its address, role, watcher responsibilities and execution state on this task. Same agent ID on another task has independent memory. taskId is current or a concrete task ID.",
    inputSchema: { taskId: z.string().min(1) },
  },
  async ({ taskId }) => callAgentApi("GET", `/agent-api/tasks/${encodeURIComponent(taskId)}/participants`),
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
  "inspect_operating_context",
  {
    description:
      "Recover the complete current framework, process, board, owning-role, and participant instructions for this attempt.",
    inputSchema: {},
  },
  async () => callAgentApi("GET", "/agent-api/operating-context"),
);

server.registerTool(
  "task.comment.add",
  {
    description: "Append a comment on a mapped mutable project task. taskId is current or a concrete ID. Mentions address participants on the destination task, including the same agent ID on a different task. The author and origin are derived from the caller. Exact retries with the same key replay; changed payloads reject.",
    inputSchema: {
      taskId: z.string().min(1),
      body: z.string().min(1),
      idempotencyKey: z.string().min(1),
    },
  },
  async ({ taskId, ...arguments_ }) => callAgentApi("POST", `/agent-api/tasks/${encodeURIComponent(taskId)}/comments`, arguments_),
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

server.registerTool(
  "create_child_task",
  {
    description: "Create a child of the current task in a chosen board column.",
    inputSchema: {
      boardId: z.string().min(1),
      columnId: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      resumeAgent: z.string().min(1),
      startingRef: z.string().min(1).optional(),
      idempotencyKey: z.string().min(1),
    },
  },
  async (arguments_) => callAgentApi("POST", "/agent-api/current-task/children", arguments_),
);

server.registerTool(
  "add_dependency",
  {
    description: "Make the current task depend on another task.",
    inputSchema: {
      targetTaskId: z.string().min(1),
      resumeAgent: z.string().min(1),
      idempotencyKey: z.string().min(1),
    },
  },
  async (arguments_) => callAgentApi("POST", "/agent-api/current-task/dependencies", arguments_),
);

server.registerTool(
  "set_relationship_resume_agent",
  {
    description: "Change who reassesses a waiting task when an unresolved relationship is satisfied. Use current or a concrete source task ID.",
    inputSchema: {
      taskId: z.string().min(1),
      relationshipId: z.string().min(1),
      resumeAgent: z.string().min(1),
      idempotencyKey: z.string().min(1),
    },
  },
  async ({ taskId, relationshipId, ...body }) => callAgentApi(
    "PATCH",
    `/agent-api/tasks/${encodeURIComponent(taskId)}/relationships/${encodeURIComponent(relationshipId)}/resume-agent`,
    body,
  ),
);

server.registerTool(
  "remove_relationship",
  {
    description: "Remove a mistaken relationship from current or a concrete task without waking its resume agent.",
    inputSchema: {
      taskId: z.string().min(1),
      relationshipId: z.string().min(1),
      idempotencyKey: z.string().min(1),
    },
  },
  async ({ taskId, relationshipId, ...body }) => callAgentApi(
    "DELETE",
    `/agent-api/tasks/${encodeURIComponent(taskId)}/relationships/${encodeURIComponent(relationshipId)}`,
    body,
  ),
);

server.registerTool(
  "report_permission_block",
  {
    description:
      "Report that the current activation cannot complete because the Codex permission policy blocked a required action. Use only after a required action was denied and user action or a policy change is necessary.",
    inputSchema: {
      summary: z.string().min(1),
    },
  },
  async (arguments_) =>
    callAgentApi("POST", "/agent-api/current-task/permission-block", arguments_),
);

await server.connect(new StdioServerTransport());

async function callAgentApi(
  method: "GET" | "POST" | "PATCH" | "DELETE",
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
