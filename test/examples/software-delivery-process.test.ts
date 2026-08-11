import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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
  const authoredDefinition = await readFile(resolve("examples/software-delivery/process.yaml"), "utf8");
  assert.doesNotMatch(authoredDefinition, /canonical participant token|Never mention yourself/);
  assert.match(authoredDefinition, /user\s+approval is required before merge/);
  assert.match(authoredDefinition, /Requested\s+changes return to Implementation/);
  assert.match(authoredDefinition, /Code\s+Review resumes in place after consultations/);
  assert.match(authoredDefinition, /Awaiting User Approval.*Ready to Merge/s);
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

test("the example roles and operating guide define the complete proof contract", async () => {
  const [designer, implementer, reviewer, verifier, merger, guide] = await Promise.all([
    readFile(resolve("examples/software-delivery/agents/architecture-designer.md"), "utf8"),
    readFile(resolve("examples/software-delivery/agents/implementation-agent.md"), "utf8"),
    readFile(resolve("examples/software-delivery/agents/code-reviewer.md"), "utf8"),
    readFile(resolve("examples/software-delivery/agents/architecture-verifier.md"), "utf8"),
    readFile(resolve("examples/software-delivery/agents/merge-agent.md"), "utf8"),
    readFile(resolve("docs/tutorials/prove-software-delivery-workflow.md"), "utf8"),
  ]);

  assert.match(designer, /likely future-change dimensions/);
  assert.match(implementer, /requested\s+revision/);
  assert.match(reviewer, /@architecture-designer/);
  assert.match(reviewer, /plain display names/);
  assert.match(verifier, /Awaiting User Approval/);
  assert.match(merger, /visible user approval/);
  assert.match(guide, /crosses at least two existing module boundaries/);
  assert.match(guide, /host-native/);
  assert.match(guide, /backup and restore/i);
  assert.match(guide, /known first-version boundaries/i);
});
