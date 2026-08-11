import type {
  BoardSummaryView,
  ProcessBoardView,
  ProcessDefinitionImpact,
} from "../coordination-contract.ts";
import { taskCreationAllowed } from "./task-creation-policy.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type {
  AgentInstructionContent,
  ProcessDefinition,
} from "./process-definition.ts";

export class ProcessStateStore {
  readonly #database: CoordinationDatabase;

  constructor(database: CoordinationDatabase) {
    this.#database = database;
  }

  applyDefinition(
    definition: ProcessDefinition,
    instructions: AgentInstructionContent[],
    version: string,
  ): ProcessDefinitionImpact | undefined {
    const connection = this.#database.connection;
    const instructionByAgent = new Map(
      instructions.map((instruction) => [instruction.agentId, instruction.content]),
    );
    return this.#database.transaction(() => {
      const priorRuntime = connection
        .prepare("SELECT definition_version, impact_previous_version FROM runtime WHERE singleton = 1")
        .get() as {
          definition_version: string;
          impact_previous_version: string | null;
        } | undefined;
      const definitionChanged = priorRuntime !== undefined && priorRuntime.definition_version !== version;
      const impactPreviousVersion = definitionChanged
        ? priorRuntime.definition_version
        : priorRuntime?.impact_previous_version ?? null;
      connection.exec(`
        UPDATE columns SET applied = 0, position = position + 100000;
        UPDATE boards SET applied = 0, position = position + 100000;
        UPDATE agents SET applied = 0;
        DELETE FROM runtime;
      `);
      connection
        .prepare(
          `INSERT INTO runtime
            (singleton, process_name, definition_version, automation_state, impact_previous_version)
           VALUES (1, ?, ?, 'paused', ?)`,
        )
        .run(definition.name, version, impactPreviousVersion);

      const insertAgent = connection.prepare(
        `INSERT INTO agents
          (id, name, role, summary, instructions_path, instructions_content,
           model, reasoning_effort, applied)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           role = excluded.role,
           summary = excluded.summary,
           instructions_path = excluded.instructions_path,
           instructions_content = excluded.instructions_content,
           model = excluded.model,
           reasoning_effort = excluded.reasoning_effort,
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
          agent.model ?? null,
          agent.reasoningEffort ?? null,
        );
      }

      const insertBoard = connection.prepare(`
        INSERT INTO boards VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          guidance = excluded.guidance,
          position = excluded.position,
          applied = 1
      `);
      const insertColumn = connection.prepare(
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
      if (definitionChanged) {
        connection
          .prepare(
            `UPDATE activations
             SET stale = 1
             WHERE definition_version <> ?
               AND status IN ('queued', 'failed')
               AND resolution IS NULL`,
          )
          .run(version);
      }
      if (impactPreviousVersion === null) return undefined;
      const impact = this.readDefinitionImpact(impactPreviousVersion, version);
      if (impact.unmappedTasks.length === 0 && impact.staleActivations.length === 0) {
        connection.prepare("UPDATE runtime SET impact_previous_version = NULL WHERE singleton = 1").run();
        return undefined;
      }
      return impact;
    });
  }

  readDefinitionImpact(
    previousVersion: string,
    currentVersion: string,
  ): ProcessDefinitionImpact {
    const connection = this.#database.connection;
    const unmappedTasks = connection.prepare(
      `SELECT task.id AS task_id, task.title, task.board_id, board.name AS board_name,
              task.column_id, column.name AS column_name
       FROM tasks task
       JOIN boards board ON board.id = task.board_id
       JOIN columns column ON column.board_id = task.board_id AND column.id = task.column_id
       WHERE task.column_id <> 'completion'
         AND (board.applied = 0 OR column.applied = 0)
       ORDER BY task.sequence`,
    ).all() as Array<{
      task_id: string; title: string; board_id: string; board_name: string;
      column_id: string; column_name: string;
    }>;
    const staleActivations = connection.prepare(
      `SELECT activation.id AS activation_id, activation.task_id,
              activation.target_agent_id, activation.status,
              agent.applied AS target_available,
              CASE WHEN mapped.id IS NULL THEN 0 ELSE 1 END AS task_mapped
       FROM activations activation
       JOIN tasks task ON task.id = activation.task_id
       JOIN boards board ON board.id = task.board_id
       JOIN columns column ON column.board_id = task.board_id AND column.id = task.column_id
       JOIN agents agent ON agent.id = activation.target_agent_id
       LEFT JOIN mapped_tasks mapped ON mapped.id = task.id
       WHERE activation.stale = 1 AND activation.resolution IS NULL
       ORDER BY activation.sequence`,
    ).all() as Array<{
      activation_id: string; task_id: string; target_agent_id: string;
      status: "queued" | "failed"; target_available: number; task_mapped: number;
    }>;
    return {
      previousVersion,
      currentVersion,
      unmappedTasks: unmappedTasks.map((task) => ({
        taskId: task.task_id,
        title: task.title,
        boardId: task.board_id,
        boardName: task.board_name,
        columnId: task.column_id,
        columnName: task.column_name,
      })),
      staleActivations: staleActivations.map((activation) => ({
        activationId: activation.activation_id,
        taskId: activation.task_id,
        targetAgentId: activation.target_agent_id,
        priorStatus: activation.status,
        targetAvailable: activation.target_available === 1,
        taskMapped: activation.task_mapped === 1,
      })),
    };
  }

  resumeAutomation(): void {
    this.#database.connection
      .prepare("UPDATE runtime SET automation_state = 'running' WHERE singleton = 1")
      .run();
  }

  hasStaleActivations(): boolean {
    return this.#database.connection
      .prepare("SELECT 1 FROM activations WHERE stale = 1 AND resolution IS NULL LIMIT 1")
      .get() !== undefined;
  }

  rebaseCompatibleStaleActivations(): string[] {
    return this.#database.transaction(() => {
      const connection = this.#database.connection;
      const runtime = connection
        .prepare("SELECT definition_version FROM runtime WHERE singleton = 1")
        .get() as { definition_version: string };
      const compatible = connection.prepare(
        `SELECT activation.id
         FROM activations activation
         JOIN agents agent ON agent.id = activation.target_agent_id AND agent.applied = 1
         WHERE activation.stale = 1 AND activation.resolution IS NULL
         ORDER BY activation.sequence`,
      ).all() as Array<{ id: string }>;
      const update = connection.prepare(
        `UPDATE activations SET stale = 0, definition_version = ? WHERE id = ?`,
      );
      for (const activation of compatible) update.run(runtime.definition_version, activation.id);
      return compatible.map(({ id }) => id);
    });
  }

  pauseAutomation(): void {
    this.#database.connection
      .prepare("UPDATE runtime SET automation_state = 'paused' WHERE singleton = 1")
      .run();
  }

  hasWatchedColumns(): boolean {
    return (
      this.#database.connection
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
    const connection = this.#database.connection;
    const boardRows = connection
      .prepare("SELECT id, name, guidance FROM boards WHERE applied = 1 ORDER BY position")
      .all() as Array<{ id: string; name: string; guidance: string }>;
    const selectColumns = connection.prepare(`
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
        taskCreationAllowed: taskCreationAllowed(column.id),
      })),
    }));
  }

  readBoard(boardId: string, includeRetiredState = false): ProcessBoardView | undefined {
    const connection = this.#database.connection;
    const board = connection.prepare(
      `SELECT id, name, guidance FROM boards
       WHERE id = ? ${includeRetiredState ? "" : "AND applied = 1"}`,
    ).get(boardId) as { id: string; name: string; guidance: string } | undefined;
    if (board === undefined) return undefined;
    const columns = connection.prepare(
      `SELECT id, name, watching_agent_id, framework_owned
       FROM columns
       WHERE board_id = ? ${includeRetiredState ? "" : "AND applied = 1"}
       ORDER BY position`,
    ).all(boardId) as Array<{
      id: string;
      name: string;
      watching_agent_id: string | null;
      framework_owned: number;
    }>;
    return {
      ...board,
      columns: columns.map((column) => ({
        id: column.id,
        name: column.name,
        watchingAgentId: column.watching_agent_id,
        frameworkOwned: column.framework_owned === 1,
        taskCreationAllowed: taskCreationAllowed(column.id),
      })),
    };
  }

  readBoardSummaries(): BoardSummaryView[] {
    const connection = this.#database.connection;
    const boardRows = connection
      .prepare("SELECT id, name FROM boards WHERE applied = 1 ORDER BY position")
      .all() as Array<{ id: string; name: string }>;
    const selectColumns = connection.prepare(`
      SELECT c.id, c.name, c.framework_owned,
             a.id AS agent_id, a.name AS agent_name, a.summary AS agent_summary,
             COUNT(t.id) AS task_count
      FROM columns c
      LEFT JOIN agents a ON a.id = c.watching_agent_id
      LEFT JOIN tasks t ON t.board_id = c.board_id AND t.column_id = c.id AND t.archived_at IS NULL
      WHERE c.board_id = ? AND c.applied = 1
      GROUP BY c.id, c.name, c.framework_owned, c.position,
               a.id, a.name, a.summary
      ORDER BY c.position
    `);
    return boardRows.map((board) => ({
      id: board.id,
      name: board.name,
      columns: (
        selectColumns.all(board.id) as Array<{
          id: string;
          name: string;
          framework_owned: number;
          agent_id: string | null;
          agent_name: string | null;
          agent_summary: string | null;
          task_count: number;
        }>
      ).map((column) => ({
        id: column.id,
        name: column.name,
        watchingAgent:
          column.agent_id === null || column.agent_name === null || column.agent_summary === null
            ? null
            : {
              id: column.agent_id,
              token: `@${column.agent_id}`,
              name: column.agent_name,
                summary: column.agent_summary,
              },
        frameworkOwned: column.framework_owned === 1,
        taskCreationAllowed: taskCreationAllowed(column.id),
        taskCount: column.task_count,
      })),
    }));
  }
}
