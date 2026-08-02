import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";

test("the example process validates and constructs the documented delivery workflow", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-example-"));
  const application = await CoordinationApplication.start({
    processDefinitionPath: resolve("examples/software-delivery/process.yaml"),
    databasePath: join(directory, "coordination.sqlite3"),
  });
  t.after(() => application.close());

  const startup = application.queryStartup();
  assert.equal(startup.mode, "paused");
  if (startup.mode !== "paused") return;
  assert.deepEqual(
    startup.boards[0]?.columns.map((column) => ({
      id: column.id,
      watchingAgentId: column.watchingAgentId,
    })),
    [
      { id: "backlog", watchingAgentId: null },
      { id: "architecture-design", watchingAgentId: "architecture-designer" },
      { id: "implementation", watchingAgentId: "implementation-agent" },
      { id: "code-review", watchingAgentId: "code-reviewer" },
      { id: "architecture-verification", watchingAgentId: "architecture-verifier" },
      { id: "awaiting-user-approval", watchingAgentId: null },
      { id: "ready-to-merge", watchingAgentId: "merge-agent" },
      { id: "completion", watchingAgentId: null },
    ],
  );
});
