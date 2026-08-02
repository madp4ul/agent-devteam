import { RelationalCoordinationStore } from "./internal/coordination-store.ts";
import { loadProcessDefinition } from "./internal/process-definition.ts";

export interface StartApplicationOptions {
  processDefinitionPath: string;
  databasePath: string;
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
  type: "task.created" | "task.moved";
  actor: Actor;
  occurredAt: string;
}

export interface TaskView {
  id: string;
  title: string;
  description: string;
  boardId: string;
  columnId: string;
  revision: number;
  activity: TaskActivityView[];
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
    };

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
  #automation: AutomationView;

  private constructor(store: RelationalCoordinationStore, startup: StartupView) {
    this.#store = store;
    this.#startup = startup;
    this.#automation = startup.automation;
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
      return new CoordinationApplication(store, {
        mode: "configuration-error",
        diagnostics: validation.diagnostics,
        automation: { state: "blocked", attemptsMayStart: false },
      });
    }

    const { definition, instructionContents, version } = validation.loaded;
    store.applyDefinition(definition, instructionContents, version);
    return new CoordinationApplication(store, {
      mode: "paused",
      processName: definition.name,
      processDefinitionVersion: version,
      automation: { state: "paused", attemptsMayStart: false },
      boards: store.readBoards(),
    });
  }

  queryStartup(): StartupView {
    return this.#startup;
  }

  queryAutomation(): AutomationView {
    return this.#automation;
  }

  resumeAutomation(): ResumeAutomationResult {
    if (this.#startup.mode === "configuration-error") {
      return {
        accepted: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    this.#store.resumeAutomation();
    this.#automation = { state: "running", attemptsMayStart: true };
    return { accepted: true, automation: this.#automation };
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
    return gated ?? this.#store.createTask(command);
  }

  moveTask(command: MoveTaskCommand): BoardMutationResult {
    const gated = this.configurationErrorRejection();
    return gated ?? this.#store.moveTask(command);
  }

  close(): void {
    this.#store.close();
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
