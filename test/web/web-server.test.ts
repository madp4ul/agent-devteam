import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { startWebServer } from "../../src/web/web-server.ts";
import { escapeRegExp } from "../support/text.ts";

test("the web adapter shows paused boards and keeps task movement accessible without dragging", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-web-"));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Web process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep movement explicit.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver changes.
    columns:
      - id: backlog
        name: Backlog
      - id: review
        name: Review
`,
  );
  const application = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Move without dragging",
    description: "The task has a linkable detail page.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "web-fixture",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const server = await startWebServer(application, { host: "127.0.0.1", port: 0 });
  t.after(() => server.close());

  const boardHtml = await fetch(server.baseUrl).then((response) => response.text());
  assert.match(boardHtml, /Automation paused/);
  assert.match(boardHtml, /Completion/);
  assert.match(boardHtml, new RegExp(`href="/tasks/${created.task.id}"`));

  const taskHtml = await fetch(`${server.baseUrl}/tasks/${created.task.id}`).then(
    (response) => response.text(),
  );
  assert.match(taskHtml, /aria-label="Move task to column"/);
  assert.match(taskHtml, /<button type="submit">Move task<\/button>/);

  const moveResponse = await fetch(`${server.baseUrl}/tasks/${created.task.id}/move`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      destinationColumnId: "review",
      expectedRevision: "1",
    }),
  });
  assert.equal(moveResponse.status, 200);
  assert.match(await moveResponse.text(), /Current column: <strong>Review<\/strong>/);

  const resumeResponse = await fetch(`${server.baseUrl}/automation/resume`, {
    method: "POST",
  });
  assert.equal(resumeResponse.status, 200);
  assert.match(await resumeResponse.text(), /Automation running/);
});

test("the web adapter renders configuration diagnostics without exposing stale controls", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-web-error-"));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(
    definitionPath,
    `schemaVersion: 7
name: Invalid web process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Fail closed.
agents: []
boards: []
`,
  );
  const application = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
  });
  t.after(() => application.close());
  const server = await startWebServer(application, { host: "127.0.0.1", port: 0 });
  t.after(() => server.close());

  const html = await fetch(server.baseUrl).then((response) => response.text());
  assert.match(html, /Configuration error/);
  assert.match(html, new RegExp(`${escapeRegExp(definitionPath)}:1:16`));
  assert.match(html, /Invalid value:/);
  assert.match(html, /Rule:/);
  assert.match(html, /Consequence:/);
  assert.match(html, /Correction:/);
  assert.doesNotMatch(html, /Resume automation/);
});
