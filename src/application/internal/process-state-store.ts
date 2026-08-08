import type { BoardSummaryView, ProcessBoardView } from "../coordination-contract.ts";
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
  ): void {
    const connection = this.#database.connection;
    const instructionByAgent = new Map(
      instructions.map((instruction) => [instruction.agentId, instruction.content]),
    );
    this.#database.transaction(() => {
      connection.exec(`
        UPDATE columns SET applied = 0, position = position + 100000;
        UPDATE boards SET applied = 0, position = position + 100000;
        UPDATE agents SET applied = 0;
        DELETE FROM runtime;
      `);
      connection
        .prepare("INSERT INTO runtime VALUES (1, ?, ?, 'paused')")
        .run(definition.name, version);

      const insertAgent = connection.prepare(
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
    });
  }

  resumeAutomation(): void {
    this.#database.connection
      .prepare("UPDATE runtime SET automation_state = 'running' WHERE singleton = 1")
      .run();
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
      })),
    }));
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
      LEFT JOIN tasks t ON t.board_id = c.board_id AND t.column_id = c.id
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
                name: column.agent_name,
                summary: column.agent_summary,
              },
        frameworkOwned: column.framework_owned === 1,
        taskCount: column.task_count,
      })),
    }));
  }
}
