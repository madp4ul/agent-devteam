import { contrastRatio, expect, setAppearance, test } from "./browser-fixture.ts";
import type { BrowserBoardState } from "../../src/web/client/api.ts";
import type { TaskOverviewView } from "../../src/application/task-contract.ts";

test("boards start collapsed, ignore old layout preferences, and remember independent expansion", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("coordination-board-layout", "column"));
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.boards.push({ ...body.boards[0], id: "empty", name: "Empty board",
      columns: body.boards[0].columns.map((column: object) => ({ ...column, tasks: [] })) });
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  const board = page.getByRole("region", { name: "Product delivery", exact: true });
  const empty = page.getByRole("region", { name: "Empty board", exact: true });
  await expect(board.getByRole("button", { name: "Expand Product delivery" })).toHaveAttribute("aria-expanded", "false");
  await expect(empty.locator(".board-column")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /layout/ })).toHaveCount(0);
  await expect(board.getByTestId("board-lane")).toHaveCSS("display", "grid");
  await empty.getByRole("button", { name: "Expand Empty board" }).click();
  await expect(empty.locator(".board-column")).toHaveCount(3);
  await expect(board.getByRole("button", { name: "Expand Product delivery" })).toBeVisible();
  await page.reload();
  await expect(empty.getByRole("button", { name: "Collapse Empty board" })).toHaveAttribute("aria-expanded", "true");
  await expect(board.getByRole("button", { name: "Expand Product delivery" })).toHaveAttribute("aria-expanded", "false");
});

test("any task signal retains its whole column while ordinary completed work stays hidden", async ({ page }) => {
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body: BrowserBoardState = await response.json();
    const board = body.boards[0]!;
    const watched = board.columns[1]!;
    const template = watched.tasks.find((task) => task.id === "T-0001")!;
    const idle: TaskOverviewView = { ...template, waitingOn: { taskIds: [] }, unresolvedAttention: [],
      run: { status: "idle", activeAgentId: null, queuedActivationCount: 0, failedActivationCount: 0 } };
    const cases: Array<[string, Partial<TaskOverviewView>]> = [
      ["active", { run: { ...idle.run, activeAgentId: "implementer", status: "running" } }],
      ["waiting", { waitingOn: { taskIds: ["other"] } }],
      ["attention", { unresolvedAttention: [{ id: "attention", type: "user-mention", sourceEventId: null, createdAt: "2026-11-08T00:00:00Z" }] }],
      ["queued", { run: { ...idle.run, queuedActivationCount: 1, status: "queued" } }],
      ["failed", { run: { ...idle.run, failedActivationCount: 1, status: "failed" } }],
      ["startup", { startupFailure: { activationId: "activation", boundary: "repository-access", diagnostic: "Access failed", occurredAt: "2026-11-08T00:00:00Z", resolvedAt: null } }],
      ["user", {}], ["quiet", {}], ["completion", {}], ["completed-active", { run: { ...idle.run, activeAgentId: "implementer", status: "running" } }],
    ];
    board.columns = cases.map(([id, changes]) => ({ ...watched, id, name: id,
      frameworkOwned: id === "completion" || id === "completed-active",
      watchingAgent: ["user", "completion", "completed-active"].includes(id) ? null : watched.watchingAgent,
      tasks: [{ ...idle, ...changes, id: `${id}-signal`, title: `${id} signal` }, { ...idle, id: `${id}-companion`, title: `${id} companion` }],
    }));
    body.attention = [];
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Product delivery" })).toBeVisible();
  for (const id of ["active", "waiting", "attention", "queued", "failed", "startup", "user", "completed-active"]) {
    await expect(page.getByTestId(`column-${id}`).locator(".task-card")).toHaveCount(2);
  }
  await expect(page.getByTestId("column-quiet")).toHaveCount(0);
  await expect(page.getByTestId("column-completion")).toHaveCount(0);
  await page.getByLabel("Filter tasks").fill("completion companion");
  await expect(page.getByRole("link", { name: "completion-companion completion companion" })).toBeVisible();
  await page.getByLabel("Filter tasks").fill("");
  await expect(page.getByTestId("column-completion")).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Product delivery" }).click();
  await expect(page.getByTestId("column-completion").locator(".task-card")).toHaveCount(2);
});

for (const theme of ["dark", "light"] as const) {
  test(`${theme} board disclosure is quiet, centered and keyboard operable`, async ({ page }) => {
    await page.setViewportSize({ width: 560, height: 800 });
    await page.goto("/");
    await setAppearance(page, theme);
    const toggle = page.locator(".board-disclosure");
    for (const expanded of [false, true]) {
      await expect(toggle).toHaveAttribute("aria-expanded", String(expanded));
      const centers = await toggle.evaluate((button) => {
        const box = button.getBoundingClientRect();
        const icon = button.querySelector("svg")!.getBoundingClientRect();
        return { x: Math.abs(box.x + box.width / 2 - icon.x - icon.width / 2), y: Math.abs(box.y + box.height / 2 - icon.y - icon.height / 2) };
      });
      expect(centers.x).toBeLessThan(1);
      expect(centers.y).toBeLessThan(1);
      expect(await contrastRatio(toggle)).toBeGreaterThanOrEqual(3);
      await toggle.focus();
      expect(await contrastRatio(toggle)).toBeGreaterThanOrEqual(3);
      await page.keyboard.press("Enter");
    }
  });
}

test("collapsed visibility follows activity in both directions even from idle", async ({ page }) => {
  let active = false;
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body: BrowserBoardState = await response.json();
    const column = body.boards[0]!.columns[1]!;
    const template = column.tasks.find((task) => task.id === "T-0001")!;
    column.tasks = [{ ...template, waitingOn: { taskIds: [] }, unresolvedAttention: [],
      run: { status: active ? "running" : "idle", activeAgentId: active ? "implementer" : null,
        queuedActivationCount: 0, failedActivationCount: 0 } }];
    body.activeRuns = [];
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Product delivery" })).toBeVisible();
  await expect(page.getByTestId("column-implementation")).toHaveCount(0);
  active = true;
  await expect(page.getByTestId("column-implementation")).toBeVisible({ timeout: 8_000 });
  active = false;
  await expect(page.getByTestId("column-implementation")).toHaveCount(0, { timeout: 8_000 });
});
