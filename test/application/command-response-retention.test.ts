import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { forgetTaskCommandResponses } from "../../src/application/internal/command-response-retention.ts";

test("archival expires owned mutation snapshots across key formats while preserving retry receipts and other callers", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`CREATE TABLE command_responses (
      command_type TEXT NOT NULL, idempotency_key TEXT NOT NULL,
      response_json TEXT NOT NULL, request_json TEXT,
      PRIMARY KEY(command_type, idempotency_key))`);
    const insert = database.prepare("INSERT INTO command_responses VALUES (?, ?, ?, NULL)");
    const keys = {
      user: JSON.stringify(["add-task-comment", ["user", "local-user"], ["T-0001"]]),
      agent: JSON.stringify(["move-task", ["agent", "implementer"], ["T-0001"]]),
      relationship: JSON.stringify(["create-task-relationship", ["agent", "implementer", "T-0001"], null]),
      legacy: "edit-task:T-0001",
      followUp: "continue-agent-conversation:T-0001:conversation",
      retirement: "retire-agent-conversation:T-0001:conversation",
      active: JSON.stringify(["add-task-comment", ["agent", "implementer"], ["T-0002"]]),
      otherId: "move-task:T-00010",
      creation: JSON.stringify(["create-task", ["agent", "implementer", "T-0001"], null]),
      childCreation: JSON.stringify(["create-child-task", ["user", "local-user", "T-0001"], null]),
      archive: "archive-task:T-0001",
      unarchive: "unarchive-task:T-0001",
      bulk: "archive-completed-tasks:delivery",
      unscoped: "interrupt-task",
      unknown: "[invalid-key",
    };
    for (const [id, key] of Object.entries(keys)) insert.run(key, id, '{"accepted":true}');
    // A cross-task destination is not proof of ownership. The active caller's
    // retry receipt must survive archival of its destination.
    database.prepare("UPDATE command_responses SET response_json = ? WHERE idempotency_key = 'active'")
      .run('{"accepted":true,"task":{"id":"T-0001"}}');

    database.exec("BEGIN");
    assert.equal(forgetTaskCommandResponses(database, new Set(["T-0001"])), 6);
    database.exec("ROLLBACK");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM command_responses").get()!.count, 15);

    database.exec("BEGIN");
    assert.equal(forgetTaskCommandResponses(database, new Set(["T-0001"])), 6);
    database.exec("COMMIT");
    const remaining = database.prepare("SELECT idempotency_key FROM command_responses ORDER BY idempotency_key")
      .all().map((row) => row.idempotency_key);
    assert.deepEqual(remaining, ["active", "archive", "bulk", "childCreation", "creation", "otherId", "unarchive", "unknown", "unscoped"]);
    assert.equal(forgetTaskCommandResponses(database, new Set(["T-0001"])), 0);
    assert.equal(forgetTaskCommandResponses(database, new Set(["T-0002", "T-00010"])), 2);
  } finally {
    database.close();
  }
});
