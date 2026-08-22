import {
  coordinationToolNames,
  type AttemptTranscriptItem,
  type CoordinationToolName,
  type CoordinationTranscriptDiagnostic,
  type CoordinationTranscriptPresentation,
  type CoordinationTranscriptStatus,
} from "../application/runtime-contract.ts";

type CoordinationTranscriptItem = Extract<AttemptTranscriptItem, { kind: "coordination" }>;

const coordinationTools = new Set<string>(coordinationToolNames);

export function coordinationTranscriptItem(
  item: { type: string; [key: string]: unknown },
  rawStatus: string,
  run: { attemptId: string; taskId: string },
): CoordinationTranscriptItem | undefined {
  if (
    item.type !== "mcp_tool_call" ||
    item.server !== "coordination" ||
    typeof item.tool !== "string" ||
    !coordinationTools.has(item.tool)
  ) {
    return undefined;
  }
  const tool = item.tool as CoordinationToolName;
  const arguments_ = recordValue(item.arguments);
  const result = coordinationResult(item.result);
  const status = semanticStatus(tool, rawStatus, result);
  const projection = coordinationProjection(tool, arguments_, result, status, run);
  const diagnostic = coordinationDiagnostic(status, result, item.error, rawStatus);
  return {
    ...optionalString("id", item.id),
    kind: "coordination",
    tool,
    status,
    ...(projection.summary === undefined ? {} : { summary: projection.summary }),
    presentation: projection.presentation,
    ...(diagnostic === undefined ? {} : { diagnostic }),
    evidence: {
      ...optionalString("rawStatus", item.status),
      ...(item.arguments === undefined ? {} : { arguments: item.arguments }),
      ...(item.result === undefined ? {} : { result: item.result }),
      ...(item.error === undefined ? {} : { error: item.error }),
    },
  };
}

function coordinationProjection(
  tool: CoordinationToolName,
  arguments_: Record<string, unknown> | undefined,
  result: Record<string, unknown> | undefined,
  status: CoordinationTranscriptStatus,
  run: { attemptId: string; taskId: string },
): { presentation: CoordinationTranscriptPresentation; summary?: string } {
  const transition = recordValue(result?.transition);
  const rejection = status === "rejected" ? rejectionMessage(result) : undefined;
  const taskId = stringValue(transition?.taskId) ?? stringValue(result?.taskId) ?? run.taskId;
  if (tool === "add_comment") {
    const body = stringValue(arguments_?.body);
    return projected({
      kind: "coordination-comment",
      ...optionalString("body", body),
      ...optionalString("commentId", result?.commentId),
    }, withRejection(`${taskId}: comment`, rejection));
  }
  if (tool === "inspect_operating_context") {
    const process = recordValue(result?.process);
    const board = recordValue(result?.board);
    const owningAgent = recordValue(result?.owningAgent);
    return projected({
      kind: "coordination-inspection",
      scope: "operating-context",
      attemptId: stringValue(result?.attemptId) ?? run.attemptId,
      taskId: stringValue(result?.taskId) ?? run.taskId,
      ...optionalString("processName", process?.name),
      ...optionalString("boardId", board?.id),
      ...optionalString("boardName", board?.name),
      ...optionalString("owningAgentName", owningAgent?.name),
    });
  }
  if (tool === "summarize_boards") {
    return projected({
      kind: "coordination-inspection",
      scope: "board-summaries",
      boards: namedEntities(result?.boards),
    }, "Board summaries");
  }
  if (tool === "list_tasks") {
    const requestedBoard = stringValue(arguments_?.boardId);
    const requestedColumns = stringValues(arguments_?.columnIds).map((id) => ({ id }));
    const boardId = requestedBoard ?? "requested board";
    const columns = requestedColumns.map(({ id }) => id).slice(0, 5).join(", ");
    return projected({
      kind: "coordination-inspection",
      scope: "tasks",
      ...(requestedBoard === undefined ? {} : { board: { id: requestedBoard } }),
      columns: requestedColumns,
    }, `${boardId}: tasks in ${columns.length === 0 ? "requested columns" : columns}`);
  }
  if (tool === "list_archived_tasks") {
    const tasks = Array.isArray(result?.tasks) ? result.tasks : undefined;
    return projected({
      kind: "coordination-inspection",
      scope: "archived-tasks",
      ...(tasks === undefined ? {} : { taskCount: tasks.length }),
    });
  }
  if (tool === "inspect_task" || tool === "list_task_activity" || tool === "list_task_attachments") {
    const task = recordValue(result?.task);
    const scope = tool === "inspect_task"
      ? "task"
      : tool === "list_task_activity" ? "task-activity" : "task-attachments";
    return projected({
      kind: "coordination-inspection",
      scope,
      ...optionalString("taskId", task?.id ?? arguments_?.taskId),
      ...optionalString("taskTitle", task?.title),
    }, `${stringValue(arguments_?.taskId) ?? taskId}: ${tool.replaceAll("_", " ")}`);
  }
  if (tool === "list_collaborators") {
    const collaborators = Array.isArray(result?.collaborators) ? result.collaborators : undefined;
    return projected({
      kind: "coordination-inspection",
      scope: "collaborators",
      ...(collaborators === undefined ? {} : { collaboratorCount: collaborators.length }),
    }, "Collaborator directory");
  }
  if (tool === "inspect_current_task") {
    const column = recordValue(result?.column);
    return projected({
      kind: "coordination-inspection",
      scope: "current-task",
      ...optionalString("taskTitle", result?.title),
      ...optionalString("boardId", result?.boardId),
      ...optionalString("columnId", column?.id),
      ...optionalString("columnName", column?.name),
    }, `${taskId}: current task inspection`);
  }
  if (tool === "create_child_task") {
    const task = taskIdentity(result?.task);
    const childId = stringValue(recordValue(result?.task)?.id);
    const columnId = stringValue(arguments_?.columnId);
    return projected({
      kind: "coordination-child-task",
      task: {
        ...optionalString("id", task?.id),
        ...optionalString("title", task?.title ?? arguments_?.title),
      },
      ...optionalString("columnId", recordValue(result?.task)?.columnId ?? arguments_?.columnId),
    }, withRejection(
      `${taskId}: child ${childId ?? boundedText(arguments_?.title) ?? "task"}${columnId === undefined ? "" : ` in ${columnId}`}`,
      rejection,
    ));
  }
  if (tool === "add_dependency") {
    const relationship = recordValue(result?.relationship);
    return projected({
      kind: "coordination-dependency",
      sourceTask: {
        id: stringValue(relationship?.sourceTaskId) ?? run.taskId,
      },
      targetTask: {
        ...optionalString("id", relationship?.targetTaskId ?? arguments_?.targetTaskId),
      },
    }, withRejection(
      `${taskId}: dependency on ${stringValue(arguments_?.targetTaskId) ?? "requested task"}`,
      rejection,
    ));
  }
  if (tool === "report_permission_block") {
    const reason = stringValue(arguments_?.summary);
    return projected(
      { kind: "coordination-permission-block", ...optionalString("reason", reason) },
      withRejection(`${taskId}: permission block`, rejection),
    );
  }
  const fromColumnId = stringValue(transition?.fromColumnId);
  const toColumnId = stringValue(transition?.toColumnId) ?? stringValue(arguments_?.destinationColumnId);
  return projected({
    kind: "coordination-task-move",
    ...(fromColumnId === undefined ? {} : { fromColumnId }),
    ...(toColumnId === undefined ? {} : { toColumnId }),
  }, withRejection(
    fromColumnId !== undefined && toColumnId !== undefined
      ? `${taskId}: ${fromColumnId} → ${toColumnId}`
      : `${taskId}: move to ${toColumnId ?? "requested column"}`,
    rejection,
  ));
}

function projected(
  presentation: CoordinationTranscriptPresentation,
  summary?: string,
): { presentation: CoordinationTranscriptPresentation; summary?: string } {
  return { presentation, ...(summary === undefined ? {} : { summary }) };
}

function withRejection(summary: string, rejection: string | undefined): string {
  return rejection === undefined ? summary : `${summary} · Rejected: ${rejection}`;
}

function semanticStatus(
  tool: CoordinationToolName,
  rawStatus: string,
  result: Record<string, unknown> | undefined,
): CoordinationTranscriptStatus {
  if (rawStatus === "running") return "running";
  if (rawStatus !== "completed") return "failed";
  if (result?.accepted === false) return "rejected";
  return requiresAuthoritativeAcceptance(tool) && result?.accepted !== true ? "failed" : "succeeded";
}

function requiresAuthoritativeAcceptance(tool: CoordinationToolName): boolean {
  return tool === "add_comment" ||
    tool === "move_current_task" ||
    tool === "create_child_task" ||
    tool === "add_dependency" ||
    tool === "report_permission_block";
}

function coordinationDiagnostic(
  status: CoordinationTranscriptStatus,
  result: Record<string, unknown> | undefined,
  error: unknown,
  rawStatus: string,
): CoordinationTranscriptDiagnostic | undefined {
  if (status === "rejected") return { kind: "rejection", message: humanizeIdentifier(rejectionMessage(result)) };
  if (status !== "failed") return undefined;
  if (rawStatus === "completed") {
    return { kind: "failure", message: "The coordination call completed without an authoritative outcome." };
  }
  const errorRecord = recordValue(error);
  return {
    kind: "failure",
    message: normalizedCoordinationFailure(stringValue(errorRecord?.message) ?? stringValue(error)),
  };
}

function rejectionMessage(result: Record<string, unknown> | undefined): string {
  return stringValue(result?.reason) ?? "The framework rejected the request.";
}

function normalizedCoordinationFailure(diagnostic: string | undefined): string {
  if (diagnostic === undefined || /^coordination call failed\.?$/iu.test(diagnostic.trim())) {
    return "The coordination call did not complete.";
  }
  return diagnostic.trim().replace(/^failed:\s*/iu, "").replace(/\s+failed\.?$/iu, " did not complete.");
}

function humanizeIdentifier(value: string): string {
  const text = value.replaceAll(/([a-z0-9])([A-Z])/gu, "$1 $2").replaceAll(/[-_]+/gu, " ");
  return text.length === 0 ? value : `${text[0]!.toUpperCase()}${text.slice(1)}`;
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
