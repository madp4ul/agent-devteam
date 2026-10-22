import assert from "node:assert/strict";
import test from "node:test";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { startWebServer } from "../../src/web/web-server.ts";
import { createActivationFixture } from "../support/activation-fixture.ts";

test("browser HTTP task editing accepts a ref-only correction and leaves omitted content unchanged", async (t) => {
  const fixture = await createActivationFixture("browser-ref-edit", "mistyped-ref");
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath });
  t.after(() => application.close());
  const created = application.createTask({ boardId: "delivery", columnId: "backlog", title: "Keep title", description: "Keep description",
    actor: { kind: "user", id: "user" }, idempotencyKey: "create" });
  assert.ok(created.accepted);
  const server = await startWebServer(application, { host: "127.0.0.1", port: 0 });
  t.after(() => server.close());
  const patch = (body: Record<string, unknown>) => fetch(`${server.baseUrl}/api/tasks/${created.task.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const corrected = await patch({ startingRef: "main", expectedRevision: 1, idempotencyKey: "correct" });
  assert.equal(corrected.status, 200);
  const result = await corrected.json();
  assert.equal(result.task.title, "Keep title");
  assert.equal(result.task.description, "Keep description");
  assert.equal(result.task.revision, 2);
  const inspection = application.queryTaskInspection(created.task.id);
  assert.ok(inspection.available);
  assert.equal(inspection.task.workspaceStatus.startingRef, "main");
  const blank = await patch({ startingRef: "  ", expectedRevision: 2, idempotencyKey: "blank" });
  assert.equal(blank.status, 400);
  assert.equal((await blank.json()).reason, "invalid-starting-ref");
  const content = await patch({ description: "Revised content", expectedRevision: 2, idempotencyKey: "content" });
  assert.equal(content.status, 200);
  assert.equal((await content.json()).task.title, "Keep title");
});
