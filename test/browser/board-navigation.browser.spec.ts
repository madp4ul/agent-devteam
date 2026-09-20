import { expect, test, setAppearance } from "./browser-fixture.ts";

for (const theme of ["dark", "light"] as const) {
for (const back of ["in-app", "browser"] as const) {
test(`${theme} ${back} Back restores board reading position after loading and refresh`, async ({ page }) => {
  let reads = 0;
  await page.setViewportSize({ width: 760, height: 700 });
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.startup.processName = `Navigation refresh ${++reads}`;
    body.automation = { state: "pausing", attemptsMayStart: false };
    const column = body.boards[0].columns[1];
    const task = column.tasks.find((task: { id: string }) => task.id === "T-0001");
    column.tasks = [
      ...Array.from({ length: 15 }, (_, index) => ({ ...task, id: `READ-${index}` })),
      task,
    ];
    body.attention = [];
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await setAppearance(page, theme);
  await page.getByRole("radio", { name: "Column layout" }).check();
  await page.getByLabel("Filter tasks").fill("Inspect");
  await page.getByRole("button", { name: "Show archived tasks" }).click();
  const task = page.getByRole("link", { name: /T-0001 Inspect existing coordination/ });
  await task.scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => window.scrollY);
  expect(position).toBeGreaterThan(500);
  await task.click();
  await expect(page.getByRole("heading", { name: "Inspect existing coordination" })).toBeVisible();
  if (back === "in-app") await page.getByRole("link", { name: "Back to board" }).click();
  else await page.goBack();
  await expect(page.getByRole("radio", { name: "Column layout" })).toBeChecked();
  await expect(page.getByLabel("Filter tasks")).toHaveValue("Inspect");
  await expect(page.getByRole("button", { name: "Show archived tasks" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(position);
  await expect(task).toBeInViewport();
  await page.evaluate(() => window.scrollBy(0, -250));
  const userPosition = await page.evaluate(() => window.scrollY);
  const currentRead = await page.locator(".board-brand h1").textContent();
  await expect(page.locator(".board-brand h1")).not.toHaveText(currentRead!);
  expect(await page.evaluate(() => window.scrollY)).toBe(userPosition);
});
}
}

test("return waits for archived cards before restoring a row's horizontal position", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 700 });
  let returning = false;
  let releaseArchives!: () => void;
  const archivesReleased = new Promise<void>((resolve) => { releaseArchives = resolve; });
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.attention = [];
    body.boards[0].columns[1].tasks = [];
    body.boards.unshift({
      ...body.boards[0], id: "other", name: "Other board",
      columns: body.boards[0].columns.map((column: { id: string }) => ({
        ...column, id: `other-${column.id}`, tasks: [],
      })),
    });
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/archive", async (route) => {
    const response = await page.request.get("/api/board");
    const body = await response.json();
    const task = body.boards[0].columns[1].tasks.find((task: { id: string }) => task.id === "T-0001");
    if (returning) await archivesReleased;
    await route.fulfill({ json: { tasks: [
      ...Array.from({ length: 12 }, (_, index) => ({ ...task, id: `ARCHIVE-${index}`, archived: true })),
      { ...task, archived: true },
    ] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Show archived tasks" }).click();
  const task = page.getByRole("link", { name: /T-0001 Inspect existing coordination/ });
  await task.scrollIntoViewIfNeeded();
  const strip = page.getByTestId("column-implementation").getByTestId("task-strip");
  const position = await strip.evaluate((element) => element.scrollLeft);
  const verticalPosition = await page.evaluate(() => window.scrollY);
  expect(position).toBeGreaterThan(500);
  expect(verticalPosition).toBeGreaterThan(0);
  await task.click();
  await expect(page.getByRole("heading", { name: "Inspect existing coordination" })).toBeVisible();
  returning = true;
  await page.goBack();
  await expect(page.getByRole("radio", { name: "Row layout" })).toBeChecked();
  releaseArchives();
  await expect(task).toBeVisible();
  await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBe(position);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(verticalPosition);
  await expect(task).toBeInViewport();
});

for (const change of ["moves", "disappears"] as const) {
test(`return uses fresh board content when the originating task ${change}`, async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 700 });
  let moved = false;
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const board = body.boards[0];
    const column = board.columns[1];
    const task = column.tasks.find((task: { id: string }) => task.id === "T-0001");
    column.tasks = Array.from({ length: 15 }, (_, index) => ({ ...task, id: `MOVE-${index}` }));
    const destination = moved ? board.columns[0] : column;
    if (!moved || change === "moves") {
      destination.tasks.push({ ...task, column: { id: destination.id, name: destination.name } });
    }
    body.attention = [];
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await page.getByRole("radio", { name: "Column layout" }).check();
  const task = page.getByRole("link", { name: /T-0001 Inspect existing coordination/ });
  await task.scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => window.scrollY);
  await task.click();
  await expect(page.getByRole("heading", { name: "Inspect existing coordination" })).toBeVisible();
  moved = true;
  await page.goBack();
  await expect(page.getByRole("radio", { name: "Column layout" })).toBeChecked();
  if (change === "moves") {
    await expect(page.getByTestId("column-backlog").getByRole("link", { name: /T-0001/ })).toBeVisible();
    await expect(task).toBeInViewport();
  } else {
    await expect(task).toHaveCount(0);
    const maximum = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(Math.min(position, maximum));
  }
});
}

test("clearing a restored filter retains the unfiltered row reading position", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 700 });
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const column = body.boards[0].columns[1];
    const task = column.tasks.find((task: { id: string }) => task.id === "T-0001");
    column.tasks = [task, ...Array.from({ length: 12 }, (_, index) => ({
      ...task, id: `FILTER-${index}`, title: `Other card ${index}`,
    }))];
    body.attention = [];
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  const strip = page.getByTestId("column-implementation").getByTestId("task-strip");
  await expect(strip).toBeVisible();
  const position = await strip.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return element.scrollLeft;
  });
  expect(position).toBeGreaterThan(500);
  await page.getByLabel("Filter tasks").fill("Inspect");
  await page.getByRole("link", { name: /T-0001 Inspect existing coordination/ }).click();
  await expect(page.getByRole("heading", { name: "Inspect existing coordination" })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("Filter tasks")).toHaveValue("Inspect");
  await page.getByLabel("Filter tasks").fill("");
  await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBe(position);
});

test("return reveals a reordered row card clipped behind its column heading", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 700 });
  let reordered = false;
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const column = body.boards[0].columns[1];
    const task = column.tasks.find((task: { id: string }) => task.id === "T-0001");
    column.tasks = Array.from({ length: 15 }, (_, index) => ({ ...task, id: `ROW-${index}` }));
    column.tasks.splice(reordered ? 7 : 8, 0, task);
    body.attention = [];
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  const task = page.getByRole("link", { name: /T-0001 Inspect existing coordination/ });
  await task.evaluate((element) => element.parentElement!.scrollIntoView({ inline: "start", block: "nearest" }));
  await task.click();
  await expect(page.getByRole("heading", { name: "Inspect existing coordination" })).toBeVisible();
  reordered = true;
  await page.goBack();
  await expect(task).toBeInViewport();
});
