import assert from "node:assert/strict";
import { test } from "node:test";

import { createHttpDispatcher } from "../../src/web/http/dispatcher.ts";

test("dispatches exact and named-segment routes with decoded parameters", async () => {
  const dispatcher = createHttpDispatcher<{ calls: string[] }>();
  dispatcher.register("GET", "/tasks/:taskId", "tasks", ({ calls, params }) => {
    calls.push(params.taskId);
  });
  const calls: string[] = [];

  const result = await dispatcher.dispatch("GET", "/tasks/task%201", { calls });

  assert.deepEqual(result, { kind: "matched" });
  assert.deepEqual(calls, ["task 1"]);
});

test("registered handler parameters are statically constrained by the template", () => {
  const dispatcher = createHttpDispatcher<object>();
  dispatcher.register("GET", "/tasks/:taskId", "tasks", ({ params }) => {
    const taskId: string = params.taskId;
    assert.equal(typeof taskId, "string");
    // @ts-expect-error the template does not declare a projectId parameter
    void params.projectId;
  });
});

test("prefers static segments over parameters independent of registration order", async () => {
  for (const staticFirst of [true, false]) {
    const dispatcher = createHttpDispatcher<{ selected: string[] }>();
    const registerStatic = () => dispatcher.register("GET", "/tasks/archive", "archive", ({ selected }) => {
      selected.push("static");
    });
    const registerParameter = () => dispatcher.register("GET", "/tasks/:taskId", "tasks", ({ selected }) => {
      selected.push("parameter");
    });
    if (staticFirst) {
      registerStatic();
      registerParameter();
    } else {
      registerParameter();
      registerStatic();
    }
    const selected: string[] = [];

    await dispatcher.dispatch("GET", "/tasks/archive", { selected });

    assert.deepEqual(selected, ["static"]);
  }
});

test("rejects duplicate and structurally ambiguous registrations", () => {
  const dispatcher = createHttpDispatcher<object>();
  dispatcher.register("GET", "/tasks/:taskId", "tasks", () => undefined);

  assert.throws(
    () => dispatcher.register("GET", "/tasks/:taskId", "duplicate", () => undefined),
    /Duplicate GET route.*tasks.*duplicate/,
  );
  assert.throws(
    () => dispatcher.register("GET", "/tasks/:id", "ambiguous", () => undefined),
    /Ambiguous GET route.*\/tasks\/:taskId.*\/tasks\/:id/,
  );
});

test("rejects a template that repeats one parameter name", () => {
  const dispatcher = createHttpDispatcher<object>();

  assert.throws(
    () => dispatcher.register("GET", "/tasks/:taskId/related/:taskId", "tasks", () => undefined),
    /Duplicate named segment :taskId.*\/tasks\/:taskId\/related\/:taskId/,
  );
});

test("reports malformed parameter encoding without invoking the handler", async () => {
  const dispatcher = createHttpDispatcher<{ invoked: boolean }>();
  dispatcher.register("GET", "/tasks/:taskId", "tasks", (context) => {
    context.invoked = true;
  });
  const context = { invoked: false };

  const result = await dispatcher.dispatch("GET", "/tasks/%E0%A4%A", context);

  assert.deepEqual(result, { kind: "invalid-path-encoding" });
  assert.equal(context.invoked, false);
});

test("awaits handlers and propagates async failures", async () => {
  const dispatcher = createHttpDispatcher<object>();
  let completed = false;
  dispatcher.register("POST", "/work", "work", async () => {
    await Promise.resolve();
    completed = true;
    throw new Error("async failure");
  });

  await assert.rejects(dispatcher.dispatch("POST", "/work", {}), /async failure/);
  assert.equal(completed, true);
});

test("distinguishes not found from method not allowed and lists allowed methods", async () => {
  const dispatcher = createHttpDispatcher<object>();
  dispatcher.register("GET", "/tasks/:taskId", "tasks", () => undefined);
  dispatcher.register("PATCH", "/tasks/:taskId", "tasks", () => undefined);

  assert.deepEqual(await dispatcher.dispatch("POST", "/tasks/1", {}), {
    kind: "method-not-allowed",
    allowedMethods: ["GET", "PATCH"],
  });
  assert.deepEqual(await dispatcher.dispatch("GET", "/missing", {}), { kind: "not-found" });
});

test("returns a deterministic inspectable route catalog", () => {
  const dispatcher = createHttpDispatcher<object>();
  dispatcher.register("POST", "/tasks", "tasks", () => undefined);
  dispatcher.register("GET", "/settings", "settings", () => undefined);

  assert.deepEqual(dispatcher.catalog(), [
    { method: "GET", template: "/settings", owner: "settings" },
    { method: "POST", template: "/tasks", owner: "tasks" },
  ]);
});
