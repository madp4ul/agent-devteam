import { expect, test } from "./browser-fixture.ts";


test("configuration errors show the invalid value with the actionable diagnostic", async ({ page }) => {
  await page.route("**/api/board", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        startup: {
          mode: "configuration-error",
          diagnostics: [{
            file: "process.yaml",
            line: 12,
            column: 24,
            invalidValue: "missing-agent",
            rule: "The referenced watching agent must exist.",
            consequence: "The process cannot be applied.",
            correction: "Reference a declared agent ID.",
          }],
          automation: { state: "blocked", attemptsMayStart: false },
        },
        automation: { state: "blocked", attemptsMayStart: false },
        boards: [],
        attention: [],
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Configuration error" })).toBeVisible();
  await expect(page.getByText("Invalid value: missing-agent")).toBeVisible();
});


test("creates in workflow columns, opens tasks directly, and restores a narrow board context", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 820 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Product delivery" })).toBeVisible();
  await page.getByRole("radio", { name: "Column layout" }).check();

  const lane = page.getByTestId("board-lane");
  const overflow = await lane.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    flexWrap: getComputedStyle(element).flexWrap,
  }));
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  expect(overflow.flexWrap).toBe("nowrap");

  const filter = page.getByLabel("Filter tasks");
  const archivedToggle = page.getByRole("button", { name: "Show archived tasks" });
  await archivedToggle.click();
  await expect(archivedToggle).toHaveAttribute("aria-pressed", "true");
  await filter.fill("Inspect");
  const inspectedLink = page.getByRole("link", { name: /T-0001 Inspect existing coordination/ });
  await inspectedLink.scrollIntoViewIfNeeded();
  const savedScroll = await lane.evaluate((element) => element.scrollLeft);
  await inspectedLink.click();
  await expect(page).toHaveURL(/\/tasks\/T-0001$/);
  await page.getByRole("link", { name: "Back to board" }).click();
  await expect(filter).toHaveValue("Inspect");
  await expect(archivedToggle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => lane.evaluate((element) => element.scrollLeft)).toBe(savedScroll);

  await filter.fill("");
  await expect(page.getByRole("button", { name: "Create task in Completion" })).toHaveCount(0);
  await page.getByRole("button", { name: "Create task in Backlog" }).click();
  await expect(page.getByLabel("Starting column")).toHaveValue("backlog");
  await expect(page.getByLabel("Starting column").locator('option[value="completion"]')).toHaveCount(0);
  await page.getByLabel("Starting column").selectOption("implementation");
  await page.getByLabel("Outcome-oriented title").fill("Start a deliberate implementation");
  await page.getByLabel("Complete description").fill("Keep deliberate workflow placement without allowing completed-at-creation work.");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/Created T-\d{4} in Implementation/);
  await expect(page.getByRole("link", { name: /Start a deliberate implementation/ })).toBeVisible();

  await page.goto("/tasks/T-0001");
  await expect(page.getByRole("heading", { name: "Inspect existing coordination" })).toBeVisible();
});


test("row layout is compact, independently scrollable, and remembered globally", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const board = body.boards[0];
    const template = board.columns.flatMap((column: { tasks: unknown[] }) => column.tasks)[0];
    for (const [columnIndex, column] of board.columns.slice(0, 2).entries()) {
      column.tasks = Array.from({ length: 8 }, (_, taskIndex) => ({
        ...template,
        id: `LAYOUT-${columnIndex}-${taskIndex}`,
        title: `Layout card ${columnIndex}-${taskIndex}`,
        column: { id: column.id, name: column.name },
      }));
    }
    board.columns.find((column: { id: string }) => column.id === "completion").tasks = [];
    body.attention = [];
    await route.fulfill({ response, json: body });
  });

  await page.goto("/");
  const rowChoice = page.getByRole("radio", { name: "Row layout" });
  const columnChoice = page.getByRole("radio", { name: "Column layout" });
  await expect(rowChoice).toBeChecked();

  const backlog = page.getByTestId("column-backlog");
  const implementation = page.getByTestId("column-implementation");
  const completion = page.getByTestId("column-completion");
  await expect(page.locator(".needs-attention")).toHaveCount(0);
  await expect(backlog).toContainText("User");
  await expect(backlog).not.toContainText("No watching agent");
  await expect(backlog).toHaveClass(/user-owned/);
  await expect(implementation).toContainText("Implementation Agent");
  await expect(implementation).not.toContainText("Watched by");
  await expect(completion).not.toContainText(/User|No watching agent/);
  await expect(completion).not.toHaveClass(/user-owned/);
  await expect(completion.getByRole("button", { name: "Create task in Completion" })).toHaveCount(0);
  await expect(backlog.getByRole("button", { name: "Create task in Backlog" })).toBeVisible();
  await expect(backlog.getByRole("button", { name: "Create task in Backlog" }).locator("svg"))
    .toBeVisible();
  await expect.poll(() => completion.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThan(100);
  const backlogStrip = backlog.getByTestId("task-strip");
  const implementationStrip = implementation.getByTestId("task-strip");
  const backlogPosition = await backlogStrip.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return element.scrollLeft;
  });
  expect(backlogPosition).toBeGreaterThan(0);
  expect(await implementationStrip.evaluate((element) => element.scrollLeft)).toBe(0);

  await page.getByLabel("Filter tasks").fill("does not match any card");
  await expect.poll(() => backlog.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThan(100);
  await page.getByLabel("Filter tasks").fill("");
  await expect.poll(() => backlogStrip.evaluate((element) => element.scrollLeft)).toBe(backlogPosition);

  await columnChoice.check();
  await expect(columnChoice).toBeChecked();
  await rowChoice.check();
  await expect.poll(() => backlogStrip.evaluate((element) => element.scrollLeft)).toBe(backlogPosition);
  await columnChoice.check();
  await page.reload();
  await expect(columnChoice).toBeChecked();
  await expect(page.getByTestId("board-lane")).toHaveCSS("flex-wrap", "nowrap");
});


test("newly entered tasks are newest-first in both board layouts", async ({ page }) => {
  await page.goto("/");
  const createInBacklog = page.getByRole("button", { name: "Create task in Backlog" });
  for (const title of ["Ordering example older", "Ordering example newer"]) {
    await createInBacklog.click();
    await page.getByLabel("Outcome-oriented title").fill(title);
    await page.getByLabel("Complete description").fill("Verify current-column-entry ordering.");
    await page.getByRole("button", { name: "Create task", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Created");
  }

  const older = page.getByRole("link", { name: /Ordering example older/ }).locator("..");
  const newer = page.getByRole("link", { name: /Ordering example newer/ }).locator("..");
  expect((await newer.boundingBox())?.x).toBeLessThan((await older.boundingBox())?.x ?? 0);

  await page.getByRole("radio", { name: "Column layout" }).check();
  expect((await newer.boundingBox())?.y).toBeLessThan((await older.boundingBox())?.y ?? 0);
});


test("automatic board refresh preserves the user's current horizontal position", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 820 });
  let boardReads = 0;
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    boardReads += 1;
    body.startup.processName = `Scroll refresh ${boardReads}`;
    const backlog = body.boards[0].columns.find((column: { id: string }) => column.id === "backlog");
    const template = backlog.tasks[0];
    backlog.tasks = Array.from({ length: 8 }, (_, index) => ({
      ...template,
      id: index === 0 ? template.id : `SCROLL-${index}`,
      title: index === 0 ? template.title : `Overflow card ${index}`,
    }));
    body.activeRuns = [{
      attemptId: "scroll-refresh-attempt",
      taskId: "T-0002",
      taskTitle: "Drag this task",
      boardId: "delivery",
      boardName: "Product delivery",
      columnId: "backlog",
      columnName: "Backlog",
      agentId: "consulting-agent",
      status: "running",
      startedAt: new Date(Date.now() - 65_000).toISOString(),
    }];
    await route.fulfill({ response, json: body });
  });

  await page.goto("/");
  await expect(page.getByRole("radio", { name: "Row layout" })).toBeChecked();
  const lane = page.getByTestId("column-backlog").getByTestId("task-strip");
  const renderedBoardRead = async (): Promise<number> => Number(
    (await page.locator(".board-brand h1").textContent())?.replace("Scroll refresh ", ""),
  );
  await expect(lane).toBeVisible();
  const directPosition = await lane.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return element.scrollLeft;
  });
  const readsAfterDirectScroll = await renderedBoardRead();
  await expect.poll(renderedBoardRead).toBeGreaterThan(readsAfterDirectScroll);
  expect(await lane.evaluate((element) => element.scrollLeft)).toBe(directPosition);

  await lane.evaluate((element) => { element.scrollLeft = 3; });
  await page.getByRole("link", { name: /T-0001 Inspect existing coordination/ }).click();
  await expect(page).toHaveURL(/\/tasks\/T-0001$/);
  await page.getByRole("link", { name: "Back to board" }).click();
  await expect.poll(() => lane.evaluate((element) => element.scrollLeft)).toBe(3);

  const userPosition = await lane.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return element.scrollLeft;
  });
  const readsAfterUserScroll = await renderedBoardRead();
  await expect.poll(renderedBoardRead).toBeGreaterThan(readsAfterUserScroll);
  expect(await lane.evaluate((element) => element.scrollLeft)).toBe(userPosition);
});


test("pointer dragging moves through the same command and conflicts stay actionable", async ({ page, request }) => {
  await page.goto("/");
  await page.getByLabel("Filter tasks").fill("Drag this task");
  const handle = page.getByRole("button", { name: "Drag T-0002" });
  const source = page.getByTestId("column-backlog");
  const destination = page.getByTestId("column-implementation");
  await handle.scrollIntoViewIfNeeded();
  const sourceBox = await handle.boundingBox();
  const targetBox = await destination.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (sourceBox === null || targetBox === null) return;
  const sourceGeometry = await source.boundingBox();
  const destinationGeometry = await destination.boundingBox();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await expect(destination).toHaveClass(/drop-target/);
  expect(await source.boundingBox()).toEqual(sourceGeometry);
  expect(await destination.boundingBox()).toEqual(destinationGeometry);
  await page.mouse.up();
  await expect(page.getByRole("status")).toContainText("Moved T-0002 to Implementation");
  await expect(destination.getByRole("link", { name: /T-0002 Drag this task/ })).toBeVisible();

  await page.goto("/tasks/T-0002");
  await request.post("/api/tasks/T-0002/move", {
    data: {
      destinationColumnId: "backlog",
      expectedRevision: 2,
      idempotencyKey: "concurrent-browser-move",
    },
  });
  await page.getByRole("combobox", { name: "Move task" }).selectOption("completion");
  await expect(page.getByRole("alert")).toContainText(/changed since this page loaded/i);

  await page.getByRole("button", { name: "Edit task" }).click();
  const latestDetail = await (await request.get("/api/tasks/T-0002")).json() as {
    task: { revision: number };
  };
  const latestRevision = latestDetail.task.revision;
  await request.patch("/api/tasks/T-0002", {
    data: {
      title: "Concurrent authoritative title",
      description: "The browser must restore this authoritative edit after a conflict.",
      expectedRevision: latestRevision,
      idempotencyKey: "concurrent-browser-edit",
    },
  });
  await page.getByLabel("Task title").fill("Stale local title");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByRole("alert")).toContainText(/changed since this page loaded/i);
  await expect(page.getByRole("heading", { name: "Concurrent authoritative title" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: /Edit/ })).toHaveCount(0);
});


test("dropping a task into its current column is inert", async ({ page, request }) => {
  const created = await (await request.post("/api/tasks", {
    data: {
      boardId: "delivery",
      columnId: "backlog",
      title: "Drop this task back",
      description: "Returning a drag to its source column must be inert.",
      idempotencyKey: "browser-inert-drag-task",
    },
  })).json() as { task: { id: string } };
  const taskId = created.task.id;
  let moveRequests = 0;
  await page.route("**/api/tasks/*/move", async (route) => {
    moveRequests += 1;
    await route.continue();
  });
  const before = await (await request.get(`/api/tasks/${taskId}`)).json() as {
    task: { revision: number; activity: unknown[]; activations: unknown[] };
  };
  await page.goto("/");
  await page.getByLabel("Filter tasks").fill("Drop this task back");
  const handle = page.getByRole("button", { name: `Drag ${taskId}` });
  const currentColumn = page.getByTestId("column-backlog");
  const otherColumn = page.getByTestId("column-implementation");
  await handle.scrollIntoViewIfNeeded();
  const sourceBox = await handle.boundingBox();
  const targetBox = await currentColumn.boundingBox();
  const otherBox = await otherColumn.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  expect(otherBox).not.toBeNull();
  if (sourceBox === null || targetBox === null || otherBox === null) return;

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(otherBox.x + otherBox.width / 2, otherBox.y + otherBox.height / 2, { steps: 12 });
  await expect(otherColumn).toHaveClass(/drop-target/);
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await expect(currentColumn).toHaveClass(/drop-target/);
  await page.mouse.up();

  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(moveRequests).toBe(0);
  const after = await (await request.get(`/api/tasks/${taskId}`)).json() as typeof before;
  expect(after.task.revision).toBe(before.task.revision);
  expect(after.task.activity).toEqual(before.task.activity);
  expect(after.task.activations).toEqual(before.task.activations);
});


test("a late board poll cannot replace a newer command refresh", async ({ page }) => {
  let boardReads = 0;
  let releaseStalePoll!: () => void;
  let markStalePollStarted!: () => void;
  const stalePollReleased = new Promise<void>((resolve) => { releaseStalePoll = resolve; });
  const stalePollStarted = new Promise<void>((resolve) => { markStalePollStarted = resolve; });

  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const readNumber = ++boardReads;
    body.startup.processName = readNumber === 1
      ? "Initial refresh"
      : readNumber === 2
        ? "Stale refresh"
        : "Newest refresh";
    body.activeRuns = readNumber === 1 ? [{
      attemptId: "stale-response-attempt",
      taskId: "T-0002",
      taskTitle: "Drag this task",
      boardId: "delivery",
      boardName: "Product delivery",
      columnId: "backlog",
      columnName: "Backlog",
      agentId: "implementer",
      status: "running",
      startedAt: new Date().toISOString(),
    }] : [];
    body.automation = readNumber === 1
      ? { state: "running", attemptsMayStart: true }
      : { state: "paused", attemptsMayStart: false };
    if (readNumber === 2) {
      markStalePollStarted();
      await stalePollReleased;
    }
    await route.fulfill({
      response,
      json: body,
      headers: { ...response.headers(), "x-refresh-read": String(readNumber) },
    });
  });
  await page.route("**/api/automation/pause", async (route) => {
    await route.fulfill({
      status: 200,
      json: { accepted: true, automation: { state: "pausing", attemptsMayStart: false } },
    });
  });

  await page.goto("/");
  const processName = page.locator(".board-brand h1");
  await expect(processName).toHaveText("Initial refresh");
  await stalePollStarted;

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(processName).toHaveText("Newest refresh");

  const staleResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/board") && response.headers()["x-refresh-read"] === "2"
  );
  releaseStalePoll();
  await staleResponse;
  await page.waitForTimeout(100);
  expect(await processName.textContent()).toBe("Newest refresh");

  await page.waitForTimeout(1_200);
  expect(boardReads).toBe(3);
});
