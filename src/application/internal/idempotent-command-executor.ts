import type { DatabaseSync } from "node:sqlite";

import type { CoordinationDatabase } from "./coordination-database.ts";

type RetentionPolicy<Result> = (result: Result) => boolean;

export class IdempotentCommandExecutor {
  readonly #owner: CoordinationDatabase;
  readonly #database: DatabaseSync;

  constructor(database: CoordinationDatabase) {
    this.#owner = database;
    this.#database = database.connection;
  }

  execute<Result>(
    commandType: string,
    idempotencyKey: string,
    operation: () => Result,
    retain: RetentionPolicy<Result> = () => true,
  ): Result {
    return this.#owner.transaction(() => {
      const replay = this.replay<Result>(commandType, idempotencyKey);
      if (replay !== undefined) return replay;
      const result = operation();
      if (retain(result)) this.retain(commandType, idempotencyKey, result);
      return result;
    });
  }

  replay<Result>(commandType: string, idempotencyKey: string): Result | undefined {
    const row = this.#database
      .prepare(
        "SELECT response_json FROM command_responses WHERE command_type = ? AND idempotency_key = ?",
      )
      .get(commandType, idempotencyKey) as { response_json: string } | undefined;
    return row === undefined ? undefined : JSON.parse(row.response_json) as Result;
  }

  retain(commandType: string, idempotencyKey: string, result: unknown): void {
    this.#database
      .prepare("INSERT INTO command_responses VALUES (?, ?, ?)")
      .run(commandType, idempotencyKey, JSON.stringify(result));
  }

  forgetByCommandTypePrefix(commandTypePrefix: string): void {
    this.#database.prepare(
      "DELETE FROM command_responses WHERE substr(command_type, 1, length(?)) = ?",
    ).run(commandTypePrefix, commandTypePrefix);
  }
}
