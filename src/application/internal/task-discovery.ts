import type {
  BoardSummariesQueryResult,
  CollaboratorView,
  CollaboratorsQueryResult,
  ProcessDiagnostic,
  StartupView,
  TaskActivityQueryResult,
  TaskAttachmentsQueryResult,
  TaskInspectionQueryResult,
  TaskOverviewsQuery,
  TaskOverviewsQueryResult,
  TaskView,
} from "../coordination-contract.ts";
import type { CoordinationTaskStore } from "./coordination-store.ts";
import type { ProcessStateStore } from "./process-state-store.ts";

export class TaskDiscovery {
  readonly #processStore: ProcessStateStore;
  readonly #taskStore: CoordinationTaskStore;
  readonly #startup: StartupView;
  readonly #collaborators: CollaboratorView[] | undefined;

  constructor(
    processStore: ProcessStateStore,
    taskStore: CoordinationTaskStore,
    startup: StartupView,
    collaborators?: CollaboratorView[],
  ) {
    this.#processStore = processStore;
    this.#taskStore = taskStore;
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
    const cursor =
      query.cursor === undefined
        ? undefined
        : decodeTaskOverviewCursor(query.cursor, query.boardId, canonicalColumnIds);
    if (query.cursor !== undefined && cursor === undefined) {
      return { available: false, reason: "invalid-cursor" };
    }
    const records = this.#taskStore
      .readTaskOverviewRecords(query.boardId, canonicalColumnIds)
      .filter((record) => cursor === undefined || record.sequence > cursor.taskSequence);
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
              taskSequence: lastRecord.sequence,
            })
          : null,
    };
  }

  queryTaskInspection(taskId: string): TaskInspectionQueryResult {
    const loaded = this.readTask(taskId);
    if (!loaded.available) return loaded;
    const { task } = loaded;
    const board = this.#processStore.readBoards().find((candidate) => candidate.id === task.boardId);
    const column = board?.columns.find((candidate) => candidate.id === task.columnId);
    const overview = this.#taskStore
      .readTaskOverviewRecords(task.boardId, [task.columnId])
      .map((record) => record.task)
      .find((candidate) => candidate.id === task.id);
    if (column === undefined || overview === undefined) {
      return { available: false, reason: "not-found" };
    }
    return {
      available: true,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        boardId: task.boardId,
        column: { id: column.id, name: column.name },
        revision: task.revision,
        comments: task.comments,
        relationships: task.relationships,
        blocking: overview.blocking,
        run: overview.run,
        unresolvedAttention: this.#taskStore.readUnresolvedAttention(task.id),
        onDemand: { activity: true, attachments: true },
      },
    };
  }

  queryTaskActivity(taskId: string): TaskActivityQueryResult {
    const loaded = this.readTask(taskId);
    return loaded.available
      ? { available: true, activity: loaded.task.activity }
      : loaded;
  }

  queryTaskAttachments(taskId: string): TaskAttachmentsQueryResult {
    const loaded = this.readTask(taskId);
    if (!loaded.available) return loaded;
    return { available: true, attachments: this.#taskStore.readTaskAttachments(taskId) };
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
    const task = this.#taskStore.readTask(taskId);
    return task === undefined
      ? { available: false, reason: "not-found" }
      : { available: true, task };
  }
}

interface TaskOverviewCursor {
  boardId: string;
  columnIds: string[];
  taskSequence: number;
}

function encodeTaskOverviewCursor(cursor: TaskOverviewCursor): string {
  return Buffer.from(JSON.stringify({ version: 1, ...cursor }), "utf8").toString("base64url");
}

function decodeTaskOverviewCursor(
  value: string,
  boardId: string,
  columnIds: string[],
): TaskOverviewCursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const candidate = parsed as Record<string, unknown>;
    if (
      candidate.version !== 1 ||
      candidate.boardId !== boardId ||
      !Array.isArray(candidate.columnIds) ||
      candidate.columnIds.some((columnId) => typeof columnId !== "string") ||
      candidate.columnIds.length !== columnIds.length ||
      candidate.columnIds.some((columnId, index) => columnId !== columnIds[index]) ||
      !Number.isInteger(candidate.taskSequence) ||
      (candidate.taskSequence as number) < 1
    ) {
      return undefined;
    }
    return {
      boardId,
      columnIds,
      taskSequence: candidate.taskSequence as number,
    };
  } catch {
    return undefined;
  }
}
