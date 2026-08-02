import { RelationalCoordinationStore } from "./internal/coordination-store.ts";
import { GitTaskWorkspaceManager } from "./internal/git-task-workspace.ts";
import { loadProcessDefinition } from "./internal/process-definition.ts";

export interface StartApplicationOptions {
  processDefinitionPath: string;
  databasePath: string;
  runtimeDispatch?: RuntimeDispatchOptions;
}

export interface RuntimeDispatchOptions {
  projectRepositoryPath: string;
  taskWorkspaceRoot: string;
  agentRuntime: AgentRuntime;
}

export interface ProcessDiagnostic {
  file: string;
  line: number;
  column: number;
  invalidValue: unknown;
  rule: string;
  consequence: string;
  correction?: string;
}

export interface ProcessColumnView {
  id: string;
  name: string;
  watchingAgentId: string | null;
  frameworkOwned: boolean;
}

export interface ProcessBoardView {
  id: string;
  name: string;
  guidance: string;
  columns: ProcessColumnView[];
}

export interface Actor {
  kind: "user" | "agent";
  id: string;
}

export interface TaskActivityView {
  id: string;
  type:
    | "task.created"
    | "task.moved"
    | "activation.created"
    | "attempt.started"
    | "attempt.completed";
  actor: Actor | { kind: "framework"; id: "coordination" };
  occurredAt: string;
  details: Record<string, string>;
}

export interface ActivationReasonView {
  type: "column-entry";
  sourceEventId: string;
}

export interface AttemptView {
  id: string;
  status: "running" | "completed";
  workspacePath: string;
  startedAt: string;
  completedAt: string | null;
  outcome: AgentRunOutcome | null;
}

export interface ActivationView {
  id: string;
  targetAgentId: string;
  status: "queued" | "running" | "completed";
  reason: ActivationReasonView;
  attempts: AttemptView[];
}

export interface AgentRunAgent {
  id: string;
  name: string;
  role: string;
  summary: string;
  instructions: string;
}

export interface TaskWorkspaceView {
  path: string;
  startingRef: string;
  commit: string;
}

export interface AgentRunRequest {
  activationId: string;
  agent: AgentRunAgent;
  reason: ActivationReasonView;
  sourceEvent: TaskActivityView;
  task: TaskView;
  workspace: TaskWorkspaceView;
}

export interface AgentRunOutcome {
  status: "completed";
  summary: string;
}

export interface AgentRuntime {
  run(request: AgentRunRequest): Promise<AgentRunOutcome>;
}

export interface TaskView {
  id: string;
  title: string;
  description: string;
  boardId: string;
  columnId: string;
  revision: number;
  activity: TaskActivityView[];
  activations: ActivationView[];
}

export interface BoardColumnView extends ProcessColumnView {
  tasks: TaskView[];
}

export interface BoardView extends Omit<ProcessBoardView, "columns"> {
  columns: BoardColumnView[];
}

export interface PausedStartup {
  mode: "paused";
  processName: string;
  processDefinitionVersion: string;
  automation: {
    state: "paused";
    attemptsMayStart: false;
  };
  boards: ProcessBoardView[];
}

export interface ConfigurationErrorStartup {
  mode: "configuration-error";
  diagnostics: ProcessDiagnostic[];
  automation: {
    state: "blocked";
    attemptsMayStart: false;
  };
}

export type StartupView = PausedStartup | ConfigurationErrorStartup;

export type ProcessValidationResult =
  | { valid: true; processDefinitionVersion: string }
  | { valid: false; diagnostics: ProcessDiagnostic[] };

export type AutomationView =
  | { state: "paused"; attemptsMayStart: false }
  | { state: "running"; attemptsMayStart: true }
  | { state: "blocked"; attemptsMayStart: false };

export type ResumeAutomationResult =
  | { accepted: true; automation: Extract<AutomationView, { state: "running" }> }
  | {
      accepted: false;
      reason: "configuration-error";
      diagnostics: ProcessDiagnostic[];
    }
  | { accepted: false; reason: "runtime-unavailable" };

export type BoardsQueryResult =
  | { available: true; boards: BoardView[] }
  | { available: false; diagnostics: ProcessDiagnostic[] };

export type TaskQueryResult =
  | { available: true; task: TaskView; board: BoardView }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };

export interface CreateTaskCommand {
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  actor: Actor;
  idempotencyKey: string;
}

export interface MoveTaskCommand {
  taskId: string;
  destinationColumnId: string;
  expectedRevision: number;
  actor: Actor;
  idempotencyKey: string;
}

export type BoardMutationResult =
  | { accepted: true; task: TaskView }
  | {
      accepted: false;
      reason: "configuration-error";
      diagnostics: ProcessDiagnostic[];
    }
  | { accepted: false; reason: "not-found" | "invalid-destination" }
  | { accepted: false; reason: "revision-conflict"; currentTask: TaskView };

export class CoordinationApplication {
  readonly #store: RelationalCoordinationStore;
  readonly #startup: StartupView;
  readonly #runtimeDispatch:
    | { agentRuntime: AgentRuntime; workspaceManager: GitTaskWorkspaceManager }
    | undefined;
  readonly #startingRef: string | undefined;
  #automation: AutomationView;
  #automationWork: Promise<void> = Promise.resolve();
  #automationPumpRunning = false;

  private constructor(
    store: RelationalCoordinationStore,
    startup: StartupView,
    runtimeDispatch?: {
      agentRuntime: AgentRuntime;
      workspaceManager: GitTaskWorkspaceManager;
    },
    startingRef?: string,
  ) {
    this.#store = store;
    this.#startup = startup;
    this.#automation = startup.automation;
    this.#runtimeDispatch = runtimeDispatch;
    this.#startingRef = startingRef;
  }

  static async validateProcessDefinition(path: string): Promise<ProcessValidationResult> {
    const result = await loadProcessDefinition(path);
    return result.valid
      ? { valid: true, processDefinitionVersion: result.loaded.version }
      : result;
  }

  static async start(options: StartApplicationOptions): Promise<CoordinationApplication> {
    const validation = await loadProcessDefinition(options.processDefinitionPath);
    const store = RelationalCoordinationStore.open(options.databasePath);
    if (!validation.valid) {
      return new CoordinationApplication(
        store,
        {
          mode: "configuration-error",
          diagnostics: validation.diagnostics,
          automation: { state: "blocked", attemptsMayStart: false },
        },
      );
    }

    const { definition, instructionContents, version } = validation.loaded;
    store.applyDefinition(definition, instructionContents, version);
    const runtimeDispatch =
      options.runtimeDispatch === undefined
        ? undefined
        : {
            agentRuntime: options.runtimeDispatch.agentRuntime,
            workspaceManager: new GitTaskWorkspaceManager(
              options.runtimeDispatch.projectRepositoryPath,
              options.runtimeDispatch.taskWorkspaceRoot,
            ),
          };
    return new CoordinationApplication(
      store,
      {
        mode: "paused",
        processName: definition.name,
        processDefinitionVersion: version,
        automation: { state: "paused", attemptsMayStart: false },
        boards: store.readBoards(),
      },
      runtimeDispatch,
      definition.defaultTaskWorkspaceStartingRef,
    );
  }

  queryStartup(): StartupView {
    return this.#startup;
  }

  queryAutomation(): AutomationView {
    return this.#automation;
  }

  async resumeAutomation(): Promise<ResumeAutomationResult> {
    if (this.#startup.mode === "configuration-error") {
      return {
        accepted: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    if (this.#runtimeDispatch === undefined && this.#store.hasWatchedColumns()) {
      return { accepted: false, reason: "runtime-unavailable" };
    }
    this.#store.resumeAutomation();
    this.#automation = { state: "running", attemptsMayStart: true };
    if (this.#runtimeDispatch !== undefined) {
      let markFirstDispatchStarted: (() => void) | undefined;
      const firstDispatchStarted = new Promise<void>((resolve) => {
        markFirstDispatchStarted = resolve;
      });
      this.#automationPumpRunning = true;
      this.#automationWork = this.runQueuedActivations(() => markFirstDispatchStarted?.()).finally(
        () => {
          this.#automationPumpRunning = false;
        },
      );
      await Promise.race([firstDispatchStarted, this.#automationWork]);
    }
    return { accepted: true, automation: this.#automation };
  }

  async waitForAutomationIdle(): Promise<void> {
    await this.#automationWork;
  }

  queryBoards(): BoardsQueryResult {
    if (this.#startup.mode === "configuration-error") {
      return { available: false, diagnostics: this.#startup.diagnostics };
    }
    return {
      available: true,
      boards: this.#store.readBoards().map((board) => ({
        ...board,
        columns: board.columns.map((column) => ({
          ...column,
          tasks: this.#store.readTasksInColumn(board.id, column.id),
        })),
      })),
    };
  }

  queryTask(taskId: string): TaskQueryResult {
    if (this.#startup.mode === "configuration-error") {
      return {
        available: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    const task = this.#store.readTask(taskId);
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
    const result = gated ?? this.#store.createTask(command);
    if (
      result.accepted &&
      result.task.activations.some((activation) => activation.status === "queued")
    ) {
      this.kickAutomation();
    }
    return result;
  }

  moveTask(command: MoveTaskCommand): BoardMutationResult {
    const gated = this.configurationErrorRejection();
    const result = gated ?? this.#store.moveTask(command);
    if (
      result.accepted &&
      result.task.activations.some((activation) => activation.status === "queued")
    ) {
      this.kickAutomation();
    }
    return result;
  }

  close(): void {
    this.#store.close();
  }

  private async runQueuedActivations(onFirstDispatch: () => void): Promise<void> {
    if (this.#runtimeDispatch === undefined) return;
    let first = true;
    while (this.#automation.state === "running") {
      const runnable = this.#store.readNextRunnableActivation();
      if (runnable === undefined) return;
      const priorWorkspace = this.#store.readTaskWorkspace(runnable.task.id);
      const workspace = await this.#runtimeDispatch.workspaceManager.provision(
        runnable.task.id,
        this.#startingRef ?? "",
        priorWorkspace,
      );
      if (priorWorkspace === undefined) {
        this.#store.saveTaskWorkspace(runnable.task.id, workspace);
      }
      const attemptId = this.#store.startAttempt(runnable.activation.id, workspace.path);
      const currentTask = this.#store.readTask(runnable.task.id);
      if (currentTask === undefined) throw new Error("Runnable task disappeared before dispatch");
      const outcomePromise = this.#runtimeDispatch.agentRuntime.run({
        activationId: runnable.activation.id,
        agent: runnable.agent,
        reason: runnable.activation.reason,
        sourceEvent: runnable.sourceEvent,
        task: currentTask,
        workspace,
      });
      if (first) {
        first = false;
        onFirstDispatch();
      }
      const outcome = await outcomePromise;
      this.#store.completeAttempt(attemptId, outcome);
    }
  }

  private kickAutomation(): void {
    if (
      this.#automation.state !== "running" ||
      this.#runtimeDispatch === undefined ||
      this.#automationPumpRunning
    ) {
      return;
    }
    this.#automationPumpRunning = true;
    this.#automationWork = this.runQueuedActivations(() => {}).finally(() => {
      this.#automationPumpRunning = false;
    });
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
