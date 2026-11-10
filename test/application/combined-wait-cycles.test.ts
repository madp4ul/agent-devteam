import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";

const user = { kind: "user" as const, id: "user" };
const actor = { kind: "agent" as const, id: "implementation-agent" };

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "combined-cycles-"));
  const app = await CoordinationApplication.start({ processDefinitionPath: resolve("examples/software-delivery/process.yaml"), databasePath: join(directory, "state.sqlite") });
  t.after(() => app.close());
  const tasks = ["A", "B", "C"].map(title => {
    const r = app.createTask({ boardId: "delivery", columnId: "backlog", title, description: title, actor: user, idempotencyKey: title });
    assert.ok(r.accepted); return r.task.id;
  });
  const resources = ["Game", "Browser"].map(title => {
    const r = app.createResource({ title, actor: user, idempotencyKey: title }); assert.ok(r.accepted); return r.resource.id;
  });
  const claim = (taskId: string, resourceId: string) => app.claimResource({ taskId, resourceId, actor, idempotencyKey: `${taskId}-${resourceId}` });
  return { app, tasks, resources, claim };
}

test("resource-only cycles reject the closing claim without activity, activation or waiting state", async t => {
  const { app, tasks: [a, b], resources: [game, browser], claim } = await fixture(t);
  assert.ok(claim(a!, game!).accepted);
  assert.ok(claim(b!, browser!).accepted);
  assert.ok(claim(b!, game!).accepted);
  const before = app.queryTask(a!);
  const rejected = claim(a!, browser!);
  assert.equal(rejected.accepted, false);
  assert.ok(!rejected.accepted);
  assert.equal(rejected.reason, "circular-wait");
  assert.match(rejected.diagnostic!, /T-0001.*R-0002.*T-0002.*R-0001.*T-0001/);
  assert.match(rejected.diagnostic!, /participants.*release.*remove unnecessary/);
  assert.deepEqual(app.queryTask(a!), before);
});

test("both relationship kinds reject cycles through an earlier resource waiter", async t => {
  const { app, tasks: [owner, first, last], resources: [game], claim } = await fixture(t);
  assert.ok(claim(owner!, game!).accepted);
  assert.ok(claim(first!, game!).accepted);
  assert.ok(claim(last!, game!).accepted);
  for (const type of ["dependency", "parent-child"] as const) {
    const before = [app.queryTask(first!), app.queryTask(last!)];
    const result = app.createTaskRelationship({ type, sourceTaskId: first!, targetTaskId: last!, resumeAgentId: actor.id, actor: user, idempotencyKey: type });
    assert.ok(!result.accepted);
    assert.equal(result.reason, "circular-relationship");
    assert.match(result.diagnostic!, new RegExp(`${first}.*${type}.*${last}.*${game}.*${first}`));
    assert.deepEqual([app.queryTask(first!), app.queryTask(last!)], before);
  }
});

test("claims reject mixed child and dependency cycles through a queue, then retry after coordination", async t => {
  const { app, tasks: [owner, first, requester], resources: [game], claim } = await fixture(t);
  assert.ok(claim(owner!, game!).accepted);
  assert.ok(claim(first!, game!).accepted);
  const relationship = app.createTaskRelationship({ type: "parent-child", sourceTaskId: first!, targetTaskId: requester!, resumeAgentId: actor.id, actor: user, idempotencyKey: "child" });
  assert.ok(relationship.accepted);
  const before = app.queryTask(requester!);
  const rejected = claim(requester!, game!);
  assert.ok(!rejected.accepted);
  assert.equal(rejected.reason, "circular-wait");
  assert.match(rejected.diagnostic!, new RegExp(`${requester}.*${game}.*${first}.*parent-child relationship ${relationship.relationship.id}.*${requester}`));
  assert.deepEqual(app.queryTask(requester!), before);
  assert.ok(app.removeTaskRelationship({ taskId: first!, relationshipId: relationship.relationship.id, actor: user, idempotencyKey: "remove" }).accepted);
  assert.ok(claim(requester!, game!).accepted);
});
