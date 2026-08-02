import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type {
  Actor,
  BoardMutationResult,
  CreateTaskCommand,
  MoveTaskCommand,
  ProcessBoardView,
  TaskActivityView,
  TaskView,
} from "../coordination-application.ts";
import type {
  AgentInstructionContent,
  ProcessDefinition,
} from "./process-definition.ts";

export class RelationalCoordinationStore {
  readonly #database: DatabaseSync;

  private constructor(database: DatabaseSync) {
    this.#database = database;
  }

  static open(path: string): RelationalCoordinationStore {
    const database = new DatabaseSync(path);
    database.exec("PRAGMA foreign_keys = ON");
    database.exec(`
      CREATE TABLE IF NOT EXISTS runtime (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        process_name TEXT NOT NULL,
        definition_version TEXT NOT NULL,
        automation_state TEXT NOT NULL CHECK (automation_state IN ('paused', 'running'))
      );
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        summary TEXT NOT NULL,
        instructions_path TEXT NOT NULL,
        instructions_content TEXT NOT NULL,
        applied INTEGER NOT NULL CHECK (applied IN (0, 1))
      );
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        guidance TEXT NOT NULL,
        position INTEGER NOT NULL UNIQUE,
        applied INTEGER NOT NULL CHECK (applied IN (0, 1))
      );
      CREATE TABLE IF NOT EXISTS columns (
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        position INTEGER NOT NULL,
        watching_agent_id TEXT REFERENCES agents(id),
        framework_owned INTEGER NOT NULL CHECK (framework_owned IN (0, 1)),
        applied INTEGER NOT NULL CHECK (applied IN (0, 1)),
        PRIMARY KEY (board_id, id),
        UNIQUE (board_id, position)
      );
      CREATE TABLE IF NOT EXISTS task_numbers (
        number INTEGER PRIMARY KEY AUTOINCREMENT
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL,
        column_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        FOREIGN KEY (board_id, column_id) REFERENCES columns(board_id, id)
      );
      CREATE TABLE IF NOT EXISTS task_activity (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('task.created', 'task.moved')),
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'agent')),
        actor_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS command_responses (
        command_type TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        response_json TEXT NOT NULL,
        PRIMARY KEY (command_type, idempotency_key)
      );
    `);
    return new RelationalCoordinationStore(database);
  }

  applyDefinition(
    definition: ProcessDefinition,
    instructions: AgentInstructionContent[],
    version: string,
  ): void {
    const instructionByAgent = new Map(
      instructions.map((instruction) => [instruction.agentId, instruction.content]),
    );
    this.transaction(() => {
      this.#database.exec(`
        UPDATE columns SET applied = 0, position = position + 100000;
        UPDATE boards SET applied = 0, position = position + 100000;
        UPDATE agents SET applied = 0;
        DELETE FROM runtime;
      `);
      this.#database
        .prepare("INSERT INTO runtime VALUES (1, ?, ?, 'paused')")
        .run(definition.name, version);

      const insertAgent = this.#database.prepare(
        `INSERT INTO agents VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           role = excluded.role,
           summary = excluded.summary,
           instructions_path = excluded.instructions_path,
           instructions_content = excluded.instructions_content,
           applied = 1`,
      );
      for (const agent of definition.agents) {
        insertAgent.run(
          agent.id,
          agent.name,
          agent.role,
          agent.summary,
          agent.instructions,
          instructionByAgent.get(agent.id) ?? "",
        );
      }

      const insertBoard = this.#database.prepare(`
        INSERT INTO boards VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          guidance = excluded.guidance,
          position = excluded.position,
          applied = 1
      `);
      const insertColumn = this.#database.prepare(
        `INSERT INTO columns VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(board_id, id) DO UPDATE SET
           name = excluded.name,
           position = excluded.position,
           watching_agent_id = excluded.watching_agent_id,
           framework_owned = excluded.framework_owned,
           applied = 1`,
      );
      definition.boards.forEach((board, boardPosition) => {
        insertBoard.run(board.id, board.name, board.guidance, boardPosition);
        board.columns.forEach((column, columnPosition) => {
          insertColumn.run(
            board.id,
            column.id,
            column.name,
            columnPosition,
            column.watchingAgent ?? null,
            0,
          );
        });
        insertColumn.run(
          board.id,
          "completion",
          "Completion",
          board.columns.length,
          null,
          1,
        );
      });
    });
  }

  resumeAutomation(): void {
    this.#database
      .prepare("UPDATE runtime SET automation_state = 'running' WHERE singleton = 1")
      .run();
  }

  readBoards(): ProcessBoardView[] {
    const boardRows = this.#database
      .prepare("SELECT id, name, guidance FROM boards WHERE applied = 1 ORDER BY position")
      .all() as Array<{ id: string; name: string; guidance: string }>;
    const selectColumns = this.#database.prepare(`
      SELECT id, name, watching_agent_id, framework_owned
      FROM columns
      WHERE board_id = ? AND applied = 1
      ORDER BY position
    `);
    return boardRows.map((board) => ({
      id: board.id,
      name: board.name,
      guidance: board.guidance,
      columns: (
        selectColumns.all(board.id) as Array<{
          id: string;
          name: string;
          watching_agent_id: string | null;
          framework_owned: number;
        }>
      ).map((column) => ({
        id: column.id,
        name: column.name,
        watchingAgentId: column.watching_agent_id,
        frameworkOwned: column.framework_owned === 1,
      })),
    }));
  }

  readTask(taskId: string): TaskView | undefined {
    const row = this.#database
      .prepare(
        "SELECT id, title, description, board_id, column_id, revision FROM tasks WHERE id = ?",
      )
      .get(taskId) as
      | {
          id: string;
          title: string;
          description: string;
          board_id: string;
          column_id: string;
          revision: number;
        }
      | undefined;
    if (row === undefined) return undefined;
    const activity = this.#database
      .prepare(
        `SELECT id, type, actor_kind, actor_id, occurred_at
         FROM task_activity
         WHERE task_id = ?
         ORDER BY rowid`,
      )
      .all(taskId) as Array<{
      id: string;
      type: TaskActivityView["type"];
      actor_kind: Actor["kind"];
      actor_id: string;
      occurred_at: string;
    }>;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      boardId: row.board_id,
      columnId: row.column_id,
      revision: row.revision,
      activity: activity.map((event) => ({
        id: event.id,
        type: event.type,
        actor: { kind: event.actor_kind, id: event.actor_id },
        occurredAt: event.occurred_at,
      })),
    };
  }

  readTasksInColumn(boardId: string, columnId: string): TaskView[] {
    const rows = this.#database
      .prepare("SELECT id FROM tasks WHERE board_id = ? AND column_id = ? ORDER BY id")
      .all(boardId, columnId) as Array<{ id: string }>;
    return rows.flatMap((row) => {
      const task = this.readTask(row.id);
      return task === undefined ? [] : [task];
    });
  }

  createTask(command: CreateTaskCommand): BoardMutationResult {
    return this.transaction(() => {
      const prior = this.readCommandResponse("create-task", command.idempotencyKey);
      if (prior !== undefined) return prior;
      const destination = this.#database
        .prepare("SELECT 1 FROM columns WHERE board_id = ? AND id = ? AND applied = 1")
        .get(command.boardId, command.columnId);
      if (destination === undefined) {
        return { accepted: false, reason: "invalid-destination" };
      }

      const sequence = this.#database.prepare("INSERT INTO task_numbers DEFAULT VALUES").run();
      const taskId = `T-${String(sequence.lastInsertRowid).padStart(4, "0")}`;
      this.#database
        .prepare(
          "INSERT INTO tasks (id, board_id, column_id, title, description, revision) VALUES (?, ?, ?, ?, ?, 1)",
        )
        .run(
          taskId,
          command.boardId,
          command.columnId,
          command.title,
          command.description,
        );
      this.appendTaskActivity(taskId, "task.created", command.actor);
      const task = this.readTask(taskId);
      if (task === undefined) throw new Error("Created task could not be read back");
      const result: BoardMutationResult = { accepted: true, task };
      this.storeCommandResponse("create-task", command.idempotencyKey, result);
      return result;
    });
  }

  moveTask(command: MoveTaskCommand): BoardMutationResult {
    return this.transaction(() => {
      const prior = this.readCommandResponse("move-task", command.idempotencyKey);
      if (prior !== undefined) return prior;
      const currentTask = this.readTask(command.taskId);
      if (currentTask === undefined) return { accepted: false, reason: "not-found" };
      if (currentTask.revision !== command.expectedRevision) {
        return { accepted: false, reason: "revision-conflict", currentTask };
      }
      const destination = this.#database
        .prepare("SELECT 1 FROM columns WHERE board_id = ? AND id = ? AND applied = 1")
        .get(currentTask.boardId, command.destinationColumnId);
      if (destination === undefined) {
        return { accepted: false, reason: "invalid-destination" };
      }

      this.#database
        .prepare("UPDATE tasks SET column_id = ?, revision = revision + 1 WHERE id = ?")
        .run(command.destinationColumnId, command.taskId);
      this.appendTaskActivity(command.taskId, "task.moved", command.actor);
      const task = this.readTask(command.taskId);
      if (task === undefined) throw new Error("Moved task could not be read back");
      const result: BoardMutationResult = { accepted: true, task };
      this.storeCommandResponse("move-task", command.idempotencyKey, result);
      return result;
    });
  }

  close(): void {
    this.#database.close();
  }

  private transaction<Result>(operation: () => Result): Result {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  private appendTaskActivity(
    taskId: string,
    type: TaskActivityView["type"],
    actor: Actor,
  ): void {
    this.#database
      .prepare("INSERT INTO task_activity VALUES (?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), taskId, type, actor.kind, actor.id, new Date().toISOString());
  }

  private readCommandResponse(
    commandType: string,
    idempotencyKey: string,
  ): BoardMutationResult | undefined {
    const row = this.#database
      .prepare(
        "SELECT response_json FROM command_responses WHERE command_type = ? AND idempotency_key = ?",
      )
      .get(commandType, idempotencyKey) as { response_json: string } | undefined;
    return row === undefined
      ? undefined
      : (JSON.parse(row.response_json) as BoardMutationResult);
  }

  private storeCommandResponse(
    commandType: string,
    idempotencyKey: string,
    result: BoardMutationResult,
  ): void {
    this.#database
      .prepare("INSERT INTO command_responses VALUES (?, ?, ?)")
      .run(commandType, idempotencyKey, JSON.stringify(result));
  }
}
