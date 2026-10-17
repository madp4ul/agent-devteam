import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { coordinationMigrations } from "../../src/application/internal/migrations/registry.ts";
import { canonicalHumanIdentityMigration } from "../../src/application/internal/migrations/0013-canonical-human-identity.ts";

test("human identity upgrade preserves audit references, agent identities, authored evidence and retry aliases", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    for (const migration of coordinationMigrations.slice(0, 12)) migration.apply(database);
    database.exec(`INSERT INTO runtime VALUES (1, 'Released process', 'legacy-version', 'paused', NULL);
      INSERT INTO boards VALUES ('delivery', 'Delivery', 'Work', 0, 1);
      INSERT INTO columns VALUES ('delivery', 'backlog', 'Backlog', 0, NULL, 0, 1);`);
    database.exec(await readFile(new URL("../fixtures/released-schema/0009-reviewer-allowances-data.sql", import.meta.url), "utf8"));
    database.exec(`UPDATE activity_ledger SET actor_id = 'local-user';
      UPDATE agent_conversation_messages SET actor_id = 'local-user';
      UPDATE agent_conversations SET retirement_actor_id = 'local-user';
      UPDATE tasks SET archival_actor_id = 'local-user' WHERE id = 'released-task';
      INSERT INTO task_comments(id, task_id, body, actor_kind, actor_id, occurred_at)
        VALUES ('local-user', 'released-task', 'Original @local-user text', 'user', 'local-user', '2026-01-02');
      INSERT INTO activity_ledger(id, task_id, type, actor_kind, actor_id, occurred_at, details_json)
        VALUES ('movement', 'released-task', 'task.moved', 'user', 'local-user', '2026-01-03',
          '{"actorName":"local-user","fromColumnId":"backlog","toColumnId":"completion"}');`);
    const snapshot = JSON.stringify({
      id: "local-user", body: "Original @local-user text",
      comments: [{ id: "local-user", actor: { kind: "user", id: "local-user" } },
        { id: "agent-comment", actor: { kind: "agent", id: "local-user" } }],
      history: { records: [{ id: "movement", author: { kind: "user", id: "local-user" }, details: { actorName: "local-user" } }] },
    });
    database.prepare("UPDATE activation_contexts SET context_json = ?").run(snapshot);
    const legacyKey = JSON.stringify(["add-task-comment", ["user", "local-user"], ["released-task"]]);
    const canonicalKey = JSON.stringify(["add-task-comment", ["user", "user"], ["released-task"]]);
    database.prepare("INSERT INTO command_responses VALUES (?, 'retry', ?, '{}')").run(legacyKey, snapshot);
    const sourcesBefore = database.prepare("SELECT * FROM task_timeline_sources ORDER BY id").all();
    const transcriptBefore = database.prepare("SELECT * FROM attempt_transcripts").all();
    const journalBefore = database.prepare("SELECT sequence, id, task_id, type, occurred_at FROM activity_ledger ORDER BY sequence").all();
    const expected = JSON.parse(snapshot);
    expected.comments[0].actor.id = "user";
    expected.history.records[0].author.id = "user";
    expected.history.records[0].details.actorName = "user";

    canonicalHumanIdentityMigration.apply(database);
    assert.deepEqual(JSON.parse(database.prepare("SELECT context_json FROM activation_contexts").get()!.context_json as string), expected);
    for (const key of [legacyKey, canonicalKey]) {
      assert.deepEqual(JSON.parse(database.prepare("SELECT response_json FROM command_responses WHERE command_type = ?").get(key)!.response_json as string), expected);
    }
    for (const table of ["activity_ledger", "task_comments", "agent_conversation_messages", "task_movement_metadata"]) {
      assert.equal(database.prepare(`SELECT count(*) AS n FROM ${table} WHERE actor_kind = 'user' AND actor_id <> 'user'`).get()!.n, 0);
    }
    assert.equal(database.prepare("SELECT actor_id FROM task_comments WHERE id = 'released-comment'").get()!.actor_id, "released-agent");
    assert.equal(database.prepare("SELECT body FROM task_comments WHERE id = 'local-user'").get()!.body, "Original @local-user text");
    assert.equal(database.prepare("SELECT retirement_actor_id FROM agent_conversations").get()!.retirement_actor_id, "user");
    assert.equal(database.prepare("SELECT archival_actor_id FROM tasks WHERE id = 'released-task'").get()!.archival_actor_id, "user");
    assert.equal(JSON.parse(database.prepare("SELECT details_json FROM task_movement_metadata").get()!.details_json as string).actorName, "user");
    assert.deepEqual(database.prepare("SELECT * FROM task_timeline_sources ORDER BY id").all(), sourcesBefore);
    assert.deepEqual(database.prepare("SELECT * FROM attempt_transcripts").all(), transcriptBefore);
    assert.deepEqual(database.prepare("SELECT sequence, id, task_id, type, occurred_at FROM activity_ledger ORDER BY sequence").all(), journalBefore);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(database.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally {
    database.close();
  }
});
