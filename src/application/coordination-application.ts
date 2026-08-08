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
  ActiveRunView,
  ActivationRecoveryCommand,
  ActivationRecoveryResult,
  AutomationView,
  AttemptTranscriptAccess,
  AttemptTranscriptQueryResult,
  BoardMutationResult,
  BoardSummariesQueryResult,
  BoardsQueryResult,
  CollaboratorsQueryResult,
  ContinueInterruptedTaskCommand,
  ContinueInterruptedTaskResult,
  DismissStaleActivationCommand,
  DismissStaleActivationResult,
  CreateTaskCommand,
  CreateChildTaskCommand,
  CreateTaskRelationshipCommand,
  EditTaskCommand,
  MoveTaskCommand,
  MarkUserMentionAddressedCommand,
  MarkUserMentionAddressedResult,
  InterruptTaskCommand,
  InterruptTaskResult,
  NeedsAttentionQueryResult,
  ProcessDiagnostic,
  ProcessValidationResult,
  ResumeAutomationResult,
  PauseAutomationResult,
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
  readonly #pendingInterruptCommands = new Map<
    string,
    Extract<InterruptTaskResult, { accepted: true }>
  >();

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
          "Durable coordination storage must be available and writable",
          "Startup is blocked when the current pre-release store cannot be opened or recreated.",
          "Fix storage access, then restart so the current schema can be created.",
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
    automation.recoverInterruptedAttempts(options.automationClock?.now() ?? new Date());
    const processImpact = process.applyDefinition(definition, instructionContents, version);
    const boards = process.readBoards();
    const startup: StartupView = {
      mode: "paused",
      processName: definition.name,
      processDefinitionVersion: version,
      automation: { state: "paused", attemptsMayStart: false },
      boards,
      ...(processImpact === undefined ? {} : { processImpact }),
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
        ...(options.automationClock === undefined ? {} : { clock: options.automationClock }),
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
    if (this.#startup.mode === "paused" && this.#startup.processImpact !== undefined) {
      return {
        ...this.#startup,
        processImpact: this.#persistence.process.readDefinitionImpact(
          this.#startup.processImpact.previousVersion,
          this.#startup.processImpact.currentVersion,
        ),
      };
    }
    return this.#startup;
  }

  queryAutomation(): AutomationView {
    return this.#automation.query();
  }

  queryActiveRuns(): ActiveRunView[] {
    return this.#automation.queryActiveRuns();
  }

  async resumeAutomation(): Promise<ResumeAutomationResult> {
    if (this.#persistence.process.hasStaleActivations()) {
      return { accepted: false, reason: "process-change-approval-required" };
    }
    return this.#automation.resume();
  }

  async resumeWithCurrentProcess(): Promise<ResumeAutomationResult> {
    return this.#automation.resume(() => {
      this.#persistence.process.rebaseCompatibleStaleActivations();
    });
  }

  dismissStaleActivation(
    command: DismissStaleActivationCommand,
  ): DismissStaleActivationResult {
    return this.#persistence.taskCommands.dismissStaleActivation(command);
  }

  pauseAutomation(): PauseAutomationResult {
    return this.#automation.pause();
  }

  interruptTask(command: InterruptTaskCommand): InterruptTaskResult {
    const replay = this.#persistence.automation.readInterruptedCommand(command.idempotencyKey);
    if (replay !== undefined) {
      return { accepted: true, state: "interrupted", confirmed: Promise.resolve() };
    }
    const pending = this.#pendingInterruptCommands.get(command.idempotencyKey);
    if (pending !== undefined) return pending;
    if (this.#persistence.taskProjections.readTask(command.taskId) === undefined) {
      return { accepted: false, reason: "not-found" };
    }
    const result = this.#automation.interruptTask(
      command.taskId,
      command.actor,
      command.idempotencyKey,
    );
    if (!result.accepted) return result;
    const accepted = {
      accepted: true as const,
      state: result.state,
      confirmed: result.confirmed.finally(() => {
        this.#pendingInterruptCommands.delete(command.idempotencyKey);
      }),
    };
    this.#pendingInterruptCommands.set(command.idempotencyKey, accepted);
    return accepted;
  }

  continueInterruptedTask(
    command: ContinueInterruptedTaskCommand,
  ): ContinueInterruptedTaskResult {
    if (this.#persistence.taskProjections.readTask(command.taskId) === undefined) {
      return { accepted: false, reason: "not-found" };
    }
    const activationId = this.#persistence.automation.continueInterruptedTask(
      command.taskId,
      command.message,
      command.idempotencyKey,
      command.actor,
    );
    if (activationId === undefined) return { accepted: false, reason: "not-suspended" };
    this.#automation.kick();
    return { accepted: true, activationId };
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

  queryTaskInspectionForUser(taskId: string): TaskInspectionQueryResult {
    return this.#discovery.queryTaskInspection(taskId, true);
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
    const processBoard = this.#persistence.process.readBoard(task.boardId, true);
    if (processBoard === undefined) return { available: false, reason: "not-found" };
    const board = {
      ...processBoard,
      columns: processBoard.columns.map((column) => ({
        ...column,
        tasks: this.#persistence.taskProjections.readTasksInColumn(processBoard.id, column.id),
      })),
    };
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

  retryFailedActivation(command: ActivationRecoveryCommand): ActivationRecoveryResult {
    return this.recoverActivation(() => this.#persistence.taskCommands.retryFailedActivation(command));
  }

  dismissFailedActivation(command: ActivationRecoveryCommand): ActivationRecoveryResult {
    return this.recoverActivation(() => this.#persistence.taskCommands.dismissFailedActivation(command));
  }

  continuePermissionBlockedActivation(
    command: ActivationRecoveryCommand,
  ): ActivationRecoveryResult {
    return this.recoverActivation(
      () => this.#persistence.taskCommands.continuePermissionBlockedActivation(command),
    );
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

  private recoverActivation(operation: () => ActivationRecoveryResult): ActivationRecoveryResult {
    if (this.#startup.mode === "configuration-error") {
      return {
        accepted: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    const result = operation();
    if (result.accepted) this.#automation.kick();
    return result;
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
