import { access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = "http://127.0.0.1:3010";
const environment = resolve(import.meta.dirname, "environment");
const manifestPath = resolve(environment, "success-review.json");
const request = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, body === undefined ? undefined : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${path}: ${JSON.stringify(result)}`);
  return result;
};

if (await access(manifestPath).then(() => true, () => false)) {
  console.log("Review tasks already exist. See environment/success-review.json; their current state was left intact.");
} else {
  // Refuse writes until an existing workspace identifies the isolated project.
  // Discover the anchor: review tasks can be archived and IDs vary between runs.
  const board = await request("/api/board");
  const expected = `${environment.replaceAll("\\", "/")}/task-worktrees/`;
  let isolated = false;
  if (board.startup.processName === "Software Delivery") {
    for (const task of board.boards.flatMap((item) => item.columns.flatMap((column) => column.tasks))) {
      const detail = await request(`/api/tasks/${task.id}`);
      const workspace = detail.inspection?.workspace?.path?.replaceAll("\\", "/");
      if (detail.available && workspace?.startsWith(expected)) { isolated = true; break; }
    }
  }
  if (!isolated) {
    throw new Error("Cannot verify the isolated review host from an existing workspace. Run its seed command first. No changes were made.");
  }
  const create = async (name, description, key) => {
    const result = await request("/api/tasks", { boardId: "delivery", columnId: "backlog", title: name, description, idempotencyKey: `success-review-v1:${key}` });
    return result.task.id;
  };
  const main = await create("Review success messages", `Use this disposable task to review existing floating success messages through normal controls.

1. Click **Edit task**, add a short note to this description, then **Save task**. The message is **Updated TASK-ID.** Close it with X and repeat as often as you like.
2. In **Task position**, change **Column** between **Backlog** and **Awaiting User Approval**. Both columns have no watching agent. Each move displays a **Moved...** message.
3. In **Relationships**, change the resume-agent selection on the existing dependency or child relationship, or remove one and confirm **Remove relationship**.
4. Use **More relationship types → Dependency** to add the dependency again, or **Child task** to create another child in Backlog.

Keep this task and its children in Backlog or Awaiting User Approval while reviewing. The separate archived companion lets you try **Unarchive task**.
`, "main");
  const dependency = await create("Success message dependency target", "A passive Backlog target for the Review success messages dependency. Its Relationships panel also exposes the reverse dependent relationship.", "dependency");
  await request(`/api/tasks/${main}/relationships`, { type: "dependency", targetTaskId: dependency, resumeAgentId: "architecture-designer", idempotencyKey: "success-review-v1:dependency-link" });
  const childResult = await request(`/api/tasks/${main}/children`, { boardId: "delivery", columnId: "backlog", title: "Success message child example",
    description: "A passive child of Review success messages. Its Relationships panel exposes the parent relationship for reviewing removal feedback.",
    resumeAgentId: "architecture-designer", idempotencyKey: "success-review-v1:child" });
  const archived = await create("Success message unarchive example", "Click Unarchive task to inspect its floating confirmation. This task stays in Backlog and has no agent activation.", "unarchive");
  const accepted = await request(`/api/tasks/${archived}/archive`, { background: true, idempotencyKey: "success-review-v1:archive" });
  let operation = accepted.operation;
  const deadline = Date.now() + 30_000;
  while (operation.state === "queued" || operation.state === "running") {
    if (Date.now() > deadline) throw new Error("The companion archival is still active; rerun this seed after it settles.");
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
    operation = await request(`/api/archive/operations/${operation.id}`);
  }
  if (operation.tasks[0]?.state !== "archived") throw new Error(JSON.stringify(operation));
  const tasks = { main, dependency, child: childResult.task.id, archived };
  await writeFile(manifestPath, `${JSON.stringify(tasks, null, 2)}\n`);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(tasks).map(([name, id]) => [name, `${baseUrl}/tasks/${id}`])), null, 2));
}
