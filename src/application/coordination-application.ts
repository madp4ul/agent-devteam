import {
  openCoordinationPersistence,
  type CoordinationPersistence,
} from "./internal/coordination-persistence.ts";
import { AutomationCoordinator } from "./internal/automation-coordinator.ts";
import { loadProcessDefinition } from "./internal/process-definition.ts";
import { TaskDiscovery } from "./internal/task-discovery.ts";
import type {
  AddTaskCommentCommand,
  AddTaskCommentResult,
  AutomationView,
  AttemptTranscriptAccess,
  AttemptTranscriptQueryResult,
  BoardMutationResult,
  BoardSummariesQueryResult,
  BoardsQueryResult,
  CollaboratorsQueryResult,
  CreateTaskCommand,
  EditTaskCommand,
  MoveTaskCommand,
  MarkUserMentionAddressedCommand,
  MarkUserMentionAddressedResult,
  NeedsAttentionQueryResult,
  ProcessValidationResult,
  ResumeAutomationResult,
  StartApplicationOptions,
  StartupView,
  TaskActivityQueryResult,
  TaskAttachmentsQueryResult,
  TaskInspectionQueryResult,
  TaskOverviewsQuery,
  TaskOverviewsQueryResult,
  TaskQueryResult,
} from "./coordination-contract.ts";

export * from "./coordination-contract.ts";

export class CoordinationApplication {
  readonly #persistence: CoordinationPersistence;
  readonly #startup: StartupView;
  readonly #automation: AutomationCoordinator;
  readonly #discovery: TaskDiscovery;
  readonly #transcriptAccess: AttemptTranscriptAccess | undefined;

  private constructor(
    persistence: CoordinationPersistence,
    startup: StartupView,
    automation: AutomationCoordinator,
    discovery: TaskDiscovery,
    transcriptAccess?: AttemptTranscriptAccess,
  ) {
    this.#persistence = persistence;
    this.#startup = startup;
    this.#automation = automation;
    this.#discovery = discovery;
    this.#transcriptAccess = transcriptAccess;
  }

  static async validateProcessDefinition(path: string): Promise<ProcessValidationResult> {
    const result = await loadProcessDefinition(path);
    return result.valid
      ? { valid: true, processDefinitionVersion: result.loaded.version }
      : result;
  }

  static async start(options: StartApplicationOptions): Promise<CoordinationApplication> {
    const validation = await loadProcessDefinition(options.processDefinitionPath);
    const persistence = openCoordinationPersistence(options.databasePath);
    const { process, tasks, automation } = persistence;
    if (!validation.valid) {
      const startup: StartupView = {
        mode: "configuration-error",
        diagnostics: validation.diagnostics,
        automation: { state: "blocked", attemptsMayStart: false },
      };
      return new CoordinationApplication(
        persistence,
        startup,
        new AutomationCoordinator({
          processStore: process,
          taskStore: tasks,
          automationStore: automation,
          startup,
        }),
        new TaskDiscovery(process, tasks, startup),
        options.transcriptAccess,
      );
    }

    const { definition, instructionContents, version } = validation.loaded;
    process.applyDefinition(definition, instructionContents, version);
    const boards = process.readBoards();
    const startup: StartupView = {
      mode: "paused",
      processName: definition.name,
      processDefinitionVersion: version,
      automation: { state: "paused", attemptsMayStart: false },
      boards,
    };
    const collaborators = definition.agents.map(({ id, name, summary }) => ({
      id,
      name,
      summary,
    }));
    return new CoordinationApplication(
      persistence,
      startup,
      new AutomationCoordinator({
        processStore: process,
        taskStore: tasks,
        automationStore: automation,
        startup,
        ...(options.runtimeDispatch === undefined
          ? {}
          : { runtimeDispatch: options.runtimeDispatch }),
        startingRef: definition.defaultTaskWorkspaceStartingRef,
        processContext: {
          name: definition.name,
          guidance: definition.coordinationGuidance,
          definitionVersion: version,
          boards,
          collaborators: definition.agents.map(({ id, name, role, summary }) => ({
            id,
            name,
            role,
            summary,
          })),
        },
        ...(options.runtimeDiagnostic === undefined
          ? {}
          : { runtimeDiagnostic: options.runtimeDiagnostic }),
      }),
      new TaskDiscovery(process, tasks, startup, collaborators),
      options.transcriptAccess,
    );
  }

  queryStartup(): StartupView {
    return this.#startup;
  }

  queryAutomation(): AutomationView {
    return this.#automation.query();
  }

  async resumeAutomation(): Promise<ResumeAutomationResult> {
    return this.#automation.resume();
  }

  async waitForAutomationIdle(): Promise<void> {
    await this.#automation.waitForIdle();
  }

  queryBoards(): BoardsQueryResult {
    if (this.#startup.mode === "configuration-error") {
      return { available: false, diagnostics: this.#startup.diagnostics };
    }
    return {
      available: true,
      boards: this.#persistence.process.readBoards().map((board) => ({
        ...board,
        columns: board.columns.map((column) => ({
          ...column,
          tasks: this.#persistence.tasks.readTasksInColumn(board.id, column.id),
        })),
      })),
    };
  }

  queryBoardSummaries(): BoardSummariesQueryResult {
    return this.#discovery.queryBoardSummaries();
  }

  queryTaskOverviews(query: TaskOverviewsQuery): TaskOverviewsQueryResult {
    return this.#discovery.queryTaskOverviews(query);
  }

  queryTaskInspection(taskId: string): TaskInspectionQueryResult {
    return this.#discovery.queryTaskInspection(taskId);
  }

  queryTaskActivity(taskId: string): TaskActivityQueryResult {
    return this.#discovery.queryTaskActivity(taskId);
  }

  queryTaskAttachments(taskId: string): TaskAttachmentsQueryResult {
    return this.#discovery.queryTaskAttachments(taskId);
  }

  async queryAttemptTranscript(attemptId: string): Promise<AttemptTranscriptQueryResult> {
    if (this.#startup.mode === "configuration-error") {
      return {
        available: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    const attempt = this.#persistence.tasks.readAttemptTranscriptReference(attemptId);
    if (attempt === undefined) return { available: false, reason: "not-found" };
    if (attempt.threadId === null || this.#transcriptAccess === undefined) {
      return { available: false, reason: "unavailable" };
    }
    const items = await this.#transcriptAccess.read(attempt.threadId);
    return items === null
      ? { available: false, reason: "unavailable" }
      : { available: true, threadId: attempt.threadId, items };
  }

  queryCollaborators(): CollaboratorsQueryResult {
    return this.#discovery.queryCollaborators();
  }

  queryNeedsAttention(): NeedsAttentionQueryResult {
    if (this.#startup.mode === "configuration-error") {
      return {
        available: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    return { available: true, tasks: this.#persistence.tasks.readNeedsAttention() };
  }

  queryTask(taskId: string): TaskQueryResult {
    if (this.#startup.mode === "configuration-error") {
      return {
        available: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    const task = this.#persistence.tasks.readTask(taskId);
    if (task === undefined) return { available: false, reason: "not-found" };
    const boards = this.queryBoards();
    if (!boards.available) {
      return {
        available: false,
        reason: "configuration-error",
        diagnostics: boards.diagnostics,
      };
    }
    const board = boards.boards.find((candidate) => candidate.id === task.boardId);
    if (board === undefined) return { available: false, reason: "not-found" };
    return { available: true, task, board };
  }

  createTask(command: CreateTaskCommand): BoardMutationResult {
    const gated = this.configurationErrorRejection();
    const result = gated ?? this.#persistence.tasks.createTask(command);
    if (
      result.accepted &&
      result.task.activations.some((activation) => activation.status === "queued")
    ) {
      this.#automation.kick();
    }
    return result;
  }

  editTask(command: EditTaskCommand): BoardMutationResult {
    const gated = this.configurationErrorRejection();
    return gated ?? this.#persistence.tasks.editTask(command);
  }

  moveTask(command: MoveTaskCommand): BoardMutationResult {
    const gated = this.configurationErrorRejection();
    const result = gated ?? this.#persistence.tasks.moveTask(command);
    if (
      result.accepted &&
      result.task.activations.some((activation) => activation.status === "queued")
    ) {
      this.#automation.kick();
    }
    return result;
  }

  addTaskComment(command: AddTaskCommentCommand): AddTaskCommentResult {
    if (this.#startup.mode === "configuration-error") {
      return {
        accepted: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    const result = this.#persistence.tasks.addTaskComment(command);
    if (
      result.accepted &&
      result.task.activations.some((activation) => activation.status === "queued")
    ) {
      this.#automation.kick();
    }
    return result;
  }

  markUserMentionAddressed(
    command: MarkUserMentionAddressedCommand,
  ): MarkUserMentionAddressedResult {
    if (this.#startup.mode === "configuration-error") {
      return {
        accepted: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    return this.#persistence.tasks.markUserMentionAddressed(command);
  }

  close(): void {
    this.#persistence.close();
  }

  private configurationErrorRejection(): BoardMutationResult | undefined {
    if (this.#startup.mode !== "configuration-error") return undefined;
    return {
      accepted: false,
      reason: "configuration-error",
      diagnostics: this.#startup.diagnostics,
    };
  }
}
