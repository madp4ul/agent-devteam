import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type {
  ActivationView,
  AddTaskCommentCommand,
  AddTaskCommentResult,
  Actor,
  AgentRunAgent,
  AgentRunOutcome,
  BoardMutationResult,
  CreateTaskCommand,
  MoveTaskCommand,
  ProcessBoardView,
  TaskActivityView,
  TaskWorkspaceView,
  TaskView,
} from "../coordination-application.ts";
import type {
  AgentInstructionContent,
  ProcessDefinition,
} from "./process-definition.ts";

const ACTIVATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS activations (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    target_agent_id TEXT NOT NULL REFERENCES agents(id),
    reason_type TEXT NOT NULL CHECK (reason_type IN ('column-entry')),
    source_activity_id TEXT NOT NULL UNIQUE REFERENCES activity_ledger(id),
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    created_at TEXT NOT NULL
  );
`;

const ATTEMPTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    activation_id TEXT NOT NULL REFERENCES activations(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    workspace_path TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    outcome_status TEXT CHECK (outcome_status IN ('completed', 'failed')),
    outcome_summary TEXT,
    thread_id TEXT
  );
`;

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
      CREATE TABLE IF NOT EXISTS activity_ledger (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (
          type IN (
            'task.created',
            'task.moved',
            'activation.created',
            'attempt.started',
            'attempt.completed'
          )
        ),
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'agent', 'framework')),
        actor_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        details_json TEXT NOT NULL
      );
      ${ACTIVATIONS_TABLE_SQL}
      CREATE TABLE IF NOT EXISTS task_workspaces (
        task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
        path TEXT NOT NULL UNIQUE,
        starting_ref TEXT NOT NULL,
        commit_id TEXT NOT NULL
      );
      ${ATTEMPTS_TABLE_SQL}
      CREATE TABLE IF NOT EXISTS task_comments (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
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
    migrateFailedRunOutcomes(database);
    const attemptColumns = database.prepare("PRAGMA table_info(attempts)").all() as Array<{
      name: string;
    }>;
    if (!attemptColumns.some((column) => column.name === "thread_id")) {
      database.exec("ALTER TABLE attempts ADD COLUMN thread_id TEXT");
    }
    database.exec(`
      INSERT OR IGNORE INTO activity_ledger
        (id, task_id, type, actor_kind, actor_id, occurred_at, details_json)
      SELECT id, task_id, type, actor_kind, actor_id, occurred_at, '{}'
      FROM task_activity
      ORDER BY rowid;
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

  pauseAutomation(): void {
    this.#database
      .prepare("UPDATE runtime SET automation_state = 'paused' WHERE singleton = 1")
      .run();
  }

  hasWatchedColumns(): boolean {
    return (
      this.#database
        .prepare(
          `SELECT 1
           FROM columns
           WHERE applied = 1 AND watching_agent_id IS NOT NULL
           LIMIT 1`,
        )
        .get() !== undefined
    );
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
        `SELECT id, type, actor_kind, actor_id, occurred_at, details_json
         FROM activity_ledger
         WHERE task_id = ?
         ORDER BY sequence`,
      )
      .all(taskId) as Array<{
      id: string;
      type: TaskActivityView["type"];
      actor_kind: TaskActivityView["actor"]["kind"];
      actor_id: string;
      occurred_at: string;
      details_json: string;
    }>;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      boardId: row.board_id,
      columnId: row.column_id,
      revision: row.revision,
      comments: this.readTaskComments(taskId),
      relationships: [],
      activity: activity.map((event) => ({
        id: event.id,
        type: event.type,
        actor:
          event.actor_kind === "framework"
            ? { kind: "framework", id: "coordination" }
            : { kind: event.actor_kind, id: event.actor_id },
        occurredAt: event.occurred_at,
        details: JSON.parse(event.details_json) as Record<string, string>,
      })),
      activations: this.readActivations(taskId),
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

  readNextRunnableActivation():
    | {
        activation: ActivationView;
        task: TaskView;
        agent: AgentRunAgent;
        sourceEvent: TaskActivityView;
      }
    | undefined {
    const row = this.#database
      .prepare(
        `SELECT a.id, a.task_id, a.target_agent_id, a.source_activity_id
         FROM activations a
         WHERE a.status = 'queued'
           AND NOT EXISTS (
             SELECT 1
             FROM activations earlier
             WHERE earlier.task_id = a.task_id
               AND earlier.sequence < a.sequence
               AND earlier.status <> 'completed'
           )
         ORDER BY a.sequence
         LIMIT 1`,
      )
      .get() as
      | {
          id: string;
          task_id: string;
          target_agent_id: string;
          source_activity_id: string;
        }
      | undefined;
    if (row === undefined) return undefined;
    const task = this.readTask(row.task_id);
    const activation = task?.activations.find((candidate) => candidate.id === row.id);
    const agentRow = this.#database
      .prepare(
        `SELECT id, name, role, summary, instructions_content
         FROM agents
         WHERE id = ?`,
      )
      .get(row.target_agent_id) as
      | {
          id: string;
          name: string;
          role: string;
          summary: string;
          instructions_content: string;
        }
      | undefined;
    const sourceEvent = this.readSourceEvent(row.source_activity_id);
    if (task === undefined || activation === undefined || agentRow === undefined || sourceEvent === undefined) {
      throw new Error(`Activation ${row.id} has incomplete durable provenance`);
    }
    return {
      activation,
      task,
      agent: {
        id: agentRow.id,
        name: agentRow.name,
        role: agentRow.role,
        summary: agentRow.summary,
        instructions: agentRow.instructions_content,
      },
      sourceEvent,
    };
  }

  readTaskWorkspace(taskId: string): TaskWorkspaceView | undefined {
    const row = this.#database
      .prepare(
        `SELECT path, starting_ref, commit_id
         FROM task_workspaces
         WHERE task_id = ?`,
      )
      .get(taskId) as
      | { path: string; starting_ref: string; commit_id: string }
      | undefined;
    return row === undefined
      ? undefined
      : { path: row.path, startingRef: row.starting_ref, commit: row.commit_id };
  }

  saveTaskWorkspace(taskId: string, workspace: TaskWorkspaceView): void {
    this.#database
      .prepare(
        `INSERT INTO task_workspaces (task_id, path, starting_ref, commit_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(taskId, workspace.path, workspace.startingRef, workspace.commit);
  }

  startAttempt(
    activationId: string,
    workspacePath: string,
  ): { id: string; number: number; runStartActivityId: string } {
    return this.transaction(() => {
      const activation = this.#database
        .prepare(
          `SELECT task_id, target_agent_id
           FROM activations
           WHERE id = ? AND status = 'queued'`,
        )
        .get(activationId) as
        | { task_id: string; target_agent_id: string }
        | undefined;
      if (activation === undefined) throw new Error(`Activation ${activationId} is not runnable`);
      const attemptId = randomUUID();
      const priorAttempts = this.#database
        .prepare("SELECT COUNT(*) AS count FROM attempts WHERE activation_id = ?")
        .get(activationId) as { count: number };
      const occurredAt = new Date().toISOString();
      this.#database
        .prepare("UPDATE activations SET status = 'running' WHERE id = ?")
        .run(activationId);
      this.#database
        .prepare(
          `INSERT INTO attempts
            (id, activation_id, status, workspace_path, started_at)
           VALUES (?, ?, 'running', ?, ?)`,
        )
        .run(attemptId, activationId, workspacePath, occurredAt);
      const runStartActivityId = this.appendActivity(
        activation.task_id,
        "attempt.started",
        { kind: "agent", id: activation.target_agent_id },
        { activationId, attemptId },
        occurredAt,
      );
      return { id: attemptId, number: priorAttempts.count + 1, runStartActivityId };
    });
  }

  recordAttemptThreadId(attemptId: string, runStartActivityId: string, threadId: string): void {
    this.transaction(() => {
      const result = this.#database
        .prepare("UPDATE attempts SET thread_id = ? WHERE id = ? AND status = 'running'")
        .run(threadId, attemptId);
      if (result.changes !== 1) throw new Error(`Attempt ${attemptId} is not running`);
      const activity = this.#database
        .prepare(
          `SELECT details_json
           FROM activity_ledger
           WHERE id = ? AND type = 'attempt.started'`,
        )
        .get(runStartActivityId) as { details_json: string } | undefined;
      if (activity === undefined) throw new Error(`Run-start activity ${runStartActivityId} is missing`);
      const details = JSON.parse(activity.details_json) as Record<string, string>;
      this.#database
        .prepare("UPDATE activity_ledger SET details_json = ? WHERE id = ?")
        .run(JSON.stringify({ ...details, threadId }), runStartActivityId);
    });
  }

  completeAttempt(attemptId: string, outcome: AgentRunOutcome): void {
    this.transaction(() => {
      const attempt = this.#database
        .prepare(
          `SELECT attempt.activation_id, a.task_id, a.target_agent_id
           FROM attempts attempt
           JOIN activations a ON a.id = attempt.activation_id
           WHERE attempt.id = ? AND attempt.status = 'running'`,
        )
        .get(attemptId) as
        | { activation_id: string; task_id: string; target_agent_id: string }
        | undefined;
      if (attempt === undefined) throw new Error(`Attempt ${attemptId} is not running`);
      const occurredAt = new Date().toISOString();
      this.#database
        .prepare(
          `UPDATE attempts
           SET status = ?, completed_at = ?, outcome_status = ?, outcome_summary = ?,
               thread_id = COALESCE(?, thread_id)
           WHERE id = ?`,
        )
        .run(
          outcome.status,
          occurredAt,
          outcome.status,
          outcome.summary,
          outcome.threadId ?? null,
          attemptId,
        );
      this.#database
        .prepare("UPDATE activations SET status = ? WHERE id = ?")
        .run(outcome.status, attempt.activation_id);
      this.appendActivity(
        attempt.task_id,
        "attempt.completed",
        { kind: "agent", id: attempt.target_agent_id },
        { activationId: attempt.activation_id, attemptId },
        occurredAt,
      );
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
      const sourceEventId = this.appendActivity(
        taskId,
        "task.created",
        command.actor,
        { boardId: command.boardId, columnId: command.columnId },
      );
      this.createColumnEntryActivation(taskId, command.boardId, command.columnId, sourceEventId);
      const task = this.readTask(taskId);
      if (task === undefined) throw new Error("Created task could not be read back");
      const result: BoardMutationResult = { accepted: true, task };
      this.storeCommandResponse("create-task", command.idempotencyKey, result);
      return result;
    });
  }

  moveTask(command: MoveTaskCommand): BoardMutationResult {
    return this.transaction(() => {
      const commandType = `move-task:${command.taskId}`;
      const prior = this.readCommandResponse(commandType, command.idempotencyKey);
      if (prior !== undefined) return prior;
      const currentTask = this.readTask(command.taskId);
      if (currentTask === undefined) return { accepted: false, reason: "not-found" };
      if (currentTask.revision !== command.expectedRevision) {
        return { accepted: false, reason: "revision-conflict", currentTask };
      }
      if (currentTask.columnId === command.destinationColumnId) {
        return { accepted: false, reason: "invalid-destination" };
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
      const sourceEventId = this.appendActivity(
        command.taskId,
        "task.moved",
        command.actor,
        {
          fromColumnId: currentTask.columnId,
          toColumnId: command.destinationColumnId,
        },
      );
      this.createColumnEntryActivation(
        command.taskId,
        currentTask.boardId,
        command.destinationColumnId,
        sourceEventId,
      );
      const task = this.readTask(command.taskId);
      if (task === undefined) throw new Error("Moved task could not be read back");
      const result: BoardMutationResult = { accepted: true, task };
      this.storeCommandResponse(commandType, command.idempotencyKey, result);
      return result;
    });
  }

  addTaskComment(command: AddTaskCommentCommand): AddTaskCommentResult {
    return this.transaction(() => {
      const commandType = `add-task-comment:${command.taskId}`;
      const prior = this.readCommentCommandResponse(commandType, command.idempotencyKey);
      if (prior !== undefined) return prior;
      const task = this.readTask(command.taskId);
      if (task === undefined) return { accepted: false, reason: "not-found" };
      if (command.body.trim().length === 0) {
        return { accepted: false, reason: "empty-comment" };
      }
      const comment = {
        id: randomUUID(),
        body: command.body,
        actor: command.actor,
        occurredAt: new Date().toISOString(),
      };
      this.#database
        .prepare(
          `INSERT INTO task_comments
            (id, task_id, body, actor_kind, actor_id, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          comment.id,
          command.taskId,
          comment.body,
          comment.actor.kind,
          comment.actor.id,
          comment.occurredAt,
        );
      const updated = this.readTask(command.taskId);
      if (updated === undefined) throw new Error("Commented task could not be read back");
      const result: AddTaskCommentResult = { accepted: true, task: updated, comment };
      this.#database
        .prepare("INSERT INTO command_responses VALUES (?, ?, ?)")
        .run(commandType, command.idempotencyKey, JSON.stringify(result));
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

  private appendActivity(
    taskId: string,
    type: TaskActivityView["type"],
    actor: TaskActivityView["actor"],
    details: Record<string, string>,
    occurredAt = new Date().toISOString(),
  ): string {
    const id = randomUUID();
    this.#database
      .prepare(
        `INSERT INTO activity_ledger
          (id, task_id, type, actor_kind, actor_id, occurred_at, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, taskId, type, actor.kind, actor.id, occurredAt, JSON.stringify(details));
    return id;
  }

  private createColumnEntryActivation(
    taskId: string,
    boardId: string,
    columnId: string,
    sourceEventId: string,
  ): void {
    const destination = this.#database
      .prepare(
        `SELECT watching_agent_id
         FROM columns
         WHERE board_id = ? AND id = ? AND applied = 1`,
      )
      .get(boardId, columnId) as { watching_agent_id: string | null } | undefined;
    if (destination?.watching_agent_id === null || destination === undefined) return;
    const activationId = randomUUID();
    const occurredAt = new Date().toISOString();
    this.#database
      .prepare(
        `INSERT INTO activations
          (id, task_id, target_agent_id, reason_type, source_activity_id, status, created_at)
         VALUES (?, ?, ?, 'column-entry', ?, 'queued', ?)`,
      )
      .run(
        activationId,
        taskId,
        destination.watching_agent_id,
        sourceEventId,
        occurredAt,
      );
    this.appendActivity(
      taskId,
      "activation.created",
      { kind: "framework", id: "coordination" },
      {
        activationId,
        targetAgentId: destination.watching_agent_id,
        reasonType: "column-entry",
        sourceEventId,
      },
      occurredAt,
    );
  }

  private readActivations(taskId: string): ActivationView[] {
    const rows = this.#database
      .prepare(
        `SELECT id, target_agent_id, reason_type, source_activity_id, status
         FROM activations
         WHERE task_id = ?
         ORDER BY sequence`,
      )
      .all(taskId) as Array<{
        id: string;
        target_agent_id: string;
        reason_type: ActivationView["reason"]["type"];
        source_activity_id: string;
        status: ActivationView["status"];
      }>;
    return rows.map((row) => ({
      id: row.id,
      targetAgentId: row.target_agent_id,
      status: row.status,
      reason: { type: row.reason_type, sourceEventId: row.source_activity_id },
      attempts: this.readAttempts(row.id),
    }));
  }

  private readAttempts(activationId: string): ActivationView["attempts"] {
    const rows = this.#database
      .prepare(
        `SELECT id, status, workspace_path, started_at, completed_at,
                outcome_status, outcome_summary, thread_id
         FROM attempts
         WHERE activation_id = ?
         ORDER BY rowid`,
      )
      .all(activationId) as Array<{
        id: string;
        status: "running" | "completed" | "failed";
        workspace_path: string;
        started_at: string;
        completed_at: string | null;
        outcome_status: "completed" | "failed" | null;
        outcome_summary: string | null;
        thread_id: string | null;
      }>;
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      workspacePath: row.workspace_path,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      outcome:
        row.outcome_status === null
          ? null
          : { status: row.outcome_status, summary: row.outcome_summary ?? "" },
      threadId: row.thread_id,
    }));
  }

  private readTaskComments(taskId: string): TaskView["comments"] {
    const rows = this.#database
      .prepare(
        `SELECT id, body, actor_kind, actor_id, occurred_at
         FROM task_comments
         WHERE task_id = ?
         ORDER BY sequence`,
      )
      .all(taskId) as Array<{
      id: string;
      body: string;
      actor_kind: Actor["kind"];
      actor_id: string;
      occurred_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      body: row.body,
      actor: { kind: row.actor_kind, id: row.actor_id },
      occurredAt: row.occurred_at,
    }));
  }

  private readCommentCommandResponse(
    commandType: string,
    idempotencyKey: string,
  ): AddTaskCommentResult | undefined {
    const row = this.#database
      .prepare(
        "SELECT response_json FROM command_responses WHERE command_type = ? AND idempotency_key = ?",
      )
      .get(commandType, idempotencyKey) as { response_json: string } | undefined;
    return row === undefined
      ? undefined
      : (JSON.parse(row.response_json) as AddTaskCommentResult);
  }

  private readSourceEvent(id: string): TaskActivityView | undefined {
    const row = this.#database
      .prepare(
        `SELECT id, type, actor_kind, actor_id, occurred_at, details_json
         FROM activity_ledger
         WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          type: "task.created" | "task.moved";
          actor_kind: Actor["kind"];
          actor_id: string;
          occurred_at: string;
          details_json: string;
        }
      | undefined;
    return row === undefined
      ? undefined
      : {
          id: row.id,
          type: row.type,
          actor: { kind: row.actor_kind, id: row.actor_id },
          occurredAt: row.occurred_at,
          details: JSON.parse(row.details_json) as Record<string, string>,
        };
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

function migrateFailedRunOutcomes(database: DatabaseSync): void {
  const activationSchema = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'activations'")
    .get() as { sql: string };
  if (activationSchema.sql.includes("'failed'")) return;
  const attemptColumns = database.prepare("PRAGMA table_info(attempts)").all() as Array<{
    name: string;
  }>;
  const threadIdProjection = attemptColumns.some((column) => column.name === "thread_id")
    ? "thread_id"
    : "NULL";
  database.exec("PRAGMA foreign_keys = OFF");
  try {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE attempts RENAME TO attempts_before_failed_outcomes;
      ALTER TABLE activations RENAME TO activations_before_failed_outcomes;
      ${ACTIVATIONS_TABLE_SQL}
      ${ATTEMPTS_TABLE_SQL}
      INSERT INTO activations
        SELECT sequence, id, task_id, target_agent_id, reason_type,
               source_activity_id, status, created_at
        FROM activations_before_failed_outcomes;
      INSERT INTO attempts
        SELECT id, activation_id, status, workspace_path, started_at,
               completed_at, outcome_status, outcome_summary, ${threadIdProjection}
        FROM attempts_before_failed_outcomes;
      DROP TABLE attempts_before_failed_outcomes;
      DROP TABLE activations_before_failed_outcomes;
      COMMIT;
    `);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}
