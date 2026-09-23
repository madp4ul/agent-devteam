import { contrastRatio, expect, setAppearance, test } from "./browser-fixture.ts";

test("task movement offers the next board column beside the destination selector", async ({ page }) => {
  await page.goto("/tasks/T-0001");

  const movement = page.getByRole("region", { name: "Move task" });
  const selector = movement.getByRole("combobox", { name: "Move task" });
  const shortcut = movement.getByRole("button", { name: "Move to Completion" });
  const inspectableMarker = movement.getByRole("button", { name: "Agent-inspectable information" });
  await expect(selector).toHaveValue("implementation");
  await expect(shortcut).toBeVisible();
  await expect(shortcut).toHaveText("Next");
  await expect(shortcut).toHaveAttribute("title", "Move to Completion");

  const [selectorBounds, shortcutBounds, markerBounds] = await Promise.all([
    selector.boundingBox(),
    shortcut.boundingBox(),
    inspectableMarker.boundingBox(),
  ]);
  expect(selectorBounds).not.toBeNull();
  expect(shortcutBounds).not.toBeNull();
  expect(markerBounds).not.toBeNull();
  expect(shortcutBounds!.x).toBeGreaterThanOrEqual(selectorBounds!.x + selectorBounds!.width);
  expect(Math.abs(
    markerBounds!.x + markerBounds!.width -
      (shortcutBounds!.x + shortcutBounds!.width),
  )).toBeLessThanOrEqual(2);
  expect(Math.abs(
    selectorBounds!.y + selectorBounds!.height / 2 -
      (shortcutBounds!.y + shortcutBounds!.height / 2),
  )).toBeLessThanOrEqual(2);

  let releaseMove!: () => void;
  const moveReleased = new Promise<void>((resolve) => { releaseMove = resolve; });
  await page.route("**/api/tasks/T-0001/move", async (route) => {
    await moveReleased;
    await route.continue();
  });
  await shortcut.click();
  await expect(selector).toBeDisabled();
  await expect(shortcut).toBeDisabled();
  releaseMove();
  await expect(page.getByRole("status")).toContainText("Moved T-0001 to Completion");
  await expect(selector).toHaveValue("completion");
  await expect(movement.getByRole("button", { name: /^Move to / })).toHaveCount(0);
});

test("the next-column shortcut reports an authoritative stale-view conflict", async ({ page, request }) => {
  await page.goto("/tasks/T-0002");
  await expect(page.getByRole("button", { name: "Move to Implementation" })).toBeVisible();

  const current = await (await request.get("/api/tasks/T-0002")).json() as {
    task: { revision: number };
  };
  const moved = await request.post("/api/tasks/T-0002/move", {
    data: {
      destinationColumnId: "implementation",
      expectedRevision: current.task.revision,
      idempotencyKey: "concurrent-next-column-move",
    },
  });
  expect(moved.status()).toBe(200);

  await page.getByRole("button", { name: "Move to Implementation" }).click();
  await expect(page.getByRole("alert")).toContainText(/changed since this page loaded/i);
  await expect(page.getByRole("combobox", { name: "Move task" })).toHaveValue("implementation");
});

test("movement stays immediately above conversations while long task content scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.description = "Long movement context. ".repeat(700);
    await route.fulfill({ response, json: detail });
  });
  await page.goto("/tasks/T-0001");

  const stickyControls = page.locator(".detail-sticky-controls");
  const movement = page.getByRole("region", { name: "Move task" });
  const selector = movement.getByRole("combobox", { name: "Move task" });
  const conversations = page.getByRole("region", { name: "Conversations" });
  await page.getByRole("region", { name: "Task timeline" }).evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });

  await expect(stickyControls).toHaveCSS("position", "sticky");
  const [topbarBounds, movementBounds, conversationBounds] = await Promise.all([
    page.locator(".detail-topbar").boundingBox(),
    movement.boundingBox(),
    conversations.boundingBox(),
  ]);
  expect(topbarBounds).not.toBeNull();
  expect(movementBounds).not.toBeNull();
  expect(conversationBounds).not.toBeNull();
  expect(movementBounds!.y).toBeGreaterThanOrEqual(topbarBounds!.y + topbarBounds!.height);
  expect(conversationBounds!.y).toBeGreaterThanOrEqual(movementBounds!.y + movementBounds!.height);
  expect(conversationBounds!.y + conversationBounds!.height).toBeLessThanOrEqual(700);

  for (const theme of ["dark", "light"] as const) {
    await setAppearance(page, theme);
    const shortcut = movement.getByRole("button", { name: "Move to Completion" });
    await expect(shortcut).toBeVisible();
    expect(await contrastRatio(shortcut)).toBeGreaterThanOrEqual(4.5);
  }

  await page.setViewportSize({ width: 1100, height: 500 });
  await expect(stickyControls).toHaveCSS("position", "static");
  await conversations.getByRole("button", { name: /Implementation Agent/ }).scrollIntoViewIfNeeded();
  await expect(conversations.getByRole("button", { name: /Implementation Agent/ })).toBeVisible();

  await page.setViewportSize({ width: 700, height: 500 });
  await expect(stickyControls).toHaveCSS("position", "static");
  await movement.getByRole("button", { name: "Move to Completion" }).scrollIntoViewIfNeeded();
  const narrowShortcut = movement.getByRole("button", { name: "Move to Completion" });
  await expect(narrowShortcut).toBeVisible();
  const [narrowSelectorBounds, narrowShortcutBounds] = await Promise.all([
    selector.boundingBox(),
    narrowShortcut.boundingBox(),
  ]);
  expect(narrowSelectorBounds).not.toBeNull();
  expect(narrowShortcutBounds).not.toBeNull();
  expect(narrowShortcutBounds!.x).toBeGreaterThanOrEqual(
    narrowSelectorBounds!.x + narrowSelectorBounds!.width,
  );
  await conversations.getByRole("button", { name: /Implementation Agent/ }).scrollIntoViewIfNeeded();
  await expect(conversations.getByRole("button", { name: /Implementation Agent/ })).toBeVisible();
});

test("unmapped tasks keep explicit destinations without guessing a next column", async ({ page }) => {
  await page.route("**/api/tasks/T-0002", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.columnId = "retired-column";
    await route.fulfill({ response, json: detail });
  });
  await page.goto("/tasks/T-0002");

  const movement = page.getByRole("region", { name: "Move task" });
  const selector = movement.getByRole("combobox", { name: "Move task" });
  await expect(selector).toHaveValue("retired-column");
  await expect(selector.locator("option")).toHaveText([
    "Unmapped: retired-column",
    "Backlog",
    "Implementation",
    "Completion",
  ]);
  await expect(movement.getByRole("button", { name: /^Move to / })).toHaveCount(0);
});
