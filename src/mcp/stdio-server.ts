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
      "Tools operate on mapped mutable project tasks across boards. current always identifies the caller's task; self resolves to the caller's stable agent ID. Keys identify intended mutations across retries: exact normalized requests replay, changed requests reject. Task participants have independent memory across tasks. Execution, archival and process controls remain user-owned.",
  },
);

server.registerTool(
  "board.list",
  {
    description:
      "List boards with ordered columns, watching agents, and task counts without task payloads.",
    inputSchema: {},
  },
  async () => callAgentApi("GET", "/agent-api/boards/summary"),
);

server.registerTool(
  "task.list",
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
  "task.archive.list",
  {
    description:
      "Deliberately list tasks retained in archive history. Archived tasks are excluded from ordinary column listings.",
    inputSchema: { pageSize: z.number().int().min(1).max(50).optional(), cursor: z.string().min(1).optional() },
  },
  async (arguments_) => callAgentApi("POST", "/agent-api/tasks/archive/query", arguments_),
);

server.registerTool(
  "task.inspect",
  {
    description:
      "Inspect current task state, participants, every pinned comment and a recent whole-record history page. taskId is current or a concrete ID. Continue history.nextCursor directly with task.history.list.",
    inputSchema: { taskId: z.string().min(1), targetWords: z.number().int().positive().optional() },
  },
  async ({ taskId, ...body }) =>
    callAgentApi("POST", `/agent-api/tasks/${encodeURIComponent(taskId)}/inspect`, body),
);

server.registerTool(
  "task.history.list",
  {
    description: "Read immutable comments and substantive events as JSON. Select newest whole records toward targetWords (default 2000), then return oldest-first; the boundary record can exceed the target. Counts report returned, remaining and total words/records/comments. Use the returned cursor to continue backward. Cursors keep a fixed upper watermark, ignore later arrivals, and retry identically. An activation cursor stops once at its update boundary, then returns an older-history cursor; no scope argument is needed.",
    inputSchema: { taskId: z.string().min(1), targetWords: z.number().int().positive().optional(), cursor: z.string().min(1).optional() },
  },
  async ({ taskId, ...body }) =>
    callAgentApi("POST", `/agent-api/tasks/${encodeURIComponent(taskId)}/history`, body),
);

server.registerTool(
  "task.attachment.list",
  {
    description: "List bounded attachment metadata on current or a concrete task ID; default 20, maximum 50 per page.",
    inputSchema: { taskId: z.string().min(1), pageSize: z.number().int().min(1).max(50).optional(), cursor: z.string().min(1).optional() },
  },
  async ({ taskId, ...body }) =>
    callAgentApi("POST", `/agent-api/tasks/${encodeURIComponent(taskId)}/attachments/query`, body),
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
  "attempt.context.inspect",
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
      pinned: z.boolean().optional(),
      idempotencyKey: z.string().min(1),
    },
  },
  async ({ taskId, ...arguments_ }) => callAgentApi("POST", `/agent-api/tasks/${encodeURIComponent(taskId)}/comments`, arguments_),
);

for (const action of ["pin", "unpin"] as const) {
  server.registerTool(`task.comment.${action}`, {
    description: `${action === "pin" ? "Mark" : "Remove"} shared current guidance on a mutable task. Text remains immutable; no mentions or activations execute. Matching state is inert.`,
    inputSchema: { taskId: z.string().min(1), commentId: z.string().min(1), idempotencyKey: z.string().min(1) },
  }, async ({ taskId, commentId, ...body }) => callAgentApi("POST", `/agent-api/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}/${action}`, body));
}

server.registerTool(
  "task.create",
  {
    description: "Create independent work in an explicit board and column, with ordinary watcher activation.",
    inputSchema: {
      boardId: z.string().min(1), columnId: z.string().min(1), title: z.string().min(1),
      description: z.string().min(1), idempotencyKey: z.string().min(1),
    },
  },
  async (arguments_) => callAgentApi("POST", "/agent-api/tasks", arguments_),
);

server.registerTool(
  "task.edit",
  {
    description: "Edit supplied title/description on current or a concrete task ID. Omitted fields stay unchanged; supply at least one field. Revision conflicts return compact current state.",
    inputSchema: {
      taskId: z.string().min(1), expectedRevision: z.number().int().min(1),
      title: z.string().min(1).optional(), description: z.string().min(1).optional(), idempotencyKey: z.string().min(1),
    },
  },
  async ({ taskId, ...body }) => callAgentApi("PATCH", `/agent-api/tasks/${encodeURIComponent(taskId)}`, body),
);

server.registerTool(
  "task.move",
  {
    description: "Move current or a concrete task ID within its board with ordinary watcher effects. A same-column move is an inert success. Requires the task's revision.",
    inputSchema: {
      taskId: z.string().min(1),
      destinationColumnId: z.string().min(1),
      expectedRevision: z.number().int().min(1),
      idempotencyKey: z.string().min(1),
    },
  },
  async ({ taskId, ...body }) => callAgentApi("POST", `/agent-api/tasks/${encodeURIComponent(taskId)}/move`, body),
);

server.registerTool(
  "task.child.create",
  {
    description: "Atomically create new child work and an outgoing parent-child relationship from current or a concrete task ID. resumeAgent is self or an applied agent ID; completion later queues that owner.",
    inputSchema: {
      taskId: z.string().min(1),
      boardId: z.string().min(1),
      columnId: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      resumeAgent: z.string().min(1),
      startingRef: z.string().min(1).optional(),
      idempotencyKey: z.string().min(1),
    },
  },
  async ({ taskId, ...body }) => callAgentApi("POST", `/agent-api/tasks/${encodeURIComponent(taskId)}/children`, body),
);

server.registerTool(
  "task.child.add",
  {
    description: "Attach an existing child to current or a concrete parent task ID without creating a task. resumeAgent is self or an applied agent ID; removal wakes nobody.",
    inputSchema: { taskId: z.string().min(1), childTaskId: z.string().min(1), resumeAgent: z.string().min(1), idempotencyKey: z.string().min(1) },
  },
  async ({ taskId, ...body }) => callAgentApi("POST", `/agent-api/tasks/${encodeURIComponent(taskId)}/child-relationships`, body),
);

server.registerTool(
  "task.dependency.add",
  {
    description: "Add an outgoing dependency from current or a concrete source task ID to existing project work. resumeAgent is self or an applied agent ID. Relating completed work does not synthesize a past completion activation.",
    inputSchema: {
      taskId: z.string().min(1),
      targetTaskId: z.string().min(1),
      resumeAgent: z.string().min(1),
      idempotencyKey: z.string().min(1),
    },
  },
  async ({ taskId, ...body }) => callAgentApi("POST", `/agent-api/tasks/${encodeURIComponent(taskId)}/dependencies`, body),
);

server.registerTool(
  "task.relationship.resume_agent.update",
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
  "task.relationship.remove",
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
  "attempt.permission_block.report",
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
