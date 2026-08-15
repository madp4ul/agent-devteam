import {
  openCoordinationPersistence,
  type CoordinationPersistence,
} from "./internal/coordination-persistence.ts";
import { AutomationCoordinator } from "./internal/automation-coordinator.ts";
import { loadProcessDefinition } from "./internal/process-definition.ts";
import { TaskDiscovery } from "./internal/task-discovery.ts";
import { GitTaskWorkspaceManager, validateTaskWorkspaceConsistency } from "./internal/git-task-workspace.ts";
import type {
  AddTaskCommentCommand,
  AddTaskCommentResult,
  ActiveRunView,
  ActivationRecoveryCommand,
  ActivationRecoveryResult,
  AutomationView,
  AttemptTranscriptAccess,
  AttemptTranscriptQueryResult,
  AgentConversationQueryResult,
  BoardMutationResult,
  BoardSummariesQueryResult,
  BoardsQueryResult,
  CollaboratorsQueryResult,
  ContinuePermissionBlockedActivationCommand,
  ContinueAgentConversationCommand,
  ContinueAgentConversationResult,
  ContinueInterruptedTaskCommand,
  ContinueInterruptedTaskResult,
  DismissActivationCommand,
  DismissActivationResult,
  DismissStaleActivationCommand,
  DismissStaleActivationResult,
  CreateTaskCommand,
  CreateChildTaskCommand,
  CreateTaskRelationshipCommand,
  RemoveTaskRelationshipCommand,
  RemoveTaskRelationshipResult,
  EditTaskCommand,
  MoveTaskCommand,
  MoveTaskResult,
  InertMoveTaskResult,
  MarkUserMentionAddressedCommand,
  MarkUserMentionAddressedResult,
  InterruptTaskCommand,
  InterruptTaskResult,
  NeedsAttentionQueryResult,
  NotificationPolicyView,
  NotificationOccurrenceBatch,
  UpdateNotificationPolicyCommand,
  UpdateNotificationPolicyResult,
  ProcessDiagnostic,
  ProcessValidationResult,
  ResumeAutomationResult,
  PauseAutomationResult,
  StartApplicationOptions,
  StartupView,
  TaskActivityQueryResult,
  TaskAttachmentsQueryResult,
  TaskConversationIndexQueryResult,
  TaskInspectionQueryResult,
  UserTaskInspectionQueryResult,
  TaskOverviewsQuery,
  TaskOverviewsQueryResult,
  TaskQueryResult,
  TaskWorkspaceGitStateQueryResult,
  TaskRelationshipMutationResult,
  ArchiveTaskCommand,
  ArchiveTaskResult,
  ArchiveCompletedTasksCommand,
  ArchiveCompletedTasksResult,
  ArchivedTaskOverviewsQueryResult,
  UnarchiveTaskCommand,
  UnarchiveTaskResult,
} from "./coordination-contract.ts";

export * from "./coordination-contract.ts";

export class CoordinationApplication {
  readonly #persistence: CoordinationPersistence;
  readonly #startup: StartupView;
  readonly #automation: AutomationCoordinator;
  readonly #discovery: TaskDiscovery;
  readonly #transcriptAccess: AttemptTranscriptAccess | undefined;
  readonly #workspaceManager: GitTaskWorkspaceManager | undefined;
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
    workspaceManager?: GitTaskWorkspaceManager,
  ) {
    this.#persistence = persistence;
    this.#startup = startup;
    this.#automation = automation;
    this.#discovery = discovery;
    this.#transcriptAccess = transcriptAccess;
    this.#workspaceManager = workspaceManager;
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
        new TaskDiscovery(process, taskProjections, automation, startup),
        options.transcriptAccess,
      );
    }

    const { definition, instructionContents, version } = validation.loaded;
    const workspaceManager = options.runtimeDispatch === undefined
      ? undefined
      : new GitTaskWorkspaceManager(
          options.runtimeDispatch.projectRepositoryPath,
          options.runtimeDispatch.taskWorkspaceRoot,
        );
    for (const claim of persistence.taskArchive.readInterruptedClaims()) {
      const workspace = automation.readTaskWorkspace(claim.taskId);
      if (workspace === undefined) {
        persistence.taskArchive.releaseInterruptedClaim(claim.taskId);
        continue;
      }
      if (workspaceManager === undefined) continue;
      const recovery = await workspaceManager.inspectInterruptedArchival(workspace);
      if (recovery === "intact") {
        persistence.taskArchive.releaseInterruptedClaim(claim.taskId);
      } else if (recovery === "removed") {
        persistence.taskArchive.archive(claim.taskId, claim.actor, claim.idempotencyKey);
      }
    }
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
          new TaskDiscovery(process, taskProjections, automation, startup),
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
        ...(options.transcriptAccess === undefined
          ? {}
          : { transcriptAccess: options.transcriptAccess }),
      }),
      new TaskDiscovery(process, taskProjections, automation, startup, collaborators),
      options.transcriptAccess,
      workspaceManager,
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
      new TaskDiscovery(process, taskProjections, automation, startup),
      transcriptAccess,
    );
  }

  queryStartup(): StartupView {
    if (this.#startup.mode === "paused" && this.#startup.processImpact !== undefined) {
      const { processImpact: startupImpact, ...startup } = this.#startup;
      const processImpact = this.#persistence.process.readUnresolvedDefinitionImpact(
        startupImpact.previousVersion,
        startupImpact.currentVersion,
      );
      if (processImpact === undefined) return startup;
      return {
        ...startup,
        processImpact,
      };
    }
    return this.#startup;
  }

  queryAutomation(): AutomationView {
    return this.#automation.query();
  }

  queryNotificationPolicy(): NotificationPolicyView {
    return this.#persistence.notifications.readPolicy();
  }

  updateNotificationPolicy(command: UpdateNotificationPolicyCommand): UpdateNotificationPolicyResult {
    return this.#persistence.notifications.updatePolicy(command);
  }

  queryNotificationOccurrences(afterSequence?: number): NotificationOccurrenceBatch {
    return this.#persistence.notifications.readOccurrences(afterSequence);
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

  dismissActivation(command: DismissActivationCommand): DismissActivationResult {
    if (this.#startup.mode === "configuration-error") {
      return {
        accepted: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    const result = this.#persistence.taskCommands.dismissActivation(command);
    if (result.accepted) this.#automation.kick();
    return result;
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

  queryArchivedTaskOverviews(): ArchivedTaskOverviewsQueryResult {
    return this.#discovery.queryArchivedTaskOverviews();
  }

  queryTaskInspection(taskId: string): TaskInspectionQueryResult {
    return this.#discovery.queryTaskInspection(taskId);
  }

  queryTaskInspectionForUser(taskId: string): UserTaskInspectionQueryResult {
    return this.#discovery.queryTaskInspectionForUser(taskId);
  }

  async queryTaskWorkspaceGitState(taskId: string): Promise<TaskWorkspaceGitStateQueryResult> {
    const inspection = this.queryTaskInspectionForUser(taskId);
    if (!inspection.available) return inspection;
    if (inspection.task.workspace === null) {
      return { available: false, reason: "workspace-not-provisioned" };
    }
    if (this.#workspaceManager === undefined) {
      return { available: false, reason: "git-status-unavailable" };
    }
    try {
      return {
        available: true,
        state: await this.#workspaceManager.inspectGitState(inspection.task.workspace),
      };
    } catch {
      return { available: false, reason: "git-status-unavailable" };
    }
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
    if (this.#persistence.taskProjections.isAttemptArchived(attemptId)) {
      return { available: false, reason: "unavailable" };
    }
    const persisted = this.#persistence.taskProjections.readPersistedAttemptTranscript(attemptId);
    if (persisted !== undefined && attempt.threadId !== null) {
      return { available: true, threadId: attempt.threadId, ...persisted };
    }
    if (attempt.threadId === null || this.#transcriptAccess === undefined) {
      return { available: false, reason: "unavailable" };
    }
    const items = await this.#transcriptAccess.read(attemptId);
    const usage = this.#transcriptAccess.readUsage === undefined
      ? null
      : await this.#transcriptAccess.readUsage(attemptId);
    return items === null
      ? { available: false, reason: "unavailable" }
      : {
          available: true,
          threadId: attempt.threadId,
          items,
          ...(usage === null ? {} : { usage }),
        };
  }

  async queryAgentConversation(
    taskId: string,
    conversationId: string,
  ): Promise<AgentConversationQueryResult> {
    if (this.#startup.mode === "configuration-error") {
      return {
        available: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    const conversation = this.#persistence.taskProjections.readAgentConversation(taskId, conversationId);
    if (conversation === undefined) return { available: false, reason: "not-found" };
    const runs = await Promise.all(
      this.#persistence.taskProjections.readConversationRuns(conversationId).map(async (run) => {
        const transcript = await this.queryAttemptTranscript(run.attempt.id);
        return {
          ...run,
          transcript: transcript.available
            ? {
                available: true as const,
                items: transcript.items,
                ...(transcript.usage === undefined ? {} : { usage: transcript.usage }),
              }
            : { available: false as const },
        };
      }),
    );
    return { available: true, conversation: { ...conversation, runs } };
  }

  queryTaskConversationIndex(taskId: string): TaskConversationIndexQueryResult {
    if (this.#startup.mode === "configuration-error") {
      return {
        available: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    if (!this.#persistence.taskProjections.taskExists(taskId)) {
      return { available: false, reason: "not-found" };
    }
    return {
      available: true,
      conversations: this.#persistence.taskProjections.readTaskConversationIndex(taskId),
    };
  }

  continueAgentConversation(command: ContinueAgentConversationCommand): ContinueAgentConversationResult {
    if (this.#startup.mode === "configuration-error") {
      return { accepted: false, reason: "configuration-error", diagnostics: this.#startup.diagnostics };
    }
    const result = this.#persistence.taskCommands.continueAgentConversation(command);
    if (result.accepted) this.#automation.kick();
    return result;
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

  moveTask(command: MoveTaskCommand): MoveTaskResult {
    const gated = this.configurationErrorRejection();
    const result = gated ?? this.#persistence.taskCommands.moveTask(command);
    if (result.accepted) this.#automation.kick();
    return result;
  }

  resolveInertTaskMove(
    command: MoveTaskCommand,
  ): InertMoveTaskResult | MoveTaskResult | undefined {
    const gated = this.configurationErrorRejection();
    return gated ?? this.#persistence.taskCommands.resolveInertMove(command);
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

  removeTaskRelationship(command: RemoveTaskRelationshipCommand): RemoveTaskRelationshipResult {
    const gated = this.configurationErrorRejection();
    const result = gated ?? this.#persistence.taskCommands.removeTaskRelationship(command);
    if (
      result.accepted &&
      result.sourceTask.activations.some((activation) => activation.status === "queued")
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
    command: ContinuePermissionBlockedActivationCommand,
  ): ActivationRecoveryResult {
    return this.recoverActivation(
      () => this.#persistence.taskCommands.continuePermissionBlockedActivation(command),
    );
  }

  async archiveTask(command: ArchiveTaskCommand): Promise<ArchiveTaskResult> {
    return this.archiveTaskWithEligibility(command, "any-idle-task");
  }

  private async archiveTaskWithEligibility(
    command: ArchiveTaskCommand,
    eligibility: "any-idle-task" | "completed-only",
  ): Promise<ArchiveTaskResult> {
    if (this.#startup.mode === "configuration-error") {
      return { accepted: false, reason: "configuration-error", diagnostics: this.#startup.diagnostics };
    }
    const claim = this.#persistence.taskArchive.claim(command, eligibility);
    if (!claim.claimed) return claim.result;
    const workspace = this.#persistence.automation.readTaskWorkspace(command.taskId);
    if (workspace !== undefined) {
      if (this.#workspaceManager === undefined) {
        const result = { accepted: false as const, reason: "runtime-unavailable" as const };
        this.#persistence.taskArchive.cancelClaim(command, result);
        return result;
      }
      const removal = await this.#workspaceManager.removeForArchival(
        command.taskId,
        workspace,
        command.discardWorkspaceChanges,
      );
      if (!removal.removed) {
        const result = { accepted: false as const, reason: removal.reason };
        this.#persistence.taskArchive.cancelClaim(command, result);
        return result;
      }
    }
    return this.#persistence.taskArchive.archive(command.taskId, command.actor, command.idempotencyKey);
  }

  unarchiveTask(command: UnarchiveTaskCommand): UnarchiveTaskResult {
    if (this.#startup.mode === "configuration-error") {
      return { accepted: false, reason: "configuration-error", diagnostics: this.#startup.diagnostics };
    }
    return this.#persistence.taskArchive.unarchive(
      command.taskId,
      command.actor,
      command.idempotencyKey,
    );
  }

  async archiveCompletedTasks(
    command: ArchiveCompletedTasksCommand,
  ): Promise<ArchiveCompletedTasksResult> {
    if (this.#startup.mode === "configuration-error") {
      return { accepted: false, reason: "configuration-error", diagnostics: this.#startup.diagnostics };
    }
    const prior = this.#persistence.taskArchive.readBulkCommand<ArchiveCompletedTasksResult>(
      command.boardId,
      command.idempotencyKey,
    );
    if (prior !== undefined) return prior;
    const archivedTaskIds: string[] = [];
    const rejected: Extract<ArchiveCompletedTasksResult, { accepted: true }>['rejected'] = [];
    for (const taskId of this.#persistence.taskArchive.completedTaskIds(command.boardId)) {
      const result = await this.archiveTaskWithEligibility({
        taskId,
        actor: command.actor,
        idempotencyKey: `${command.idempotencyKey}:${taskId}`,
      }, "completed-only");
      if (result.accepted) archivedTaskIds.push(taskId);
      else if (result.reason !== "configuration-error") rejected.push({ taskId, reason: result.reason });
    }
    const result = { accepted: true as const, archivedTaskIds, rejected };
    this.#persistence.taskArchive.rememberBulkCommand(command.boardId, command.idempotencyKey, result);
    return result;
  }

  close(): void {
    this.#persistence.close();
  }

  private configurationErrorRejection():
    | Extract<BoardMutationResult, { accepted: false; reason: "configuration-error" }>
    | undefined {
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
