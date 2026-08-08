import {
  openCoordinationPersistence,
  type CoordinationPersistence,
} from "./internal/coordination-persistence.ts";
import { AutomationCoordinator } from "./internal/automation-coordinator.ts";
import { loadProcessDefinition } from "./internal/process-definition.ts";
import { TaskDiscovery } from "./internal/task-discovery.ts";
import { validateTaskWorkspaceConsistency } from "./internal/git-task-workspace.ts";
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
  CreateChildTaskCommand,
  CreateTaskRelationshipCommand,
  EditTaskCommand,
  MoveTaskCommand,
  MarkUserMentionAddressedCommand,
  MarkUserMentionAddressedResult,
  NeedsAttentionQueryResult,
  ProcessDiagnostic,
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
  TaskRelationshipMutationResult,
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
    let persistence: CoordinationPersistence;
    try {
      persistence = openCoordinationPersistence(options.databasePath);
    } catch (error) {
      return CoordinationApplication.configurationError([
        operationalDiagnostic(
          options.databasePath,
          error,
          "Durable coordination storage must be available and migratable",
          "Startup is blocked without changing or replacing the retained store.",
          "Restore a verified project-state backup or use a compatible application version.",
        ),
      ], options.transcriptAccess);
    }
    const { process, taskCommands, taskProjections, automation } = persistence;
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
          taskProjections,
          automationStore: automation,
          startup,
        }),
        new TaskDiscovery(process, taskProjections, startup),
        options.transcriptAccess,
      );
    }

    const { definition, instructionContents, version } = validation.loaded;
    if (options.runtimeDispatch !== undefined) {
      const diagnostics = await validateTaskWorkspaceConsistency(
        options.runtimeDispatch.projectRepositoryPath,
        options.runtimeDispatch.taskWorkspaceRoot,
        automation.readTaskWorkspaces(),
      );
      if (diagnostics.length > 0) {
        const startup: StartupView = {
          mode: "configuration-error",
          diagnostics,
          automation: { state: "blocked", attemptsMayStart: false },
        };
        return new CoordinationApplication(
          persistence,
          startup,
          new AutomationCoordinator({
            processStore: process,
            taskProjections,
            automationStore: automation,
            startup,
          }),
          new TaskDiscovery(process, taskProjections, startup),
          options.transcriptAccess,
        );
      }
    }
    automation.recoverInterruptedAttempts();
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
        taskProjections,
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
      new TaskDiscovery(process, taskProjections, startup, collaborators),
      options.transcriptAccess,
    );
  }

  static configurationError(
    diagnostics: ProcessDiagnostic[],
    transcriptAccess?: AttemptTranscriptAccess,
  ): CoordinationApplication {
    const persistence = openCoordinationPersistence(":memory:");
    const { process, taskProjections, automation } = persistence;
    const startup: StartupView = {
      mode: "configuration-error",
      diagnostics,
      automation: { state: "blocked", attemptsMayStart: false },
    };
    return new CoordinationApplication(
      persistence,
      startup,
      new AutomationCoordinator({
        processStore: process,
        taskProjections,
        automationStore: automation,
        startup,
      }),
      new TaskDiscovery(process, taskProjections, startup),
      transcriptAccess,
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
          tasks: this.#persistence.taskProjections.readTasksInColumn(board.id, column.id),
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
    const attempt = this.#persistence.taskProjections.readAttemptTranscriptReference(attemptId);
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
    return { available: true, tasks: this.#persistence.taskProjections.readNeedsAttention() };
  }

  queryTask(taskId: string): TaskQueryResult {
    if (this.#startup.mode === "configuration-error") {
      return {
        available: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    const task = this.#persistence.taskProjections.readTask(taskId);
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
    const result = gated ?? this.#persistence.taskCommands.createTask(command);
    if (
      result.accepted &&
      result.task.activations.some((activation) => activation.status === "queued")
    ) {
      this.#automation.kick();
    }
    return result;
  }

  createChildTask(command: CreateChildTaskCommand): BoardMutationResult {
    const gated = this.configurationErrorRejection();
    const result = gated ?? this.#persistence.taskCommands.createChildTask(command);
    if (result.accepted && result.task.activations.some((activation) => activation.status === "queued")) {
      this.#automation.kick();
    }
    return result;
  }

  editTask(command: EditTaskCommand): BoardMutationResult {
    const gated = this.configurationErrorRejection();
    return gated ?? this.#persistence.taskCommands.editTask(command);
  }

  moveTask(command: MoveTaskCommand): BoardMutationResult {
    const gated = this.configurationErrorRejection();
    const result = gated ?? this.#persistence.taskCommands.moveTask(command);
    if (result.accepted) this.#automation.kick();
    return result;
  }

  createTaskRelationship(
    command: CreateTaskRelationshipCommand,
  ): TaskRelationshipMutationResult {
    if (this.#startup.mode === "configuration-error") {
      return {
        accepted: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    const result = this.#persistence.taskCommands.createTaskRelationship(command);
    if (result.accepted && result.sourceTask.activations.some((activation) => activation.status === "queued")) {
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
    const result = this.#persistence.taskCommands.addTaskComment(command);
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
    return this.#persistence.taskCommands.markUserMentionAddressed(command);
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

function operationalDiagnostic(
  file: string,
  error: unknown,
  rule: string,
  consequence: string,
  correction: string,
): ProcessDiagnostic {
  return {
    file,
    line: 1,
    column: 1,
    invalidValue: error instanceof Error ? error.message : String(error),
    rule,
    consequence,
    correction,
  };
}
