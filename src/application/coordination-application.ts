import {
  openCoordinationPersistence,
  type CoordinationPersistence,
} from "./internal/coordination-persistence.ts";
import { AutomationCoordinator } from "./internal/automation-coordinator.ts";
import type { AutomationProcessContext } from "./internal/automation-coordinator.ts";
import { FRAMEWORK_GUIDANCE } from "./activation-prompt.ts";
import { loadProcessDefinition } from "./internal/process-definition.ts";
import { TaskDiscovery } from "./internal/task-discovery.ts";
import { GitTaskWorkspaceManager, validateTaskWorkspaceConsistency } from "./internal/git-task-workspace.ts";
import type {
  ActiveRunView,
  ActivationRecoveryCommand,
  ActivationRecoveryResult,
  AutomationView,
  ContinuePermissionBlockedActivationCommand,
  ContinueInterruptedTaskCommand,
  ContinueInterruptedTaskResult,
  DismissActivationCommand,
  DismissActivationResult,
  DismissStaleActivationCommand,
  DismissStaleActivationResult,
  InterruptTaskCommand,
  InterruptTaskResult,
  PauseAutomationResult,
  ResumeAutomationResult,
} from "./automation-contract.ts";
import type {
  AgentConversationQueryResult,
  ContinueAgentConversationCommand,
  ContinueAgentConversationResult,
  RetireAgentConversationCommand,
  RetireAgentConversationResult,
  TaskConversationIndexQueryResult,
} from "./conversation-contract.ts";
import type {
  NotificationPolicyView,
  NotificationOccurrenceBatch,
  UpdateNotificationPolicyCommand,
  UpdateNotificationPolicyResult,
} from "./notification-contract.ts";
import type {
  BoardSummariesQueryResult,
  CollaboratorsQueryResult,
  ProcessDiagnostic,
  ProcessValidationResult,
  StartupView,
} from "./process-contract.ts";
import type {
  AttemptTranscriptAccess,
  AttemptTranscriptQueryResult,
  OperatingContextQueryResult,
  StartApplicationOptions,
} from "./runtime-contract.ts";
import type {
  AddTaskCommentCommand,
  AddTaskCommentResult,
  ArchiveCompletedTasksCommand,
  ArchiveCompletedTasksResult,
  ArchivedTaskOverviewsQueryResult,
  ArchiveTaskCommand,
  ArchiveTaskResult,
  BoardMutationResult,
  BoardsQueryResult,
  CreateChildTaskCommand,
  CreateTaskCommand,
  CreateTaskRelationshipCommand,
  EditTaskCommand,
  InertMoveTaskResult,
  MarkUserMentionAddressedCommand,
  MarkUserMentionAddressedResult,
  MoveTaskCommand,
  MoveTaskResult,
  NeedsAttentionQueryResult,
  RemoveTaskRelationshipCommand,
  RemoveTaskRelationshipResult,
  TaskActivityQueryResult,
  TaskAttachmentsQueryResult,
  TaskInspectionQueryResult,
  TaskOverviewView,
  TaskOverviewsQuery,
  TaskOverviewsQueryResult,
  TaskQueryResult,
  TaskRelationshipMutationResult,
  TaskView,
  TaskWorkspaceGitStateQueryResult,
  UnarchiveTaskCommand,
  UnarchiveTaskResult,
  UserTaskInspectionQueryResult,
} from "./task-contract.ts";
import type { UserBoardProjection } from "./user-board-contract.ts";
import type {
  UserRelatedTaskView,
  UserTimelineRelatedTaskView,
  UserTaskDetailQueryResult,
} from "./user-task-detail-contract.ts";

export class CoordinationApplication {
  readonly #persistence: CoordinationPersistence;
  readonly #startup: StartupView;
  readonly #automation: AutomationCoordinator;
  readonly #discovery: TaskDiscovery;
  readonly #workspaceManager: GitTaskWorkspaceManager | undefined;
  readonly #processContext: AutomationProcessContext | undefined;
  readonly #pendingInterruptCommands = new Map<
    string,
    Extract<InterruptTaskResult, { accepted: true }>
  >();

  private constructor(
    persistence: CoordinationPersistence,
    startup: StartupView,
    automation: AutomationCoordinator,
    discovery: TaskDiscovery,
    workspaceManager?: GitTaskWorkspaceManager,
    processContext?: AutomationProcessContext,
  ) {
    this.#persistence = persistence;
    this.#startup = startup;
    this.#automation = automation;
    this.#discovery = discovery;
    this.#workspaceManager = workspaceManager;
    this.#processContext = processContext;
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
      persistence = openCoordinationPersistence(options.databasePath, options.transcriptAccess);
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
    const { process, taskCommands, taskProjections, automation, conversationContextDelivery } = persistence;
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
          conversationContextDelivery,
          startup,
        }),
        new TaskDiscovery(process, taskProjections, automation, startup),
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
            conversationContextDelivery,
            startup,
          }),
          new TaskDiscovery(process, taskProjections, automation, startup),
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
    const processContext: AutomationProcessContext = {
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
    };
    return new CoordinationApplication(
      persistence,
      startup,
      new AutomationCoordinator({
        processStore: process,
        taskProjections,
        automationStore: automation,
        conversationContextDelivery,
        startup,
        ...(options.runtimeDispatch === undefined
          ? {}
          : { runtimeDispatch: options.runtimeDispatch }),
        startingRef: definition.defaultTaskWorkspaceStartingRef,
        processContext,
        ...(options.runtimeDiagnostic === undefined
          ? {}
          : { runtimeDiagnostic: options.runtimeDiagnostic }),
        ...(options.automationClock === undefined ? {} : { clock: options.automationClock }),
        ...(options.transcriptAccess === undefined
          ? {}
          : { transcriptAccess: options.transcriptAccess }),
      }),
      new TaskDiscovery(process, taskProjections, automation, startup, collaborators),
      workspaceManager,
      processContext,
    );
  }

  static configurationError(
    diagnostics: ProcessDiagnostic[],
    transcriptAccess?: AttemptTranscriptAccess,
  ): CoordinationApplication {
    const persistence = openCoordinationPersistence(":memory:", transcriptAccess);
    const { process, taskProjections, automation, conversationContextDelivery } = persistence;
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
        conversationContextDelivery,
        startup,
      }),
      new TaskDiscovery(process, taskProjections, automation, startup),
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

  queryUserBoard(): UserBoardProjection {
    const startup = this.queryStartup();
    const automation = this.queryAutomation();
    if (startup.mode === "configuration-error") {
      return { startup, automation, activeRuns: [], boards: [], attention: [] };
    }
    const summaries = this.queryBoardSummaries();
    if (!summaries.available) {
      return { startup, automation, activeRuns: [], boards: [], attention: [] };
    }
    const attention = this.queryNeedsAttention();
    return {
      startup,
      automation,
      activeRuns: this.queryActiveRuns(),
      boards: summaries.boards.map((board) => ({
        ...board,
        columns: board.columns.map((column) => ({
          ...column,
          tasks: this.readAllColumnTaskOverviews(board.id, column.id),
        })),
      })),
      attention: attention.available ? attention.tasks : [],
    };
  }

  queryTaskOverviews(query: TaskOverviewsQuery): TaskOverviewsQueryResult {
    return this.#discovery.queryTaskOverviews(query);
  }

  private readAllColumnTaskOverviews(boardId: string, columnId: string): TaskOverviewView[] {
    const tasks: TaskOverviewView[] = [];
    let cursor: string | undefined;
    do {
      const page = this.queryTaskOverviews({
        boardId,
        columnIds: [columnId],
        order: "recent-column-entry",
        pageSize: 50,
        ...(cursor === undefined ? {} : { cursor }),
      });
      if (!page.available) throw new Error(`Could not project column ${columnId}`);
      tasks.push(...page.tasks);
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    return tasks;
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

  queryUserTaskDetail(taskId: string): UserTaskDetailQueryResult {
    const loaded = this.queryTask(taskId);
    if (!loaded.available) return loaded;
    const inspection = this.queryTaskInspectionForUser(taskId);
    if (!inspection.available) return inspection;
    const collaborators = this.queryCollaborators();
    const conversationIndex = this.queryTaskConversationIndex(taskId);
    const activeRuns = this.queryActiveRuns();
    return {
      ...loaded,
      inspection: inspection.task,
      relationshipTasks: this.readUserRelatedTasks(loaded.task),
      timelineRelationshipTasks: this.readUserTimelineRelatedTasks(loaded.task),
      activeRun: activeRuns.find((run) => run.taskId === taskId) ?? null,
      activeRuns,
      automation: this.queryAutomation(),
      startup: this.queryStartup(),
      collaborators: collaborators.available ? collaborators.collaborators : [],
      conversations: conversationIndex.available ? conversationIndex.conversations : [],
    };
  }

  private readUserRelatedTasks(task: TaskView): UserRelatedTaskView[] {
    const relatedTaskIds = new Set(task.relationships.map((relationship) => relationship.sourceTaskId === task.id
      ? relationship.targetTaskId
      : relationship.sourceTaskId));
    return [...relatedTaskIds].flatMap((relatedTaskId) => {
      const related = this.queryTask(relatedTaskId);
      const relatedInspection = this.queryTaskInspectionForUser(relatedTaskId);
      if (!related.available || !relatedInspection.available) return [];
      return [{
        id: related.task.id,
        title: related.task.title,
        boardId: related.task.boardId,
        boardName: related.board.name,
        column: relatedInspection.task.column,
        blocking: relatedInspection.task.blocking,
        ...(related.task.archived ? { archived: true as const } : {}),
      }];
    });
  }

  private readUserTimelineRelatedTasks(task: TaskView): UserTimelineRelatedTaskView[] {
    const relatedTaskIds = new Set(task.activity.flatMap((activity) => {
      const relatedTaskId = activity.details.relatedTaskId;
      return relatedTaskId === undefined ? [] : [relatedTaskId];
    }));
    return [...relatedTaskIds].map((relatedTaskId) => {
      const related = this.queryTask(relatedTaskId);
      const inspection = this.queryTaskInspectionForUser(relatedTaskId);
      if (!related.available || !inspection.available) return { id: relatedTaskId, available: false as const };
      return {
        id: relatedTaskId,
        title: related.task.title,
        available: true as const,
        completed: inspection.task.column.id === "completion",
        archived: related.task.archived === true,
      };
    });
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
    return this.#persistence.conversationProjections.readAttemptTranscript(attemptId);
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
    const conversation = await this.#persistence.conversationProjections.readConversation(taskId, conversationId);
    if (conversation === undefined) return { available: false, reason: "not-found" };
    return { available: true, conversation };
  }

  queryTaskConversationIndex(taskId: string): TaskConversationIndexQueryResult {
    if (this.#startup.mode === "configuration-error") {
      return {
        available: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    const conversations = this.#persistence.conversationProjections.readTaskIndex(taskId);
    if (conversations === undefined) {
      return { available: false, reason: "not-found" };
    }
    return {
      available: true,
      conversations,
    };
  }

  continueAgentConversation(command: ContinueAgentConversationCommand): ContinueAgentConversationResult {
    if (this.#startup.mode === "configuration-error") {
      return { accepted: false, reason: "configuration-error", diagnostics: this.#startup.diagnostics };
    }
    const result = this.#persistence.conversationCommands.continue(command);
    if (result.accepted) this.#automation.kick();
    return result;
  }

  retireAgentConversation(command: RetireAgentConversationCommand): RetireAgentConversationResult {
    if (this.#startup.mode === "configuration-error") {
      return { accepted: false, reason: "configuration-error", diagnostics: this.#startup.diagnostics };
    }
    return this.#persistence.conversationCommands.retire(command);
  }

  queryCollaborators(): CollaboratorsQueryResult {
    return this.#discovery.queryCollaborators();
  }

  queryOperatingContext(scope: {
    attemptId?: string;
    taskId: string;
    agentId: string;
  }): OperatingContextQueryResult {
    if (this.#startup.mode === "configuration-error" || this.#processContext === undefined) {
      return {
        available: false,
        reason: "configuration-error",
        ...(this.#startup.mode === "configuration-error" ? { diagnostics: this.#startup.diagnostics } : {}),
      };
    }
    if (scope.attemptId === undefined) return { available: false, reason: "invalid-attempt-scope" };
    const current = this.#persistence.automation.readRunningAttemptScope(scope.attemptId);
    if (
      current === undefined ||
      current.taskId !== scope.taskId ||
      current.agent.id !== scope.agentId
    ) return { available: false, reason: "invalid-attempt-scope" };
    const board = this.#processContext.boards.find(({ id }) => id === current.boardId);
    if (board === undefined) return { available: false, reason: "invalid-attempt-scope" };
    return {
      available: true,
      context: {
        attemptId: scope.attemptId,
        taskId: current.taskId,
        frameworkInstructions: FRAMEWORK_GUIDANCE,
        process: {
          name: this.#processContext.name,
          guidance: this.#processContext.guidance,
          definitionVersion: this.#processContext.definitionVersion,
        },
        board,
        owningAgent: current.agent,
        participants: this.#processContext.collaborators,
      },
    };
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
