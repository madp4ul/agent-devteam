export function summarizeCoordinationTool(
  item: { type: string; [key: string]: unknown },
  status: string,
  currentTaskId: string,
): string | undefined {
  if (item.type !== "mcp_tool_call" || item.server !== "coordination" || typeof item.tool !== "string") {
    return undefined;
  }
  const arguments_ = recordValue(item.arguments);
  const result = coordinationResult(item.result);
  const context = recordValue(result?.transition);
  const outcome = coordinationOutcome(status, result);
  const taskId = stringValue(context?.taskId) ?? stringValue(result?.taskId) ?? currentTaskId;
  if (item.tool === "move_current_task") {
    const from = stringValue(context?.fromColumnId);
    const to = stringValue(context?.toColumnId) ?? stringValue(arguments_?.destinationColumnId);
    if (from !== undefined && to !== undefined) return `${taskId}: ${from} → ${to} (${outcome})`;
    return `${taskId}: move to ${to ?? "requested column"} (${outcome})`;
  }
  if (item.tool === "add_comment") return `${taskId}: comment ${outcome}`;
  if (item.tool === "inspect_current_task") {
    return `${taskId}: current task ${status === "completed" ? "inspected" : status === "failed" ? "inspection failed" : "inspection running"}`;
  }
  if (item.tool === "create_child_task") {
    const childId = stringValue(recordValue(result?.task)?.id);
    const columnId = stringValue(arguments_?.columnId);
    return `${taskId}: child ${childId ?? boundedText(arguments_?.title) ?? "task"}${columnId === undefined ? "" : ` in ${columnId}`} (${outcome})`;
  }
  if (item.tool === "add_dependency") {
    return `${taskId}: dependency on ${stringValue(arguments_?.targetTaskId) ?? "requested task"} (${outcome})`;
  }
  if (item.tool === "report_permission_block") return `${taskId}: permission block (${outcome})`;
  if (item.tool === "inspect_task" || item.tool === "list_task_activity" || item.tool === "list_task_attachments") {
    return `${stringValue(arguments_?.taskId) ?? taskId}: ${item.tool.replaceAll("_", " ")} (${outcome})`;
  }
  if (item.tool === "list_tasks") {
    const boardId = stringValue(arguments_?.boardId) ?? "requested board";
    const columns = Array.isArray(arguments_?.columnIds)
      ? arguments_.columnIds.filter((value): value is string => typeof value === "string").slice(0, 5).join(", ")
      : "requested columns";
    return `${boardId}: tasks in ${columns} (${outcome})`;
  }
  if (item.tool === "summarize_boards") return `Board summaries (${outcome})`;
  if (item.tool === "list_collaborators") return `Collaborator directory (${outcome})`;
  return undefined;
}

function coordinationOutcome(status: string, result: Record<string, unknown> | undefined): string {
  if (status === "running") return "requested";
  if (status === "failed") return "failed";
  if (result?.accepted === false) {
    const reason = stringValue(result.reason);
    return reason === undefined ? "rejected" : `rejected: ${reason}`;
  }
  return result?.accepted === true ? "confirmed" : "succeeded";
}

function coordinationResult(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = parseJsonRecord(stringValue(recordValue(entry)?.text));
      if (parsed !== undefined) return parsed;
    }
    return undefined;
  }
  const direct = recordValue(value);
  if (direct === undefined) return parseJsonRecord(value);
  if (direct.transition !== undefined || direct.accepted !== undefined || direct.task !== undefined) {
    return direct;
  }
  if (!Array.isArray(direct.content)) return direct;
  for (const entry of direct.content) {
    const text = stringValue(recordValue(entry)?.text);
    const parsed = parseJsonRecord(text);
    if (parsed !== undefined) return parsed;
  }
  return direct;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return recordValue(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function boundedText(value: unknown): string | undefined {
  const text = stringValue(value);
  return text === undefined ? undefined : text.length <= 80 ? text : `${text.slice(0, 77)}…`;
}
