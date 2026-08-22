import type { CoordinationTranscriptPresentation } from "../application/runtime-contract.ts";

export type CoordinationToolSemanticStatus = "rejected";

export function coordinationToolPresentation(
  item: { type: string; [key: string]: unknown },
  run: { attemptId: string; taskId: string },
): CoordinationTranscriptPresentation | undefined {
  if (item.type !== "mcp_tool_call" || item.server !== "coordination") {
    return undefined;
  }
  const arguments_ = recordValue(item.arguments);
  if (item.tool === "add_comment") {
    const body = stringValue(arguments_?.body);
    return body === undefined ? undefined : { kind: "coordination-comment", body };
  }
  if (item.tool === "inspect_operating_context") {
    const result = coordinationResult(item.result);
    const process = recordValue(result?.process);
    const board = recordValue(result?.board);
    const owningAgent = recordValue(result?.owningAgent);
    return {
      kind: "coordination-inspection",
      scope: "operating-context",
      attemptId: stringValue(result?.attemptId) ?? run.attemptId,
      taskId: stringValue(result?.taskId) ?? run.taskId,
      ...optionalString("processName", process?.name),
      ...optionalString("boardId", board?.id),
      ...optionalString("boardName", board?.name),
      ...optionalString("owningAgentName", owningAgent?.name),
    };
  }
  const result = coordinationResult(item.result);
  if (item.tool === "summarize_boards") {
    return {
      kind: "coordination-inspection",
      scope: "board-summaries",
      boards: namedEntities(result?.boards),
    };
  }
  if (item.tool === "list_tasks") {
    const requestedBoard = stringValue(arguments_?.boardId);
    const requestedColumns = stringValues(arguments_?.columnIds).map((id) => ({ id }));
    return {
      kind: "coordination-inspection",
      scope: "tasks",
      ...(requestedBoard === undefined ? {} : { board: { id: requestedBoard } }),
      columns: requestedColumns,
    };
  }
  if (item.tool === "list_archived_tasks") {
    const tasks = Array.isArray(result?.tasks) ? result.tasks : undefined;
    return {
      kind: "coordination-inspection",
      scope: "archived-tasks",
      ...(tasks === undefined ? {} : { taskCount: tasks.length }),
    };
  }
  if (item.tool === "inspect_task" || item.tool === "list_task_activity" || item.tool === "list_task_attachments") {
    const task = recordValue(result?.task);
    const scope = item.tool === "inspect_task"
      ? "task"
      : item.tool === "list_task_activity" ? "task-activity" : "task-attachments";
    return {
      kind: "coordination-inspection",
      scope,
      ...optionalString("taskId", task?.id ?? arguments_?.taskId),
      ...optionalString("taskTitle", task?.title),
    };
  }
  if (item.tool === "list_collaborators") {
    const collaborators = Array.isArray(result?.collaborators) ? result.collaborators : undefined;
    return {
      kind: "coordination-inspection",
      scope: "collaborators",
      ...(collaborators === undefined ? {} : { collaboratorCount: collaborators.length }),
    };
  }
  if (item.tool === "inspect_current_task") {
    const column = recordValue(result?.column);
    return {
      kind: "coordination-inspection",
      scope: "current-task",
      ...optionalString("taskTitle", result?.title),
      ...optionalString("boardId", result?.boardId),
      ...optionalString("columnId", column?.id),
      ...optionalString("columnName", column?.name),
    };
  }
  if (item.tool === "create_child_task") {
    const task = taskIdentity(result?.task);
    return {
      kind: "coordination-child-task",
      task: {
        ...optionalString("id", task?.id),
        ...optionalString("title", task?.title ?? arguments_?.title),
      },
      ...optionalString("columnId", recordValue(result?.task)?.columnId ?? arguments_?.columnId),
    };
  }
  if (item.tool === "add_dependency") {
    const relationship = recordValue(result?.relationship);
    return {
      kind: "coordination-dependency",
      sourceTask: {
        id: stringValue(relationship?.sourceTaskId) ?? run.taskId,
      },
      targetTask: {
        ...optionalString("id", relationship?.targetTaskId ?? arguments_?.targetTaskId),
      },
    };
  }
  if (item.tool !== "move_current_task") return undefined;
  const transition = recordValue(coordinationResult(item.result)?.transition);
  const fromColumnId = stringValue(transition?.fromColumnId);
  const toColumnId = stringValue(transition?.toColumnId) ?? stringValue(arguments_?.destinationColumnId);
  return {
    kind: "coordination-task-move",
    ...(fromColumnId === undefined ? {} : { fromColumnId }),
    ...(toColumnId === undefined ? {} : { toColumnId }),
  };
}

export function coordinationToolSemanticStatus(
  item: { type: string; [key: string]: unknown },
  status: string,
): CoordinationToolSemanticStatus | undefined {
  if (item.type !== "mcp_tool_call" || item.server !== "coordination" || status !== "completed") {
    return undefined;
  }
  return coordinationResult(item.result)?.accepted === false ? "rejected" : undefined;
}

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
  const rejection = rejectionReason(status, result);
  const taskId = stringValue(context?.taskId) ?? stringValue(result?.taskId) ?? currentTaskId;
  if (item.tool === "move_current_task") {
    const from = stringValue(context?.fromColumnId);
    const to = stringValue(context?.toColumnId) ?? stringValue(arguments_?.destinationColumnId);
    return withRejection(
      from !== undefined && to !== undefined
        ? `${taskId}: ${from} → ${to}`
        : `${taskId}: move to ${to ?? "requested column"}`,
      rejection,
    );
  }
  if (item.tool === "add_comment") return withRejection(`${taskId}: comment`, rejection);
  if (item.tool === "inspect_current_task") return `${taskId}: current task inspection`;
  if (item.tool === "create_child_task") {
    const childId = stringValue(recordValue(result?.task)?.id);
    const columnId = stringValue(arguments_?.columnId);
    return withRejection(
      `${taskId}: child ${childId ?? boundedText(arguments_?.title) ?? "task"}${columnId === undefined ? "" : ` in ${columnId}`}`,
      rejection,
    );
  }
  if (item.tool === "add_dependency") {
    return withRejection(
      `${taskId}: dependency on ${stringValue(arguments_?.targetTaskId) ?? "requested task"}`,
      rejection,
    );
  }
  if (item.tool === "report_permission_block") return withRejection(`${taskId}: permission block`, rejection);
  if (item.tool === "inspect_task" || item.tool === "list_task_activity" || item.tool === "list_task_attachments") {
    return `${stringValue(arguments_?.taskId) ?? taskId}: ${item.tool.replaceAll("_", " ")}`;
  }
  if (item.tool === "list_tasks") {
    const boardId = stringValue(arguments_?.boardId) ?? "requested board";
    const columns = Array.isArray(arguments_?.columnIds)
      ? arguments_.columnIds.filter((value): value is string => typeof value === "string").slice(0, 5).join(", ")
      : "requested columns";
    return `${boardId}: tasks in ${columns}`;
  }
  if (item.tool === "summarize_boards") return "Board summaries";
  if (item.tool === "list_collaborators") return "Collaborator directory";
  return undefined;
}

function withRejection(summary: string, rejection: string | undefined): string {
  return rejection === undefined ? summary : `${summary} · Rejected: ${rejection}`;
}

function rejectionReason(status: string, result: Record<string, unknown> | undefined): string | undefined {
  if (status !== "completed" || result?.accepted !== false) return undefined;
  return stringValue(result.reason) ?? "The framework rejected the request.";
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
  if (direct.transition !== undefined || direct.accepted !== undefined || direct.task !== undefined) return direct;
  if (!Array.isArray(direct.content)) return direct;
  for (const entry of direct.content) {
    const parsed = parseJsonRecord(stringValue(recordValue(entry)?.text));
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

function optionalString<Key extends string>(key: Key, value: unknown): { [Property in Key]?: string } {
  const string = stringValue(value);
  return string === undefined ? {} : { [key]: string } as { [Property in Key]?: string };
}

function namedEntity(value: unknown): { id: string; name?: string } | undefined {
  const record = recordValue(value);
  const id = stringValue(record?.id);
  if (id === undefined) return undefined;
  const name = stringValue(record?.name);
  return { id, ...(name === undefined ? {} : { name }) };
}

function taskIdentity(value: unknown): { id?: string; title?: string } | undefined {
  const record = recordValue(value);
  if (record === undefined) return undefined;
  const id = stringValue(record.id);
  const title = stringValue(record.title);
  return id === undefined && title === undefined
    ? undefined
    : { ...optionalString("id", id), ...optionalString("title", title) };
}

function namedEntities(value: unknown): Array<{ id: string; name?: string }> {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const entity = namedEntity(entry);
        return entity === undefined ? [] : [entity];
      })
    : [];
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0) : [];
}

function boundedText(value: unknown): string | undefined {
  const text = stringValue(value);
  return text === undefined ? undefined : text.length <= 80 ? text : `${text.slice(0, 77)}…`;
}
