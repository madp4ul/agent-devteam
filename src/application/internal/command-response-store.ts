import type { DatabaseSync } from "node:sqlite";

import type { CoordinationDatabase } from "./coordination-database.ts";

export class CommandResponseStore {
  readonly #database: DatabaseSync;

  constructor(database: CoordinationDatabase) {
    this.#database = database.connection;
  }

  read<Result>(commandType: string, idempotencyKey: string): Result | undefined {
    const row = this.#database
      .prepare(
        "SELECT response_json FROM command_responses WHERE command_type = ? AND idempotency_key = ?",
      )
      .get(commandType, idempotencyKey) as { response_json: string } | undefined;
    return row === undefined ? undefined : JSON.parse(row.response_json) as Result;
  }

  write(commandType: string, idempotencyKey: string, result: unknown): void {
    this.#database
      .prepare("INSERT INTO command_responses VALUES (?, ?, ?)")
      .run(commandType, idempotencyKey, JSON.stringify(result));
  }
}
