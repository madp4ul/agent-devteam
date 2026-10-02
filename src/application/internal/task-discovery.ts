import type {
  BoardSummariesQueryResult,
  CollaboratorView,
  CollaboratorsQueryResult,
  ProcessDiagnostic,
  StartupView,
} from "../process-contract.ts";
import type {
  TaskActivityQueryResult,
  ArchivedTaskOverviewsQueryResult,
  TaskAttachmentView,
  TaskAttachmentsQueryResult,
  TaskInspectionQueryResult,
  TaskInspectionView,
  TaskParticipantsQueryResult,
  TaskOverviewView,
  UserTaskInspectionQueryResult,
  TaskOverviewsQuery,
  TaskOverviewsQueryResult,
  UserTaskInspectionView,
  TaskView,
} from "../task-contract.ts";
import type { ProcessBoardView } from "../process-contract.ts";
import type { ProcessStateStore } from "./process-state-store.ts";
import type { ActivationSchedulingModule } from "./activation-scheduling-module.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";
import type { TaskHistoryQuery, TaskHistoryQueryResult } from "../history-contract.ts";

export class TaskDiscovery {
  readonly #processStore: ProcessStateStore;
  readonly #taskProjections: TaskProjectionStore;
  readonly #activationScheduling: ActivationSchedulingModule;
  readonly #startup: StartupView;
  readonly #collaborators: CollaboratorView[] | undefined;

  constructor(
    processStore: ProcessStateStore,
    taskProjections: TaskProjectionStore,
    activationScheduling: ActivationSchedulingModule,
    startup: StartupView,
    collaborators?: CollaboratorView[],
  ) {
    this.#processStore = processStore;
    this.#taskProjections = taskProjections;
    this.#activationScheduling = activationScheduling;
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

  queryArchivedTaskOverviews(query?: { pageSize?: number; cursor?: string }): ArchivedTaskOverviewsQueryResult {
    if (this.#startup.mode === "configuration-error") {
      return { available: false, reason: "configuration-error", diagnostics: this.#startup.diagnostics };
    }
    const tasks = this.#taskProjections.readArchivedTaskOverviewRecords().map(({ task }) => task);
    if (query === undefined) return { available: true, tasks };
    const page = metadataPage(tasks, query, "archive");
    return page.available ? { available: true, tasks: page.items, nextCursor: page.nextCursor } : page;
  }

  queryTaskInspection(taskId: string, targetWords?: number): TaskInspectionQueryResult {
    if (targetWords !== undefined && (!Number.isSafeInteger(targetWords) || targetWords < 1)) {
      return { available: false, reason: "invalid-target-words" };
    }
    const result = this.queryTaskInspectionView(taskId, { audience: "agent" });
    if (!result.available || targetWords === undefined) return result;
    const history = this.#taskProjections.history.query({ taskId, targetWords });
    if (!history.available) throw new Error("Validated inspection history could not be projected");
    return { available: true, task: { ...result.task, history: history.history } };
  }

  queryTaskHistory(query: TaskHistoryQuery): TaskHistoryQueryResult {
    if (this.#startup.mode === "configuration-error") {
      return { available: false, reason: "configuration-error", diagnostics: this.#startup.diagnostics };
    }
    const task = this.#taskProjections.readTaskReferences([query.taskId])[0];
    if (task === undefined || (!task.archived && !this.#taskProjections.isTaskInspectableByAgent(query.taskId))) {
      return { available: false, reason: "not-found" };
    }
    return this.#taskProjections.history.query(query);
  }

  queryTaskParticipants(taskId: string): TaskParticipantsQueryResult {
    if (this.#startup.mode === "configuration-error") {
      return { available: false, reason: "configuration-error", diagnostics: this.#startup.diagnostics };
    }
    const task = this.#taskProjections.readTaskReferences([taskId])[0];
    if (task === undefined || (!task.archived && !this.#taskProjections.isTaskInspectableByAgent(taskId))) {
      return { available: false, reason: "not-found" };
    }
    return { available: true, participants: this.#taskProjections.readTaskParticipants(taskId) };
  }

  queryTaskInspectionForUser(taskId: string): UserTaskInspectionQueryResult {
    return this.queryTaskInspectionView(taskId, { audience: "user" });
  }

  queryUserTaskDetailContext(taskId: string):
    | {
        available: true;
        task: TaskView;
        board: ProcessBoardView;
        inspection: UserTaskInspectionView;
        agentInspectable: boolean;
        attachments: TaskAttachmentView[];
      }
    | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
    | { available: false; reason: "not-found" } {
    const loaded = this.readTask(taskId, true, true);
    if (!loaded.available) return loaded;
    const board = this.#processStore.readBoard(loaded.task.boardId, true);
    const overview = this.#taskProjections.readTaskOverviewRecord(taskId, loaded.task.relationships)?.task;
    const column = board?.columns.find((candidate) => candidate.id === loaded.task.columnId);
    if (board === undefined || overview === undefined || column === undefined) {
      return { available: false, reason: "not-found" };
    }
    return {
      available: true,
      task: loaded.task,
      board,
      inspection: this.projectTaskInspection(loaded.task, overview, column, true),
      agentInspectable: loaded.task.archived === true || this.#taskProjections.isTaskInspectableByAgent(taskId),
      attachments: this.#taskProjections.readTaskAttachments(taskId),
    };
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
    const loaded = this.readTask(taskId, includeUnmapped, true, !includeUnmapped);
    if (!loaded.available) return loaded;
    const { task } = loaded;
    const board = includeUnmapped || task.archived || task.columnId === "completion"
      ? this.#processStore.readBoard(task.boardId, true)
      : this.#processStore.readBoard(task.boardId);
    const column = board?.columns.find((candidate) => candidate.id === task.columnId);
    const overview = this.#taskProjections.readTaskOverviewRecord(task.id)?.task;
    if (column === undefined || overview === undefined) {
      return { available: false, reason: "not-found" };
    }
    return {
      available: true,
      task: options.audience === "user"
        ? this.projectTaskInspection(task, overview, column, true)
        : this.projectTaskInspection(task, overview, column, false),
    } as TaskInspectionQueryResult | UserTaskInspectionQueryResult;
  }

  private projectTaskInspection(
    task: TaskView,
    overview: TaskOverviewView,
    column: { id: string; name: string },
    includeWorkspace: true,
  ): UserTaskInspectionView;
  private projectTaskInspection(
    task: TaskView,
    overview: TaskOverviewView,
    column: { id: string; name: string },
    includeWorkspace: false,
  ): TaskInspectionView;
  private projectTaskInspection(
    task: TaskView,
    overview: TaskOverviewView,
    column: { id: string; name: string },
    includeWorkspace: boolean,
  ): TaskInspectionView | UserTaskInspectionView {
    const currentActivation = task.activations.find(
      (activation): activation is typeof activation & { status: "queued" | "running" | "failed" } =>
        activation.status !== "completed" && activation.status !== "dismissed",
    );
    const automationSuspended = overview.automationSuspended;
    const relatedTitles = new Map(this.#taskProjections.readTaskReferences(
      [...new Set(task.relationships.flatMap(({ sourceTaskId, targetTaskId }) => [sourceTaskId, targetTaskId]))],
    ).map(({ id, title }) => [id, title]));
    return {
        id: task.id,
        title: task.title,
        description: task.description,
        boardId: task.boardId,
        column: { id: column.id, name: column.name },
        revision: task.revision,
        ...(task.archived ? { archived: true as const } : {}),
        ...(includeWorkspace ? { comments: task.comments } : {
          history: (this.#taskProjections.history.query({ taskId: task.id }) as Extract<TaskHistoryQueryResult, { available: true }>).history,
        }),
        pinnedComments: task.comments.filter((comment) => comment.pinned),
        relationships: task.relationships.map((relationship) => ({
          ...relationship,
          sourceTaskTitle: relatedTitles.get(relationship.sourceTaskId) ?? relationship.sourceTaskId,
          targetTaskTitle: relatedTitles.get(relationship.targetTaskId) ?? relationship.targetTaskId,
        })),
        participants: this.#taskProjections.readTaskParticipants(task.id),
        waitingOn: overview.waitingOn,
        run: overview.run,
        unresolvedAttention: overview.unresolvedAttention,
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
        ...(includeWorkspace
          ? { workspace: this.#activationScheduling.readTaskWorkspace(task.id) ?? null }
          : {}),
        onDemand: { activity: true, attachments: true },
    } as TaskInspectionView | UserTaskInspectionView;
  }

  queryTaskActivity(taskId: string): TaskActivityQueryResult {
    const loaded = this.readTask(taskId, false, true);
    return loaded.available
      ? { available: true, activity: loaded.task.activity }
      : loaded;
  }

  queryTaskAttachments(taskId: string, query?: { pageSize?: number; cursor?: string }): TaskAttachmentsQueryResult {
    const loaded = this.readTask(taskId, false, true, true);
    if (!loaded.available) return loaded;
    const attachments = this.#taskProjections.readTaskAttachments(taskId);
    if (query === undefined) return { available: true, attachments };
    const page = metadataPage(attachments, query, `attachments:${taskId}`);
    return page.available ? { available: true, attachments: page.items, nextCursor: page.nextCursor } : page;
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
    bounded = false,
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
    const task = this.#taskProjections.readTask(taskId, bounded);
    if (task === undefined) return { available: false, reason: "not-found" };
    return !includeUnmapped && !(includeArchived && task.archived) && !this.#taskProjections.isTaskInspectableByAgent(taskId)
      ? { available: false, reason: "not-found" }
      : { available: true, task };
  }
}

function metadataPage<T>(items: T[], query: { pageSize?: number; cursor?: string }, scope: string):
  | { available: true; items: T[]; nextCursor: string | null }
  | { available: false; reason: "invalid-page-size" | "invalid-cursor" } {
  const pageSize = query.pageSize ?? 20;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return { available: false, reason: "invalid-page-size" };
  let offset = 0;
  if (query.cursor !== undefined) {
    try {
      const value = JSON.parse(Buffer.from(query.cursor, "base64url").toString()) as { scope: string; offset: number };
      if (value.scope !== scope || !Number.isSafeInteger(value.offset) || value.offset < 0) throw new Error("Invalid cursor");
      offset = value.offset;
    } catch { return { available: false, reason: "invalid-cursor" }; }
  }
  return { available: true, items: items.slice(offset, offset + pageSize),
    nextCursor: offset + pageSize < items.length
      ? Buffer.from(JSON.stringify({ scope, offset: offset + pageSize })).toString("base64url") : null };
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
