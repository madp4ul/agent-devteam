import type { DatabaseSync } from "node:sqlite";

import type { CoordinationDatabase } from "./coordination-database.ts";

type RetentionPolicy<Result> = (result: Result) => boolean;

type UnscopedCommandKind =
  | "create-task"
  | "create-child-task"
  | "create-task-relationship"
  | "remove-task-relationship"
  | "mark-user-mention-addressed"
  | "dismiss-activation"
  | "dismiss-stale-activation"
  | "retry-failed-activation"
  | "dismiss-failed-activation"
  | "continue-failed-activation"
  | "interrupt-task"
  | "continue-interrupted-task";

type SingleScopeCommandKind =
  | "edit-task"
  | "move-task"
  | "add-task-comment"
  | "archive-task"
  | "archive-completed-tasks"
  | "unarchive-task";

export type IdempotentCommandIdentity = (
  | { kind: UnscopedCommandKind; scope?: never }
  | { kind: SingleScopeCommandKind; scope: readonly [ownerId: string] }
  | {
      kind: "continue-agent-conversation";
      scope: readonly [taskId: string, conversationId: string];
    }
  | {
      kind: "retire-agent-conversation";
      scope: readonly [taskId: string, conversationId: string];
    }
) & { idempotencyKey: string };

export interface IdempotentCommandScope {
  kind: "continue-agent-conversation";
  scope: readonly [taskId: string];
}

export class IdempotentCommandExecutor {
  readonly #owner: CoordinationDatabase;
  readonly #database: DatabaseSync;

  constructor(database: CoordinationDatabase) {
    this.#owner = database;
    this.#database = database.connection;
  }

  execute<Result>(
    identity: IdempotentCommandIdentity,
    operation: () => Result,
    retain: RetentionPolicy<Result> = () => true,
  ): Result {
    return this.#owner.transaction(() => {
      const replay = this.replay<Result>(identity);
      if (replay !== undefined) return replay;
      const result = operation();
      if (retain(result)) this.retain(identity, result);
      return result;
    });
  }

  replay<Result>(identity: IdempotentCommandIdentity): Result | undefined {
    const row = this.#database
      .prepare(
        "SELECT response_json FROM command_responses WHERE command_type = ? AND idempotency_key = ?",
      )
      .get(serializeCommandType(identity), identity.idempotencyKey) as
        | { response_json: string }
        | undefined;
    return row === undefined ? undefined : JSON.parse(row.response_json) as Result;
  }

  retain(identity: IdempotentCommandIdentity, result: unknown): void {
    this.#database
      .prepare("INSERT INTO command_responses VALUES (?, ?, ?)")
      .run(serializeCommandType(identity), identity.idempotencyKey, JSON.stringify(result));
  }

  forgetScope(scope: IdempotentCommandScope): void {
    const commandTypePrefix = `${serializeCommandType(scope)}:`;
    this.#database.prepare(
      "DELETE FROM command_responses WHERE substr(command_type, 1, length(?)) = ?",
    ).run(commandTypePrefix, commandTypePrefix);
  }
}

function serializeCommandType(
  identity: IdempotentCommandIdentity | IdempotentCommandScope,
): string {
  return [identity.kind, ...(identity.scope ?? [])].join(":");
}
