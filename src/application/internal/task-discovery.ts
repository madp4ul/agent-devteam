import type {
  BoardSummariesQueryResult,
  CollaboratorView,
  CollaboratorsQueryResult,
  ProcessDiagnostic,
  StartupView,
  TaskActivityQueryResult,
  ArchivedTaskOverviewsQueryResult,
  TaskAttachmentsQueryResult,
  TaskInspectionQueryResult,
  UserTaskInspectionQueryResult,
  TaskOverviewsQuery,
  TaskOverviewsQueryResult,
  TaskView,
} from "../coordination-contract.ts";
import type { ProcessStateStore } from "./process-state-store.ts";
import type { AutomationStateStore } from "./automation-state-store.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";

export class TaskDiscovery {
  readonly #processStore: ProcessStateStore;
  readonly #taskProjections: TaskProjectionStore;
  readonly #automationStore: AutomationStateStore;
  readonly #startup: StartupView;
  readonly #collaborators: CollaboratorView[] | undefined;

  constructor(
    processStore: ProcessStateStore,
    taskProjections: TaskProjectionStore,
    automationStore: AutomationStateStore,
    startup: StartupView,
    collaborators?: CollaboratorView[],
  ) {
    this.#processStore = processStore;
    this.#taskProjections = taskProjections;
    this.#automationStore = automationStore;
    this.#startup = startup;
    this.#collaborators = collaborators;
  }

  queryBoardSummaries(): BoardSummariesQueryResult {
    if (this.#startup.mode === "configuration-error") {
      return {
        available: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    return { available: true, boards: this.#processStore.readBoardSummaries() };
  }

  queryTaskOverviews(query: TaskOverviewsQuery): TaskOverviewsQueryResult {
    if (this.#startup.mode === "configuration-error") {
      return {
        available: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    if (query.columnIds.length === 0) {
      return { available: false, reason: "columns-required" };
    }
    if (new Set(query.columnIds).size !== query.columnIds.length) {
      return { available: false, reason: "duplicate-column" };
    }
    const board = this.#processStore.readBoards().find((candidate) => candidate.id === query.boardId);
    if (board === undefined) {
      return { available: false, reason: "board-not-found" };
    }
    const missingColumnId = query.columnIds.find(
      (columnId) => !board.columns.some((column) => column.id === columnId),
    );
    if (missingColumnId !== undefined) {
      return { available: false, reason: "column-not-found", columnId: missingColumnId };
    }
    const pageSize = query.pageSize ?? 20;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      return { available: false, reason: "invalid-page-size" };
    }
    const canonicalColumnIds = board.columns
      .filter((column) => query.columnIds.includes(column.id))
      .map((column) => column.id);
    const order = query.order ?? "task-sequence";
    const cursor =
      query.cursor === undefined
        ? undefined
        : decodeTaskOverviewCursor(query.cursor, query.boardId, canonicalColumnIds, order);
    if (query.cursor !== undefined && cursor === undefined) {
      return { available: false, reason: "invalid-cursor" };
    }
    const records = this.#taskProjections
      .readTaskOverviewRecords(query.boardId, canonicalColumnIds)
      .sort((left, right) => order === "recent-column-entry"
        ? right.columnEntrySequence - left.columnEntrySequence
        : left.sequence - right.sequence)
      .filter((record) => cursor === undefined || (order === "recent-column-entry"
        ? record.columnEntrySequence < cursor.columnEntrySequence
        : record.sequence > cursor.taskSequence));
    const page = records.slice(0, pageSize);
    const lastRecord = page.at(-1);
    return {
      available: true,
      tasks: page.map((record) => record.task),
      nextCursor:
        records.length > pageSize && lastRecord !== undefined
          ? encodeTaskOverviewCursor({
              boardId: query.boardId,
              columnIds: canonicalColumnIds,
              order,
              taskSequence: lastRecord.sequence,
              columnEntrySequence: lastRecord.columnEntrySequence,
            })
          : null,
    };
  }

  queryArchivedTaskOverviews(): ArchivedTaskOverviewsQueryResult {
    if (this.#startup.mode === "configuration-error") {
      return { available: false, reason: "configuration-error", diagnostics: this.#startup.diagnostics };
    }
    return { available: true, tasks: this.#taskProjections.readArchivedTaskOverviewRecords().map(({ task }) => task) };
  }

  queryTaskInspection(taskId: string): TaskInspectionQueryResult {
    return this.queryTaskInspectionView(taskId, { audience: "agent" });
  }

  queryTaskInspectionForUser(taskId: string): UserTaskInspectionQueryResult {
    return this.queryTaskInspectionView(taskId, { audience: "user" });
  }

  private queryTaskInspectionView(
    taskId: string,
    options: { audience: "agent" },
  ): TaskInspectionQueryResult;
  private queryTaskInspectionView(
    taskId: string,
    options: { audience: "user" },
  ): UserTaskInspectionQueryResult;
  private queryTaskInspectionView(
    taskId: string,
    options: { audience: "agent" | "user" },
  ): TaskInspectionQueryResult | UserTaskInspectionQueryResult {
    const includeUnmapped = options.audience === "user";
    const loaded = this.readTask(taskId, includeUnmapped, true);
    if (!loaded.available) return loaded;
    const { task } = loaded;
    const board = includeUnmapped || task.archived || task.columnId === "completion"
      ? this.#processStore.readBoard(task.boardId, true)
      : this.#processStore.readBoard(task.boardId);
    const column = board?.columns.find((candidate) => candidate.id === task.columnId);
    const overview = (task.archived
      ? this.#taskProjections.readArchivedTaskOverviewRecords()
      : this.#taskProjections.readTaskOverviewRecords(task.boardId, [task.columnId]))
      .map((record) => record.task)
      .find((candidate) => candidate.id === task.id);
    if (column === undefined || overview === undefined) {
      return { available: false, reason: "not-found" };
    }
    const currentActivation = task.activations.find(
      (activation): activation is typeof activation & { status: "queued" | "running" | "failed" } =>
        activation.status !== "completed" && activation.status !== "dismissed",
    );
    const automationSuspended = this.#taskProjections.isTaskAutomationSuspended(task.id);
    return {
      available: true,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        boardId: task.boardId,
        column: { id: column.id, name: column.name },
        revision: task.revision,
        ...(task.archived ? { archived: true as const } : {}),
        comments: task.comments,
        relationships: task.relationships,
        blocking: overview.blocking,
        run: overview.run,
        unresolvedAttention: this.#taskProjections.readUnresolvedAttention(task.id),
        currentActivation:
          currentActivation === undefined
            ? null
            : {
                id: currentActivation.id,
                targetAgentId: currentActivation.targetAgentId,
                state: automationSuspended && currentActivation.status === "queued"
                  ? "interrupted" as const
                  : currentActivation.status,
                model: currentActivation.model,
                reasoningEffort: currentActivation.reasoningEffort,
              },
        automationSuspended,
        ...(options.audience === "user"
          ? { workspace: this.#automationStore.readTaskWorkspace(task.id) ?? null }
          : {}),
        onDemand: { activity: true, attachments: true },
      },
    };
  }

  queryTaskActivity(taskId: string): TaskActivityQueryResult {
    const loaded = this.readTask(taskId, false, true);
    return loaded.available
      ? { available: true, activity: loaded.task.activity }
      : loaded;
  }

  queryTaskAttachments(taskId: string): TaskAttachmentsQueryResult {
    const loaded = this.readTask(taskId, false, true);
    if (!loaded.available) return loaded;
    return { available: true, attachments: this.#taskProjections.readTaskAttachments(taskId) };
  }

  queryCollaborators(): CollaboratorsQueryResult {
    if (this.#startup.mode === "configuration-error" || this.#collaborators === undefined) {
      return {
        available: false,
        reason: "configuration-error",
        diagnostics:
          this.#startup.mode === "configuration-error" ? this.#startup.diagnostics : [],
      };
    }
    return { available: true, collaborators: this.#collaborators };
  }

  private readTask(
    taskId: string,
    includeUnmapped = false,
    includeArchived = false,
  ):
    | { available: true; task: TaskView }
    | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
    | { available: false; reason: "not-found" } {
    if (this.#startup.mode === "configuration-error") {
      return {
        available: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    const task = this.#taskProjections.readTask(taskId);
    if (task === undefined) return { available: false, reason: "not-found" };
    return !includeUnmapped && !(includeArchived && task.archived) && !this.#taskProjections.isTaskInspectableByAgent(taskId)
      ? { available: false, reason: "not-found" }
      : { available: true, task };
  }
}

interface TaskOverviewCursor {
  boardId: string;
  columnIds: string[];
  order: NonNullable<TaskOverviewsQuery["order"]>;
  taskSequence: number;
  columnEntrySequence: number;
}

function encodeTaskOverviewCursor(cursor: TaskOverviewCursor): string {
  return Buffer.from(JSON.stringify({ version: 2, ...cursor }), "utf8").toString("base64url");
}

function decodeTaskOverviewCursor(
  value: string,
  boardId: string,
  columnIds: string[],
  order: NonNullable<TaskOverviewsQuery["order"]>,
): TaskOverviewCursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const candidate = parsed as Record<string, unknown>;
    if (
      candidate.version !== 2 ||
      candidate.boardId !== boardId ||
      candidate.order !== order ||
      !Array.isArray(candidate.columnIds) ||
      candidate.columnIds.some((columnId) => typeof columnId !== "string") ||
      candidate.columnIds.length !== columnIds.length ||
      candidate.columnIds.some((columnId, index) => columnId !== columnIds[index]) ||
      !Number.isInteger(candidate.taskSequence) ||
      (candidate.taskSequence as number) < 1 ||
      !Number.isInteger(candidate.columnEntrySequence) ||
      (candidate.columnEntrySequence as number) < 1
    ) {
      return undefined;
    }
    return {
      boardId,
      columnIds,
      order,
      taskSequence: candidate.taskSequence as number,
      columnEntrySequence: candidate.columnEntrySequence as number,
    };
  } catch {
    return undefined;
  }
}
