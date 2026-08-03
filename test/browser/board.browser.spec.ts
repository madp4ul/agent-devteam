import { expect, test } from "@playwright/test";

test("creates in any column, opens tasks directly, and restores a narrow board context", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 820 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Product delivery" })).toBeVisible();

  const lane = page.getByTestId("board-lane");
  const overflow = await lane.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    flexWrap: getComputedStyle(element).flexWrap,
  }));
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  expect(overflow.flexWrap).toBe("nowrap");

  const filter = page.getByLabel("Filter tasks");
  await filter.fill("Inspect");
  const inspectedLink = page.getByRole("link", { name: /T-0001 Inspect existing coordination/ });
  await inspectedLink.scrollIntoViewIfNeeded();
  const savedScroll = await lane.evaluate((element) => element.scrollLeft);
  await inspectedLink.click();
  await expect(page).toHaveURL(/\/tasks\/T-0001$/);
  await page.getByRole("link", { name: "Back to board" }).click();
  await expect(filter).toHaveValue("Inspect");
  await expect.poll(() => lane.evaluate((element) => element.scrollLeft)).toBe(savedScroll);

  await filter.fill("");
  await page.getByRole("button", { name: "Create task in Completion" }).click();
  await expect(page.getByLabel("Starting column")).toHaveValue("completion");
  await page.getByLabel("Outcome-oriented title").fill("Document the completed outcome");
  await page.getByLabel("Complete description").fill("Make the created task available immediately on the board.");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/Created T-\d{4} in Completion/);
  await expect(page.getByRole("link", { name: /Document the completed outcome/ })).toBeVisible();

  await page.goto("/tasks/T-0001");
  await expect(page.getByRole("heading", { name: "Inspect existing coordination" })).toBeVisible();
});

test("details keep contextual controls, one timeline, and readable transcript evidence", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  await expect(page.getByText("Understand the full task history")).toBeVisible();
  await expect(page.getByText(/Blocked by T-0002/)).toBeVisible();
  await expect(page.getByText(/Needs attention: user mention/)).toBeVisible();
  await expect(page.getByText("Please preserve the authored context")).toBeVisible();
  await expect(page.getByText("Task moved")).toBeVisible();
  await expect(page.getByText("Attempt 1")).toBeVisible();
  await expect(page.getByText("2m 30s")).toBeVisible();

  const current = page.getByRole("button", { name: /Implementation.*Current/ });
  await expect(current).toBeDisabled();
  await expect(page.getByRole("button", { name: /Backlog.*Previous/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Completion.*Next/ })).toBeEnabled();

  await page.getByText("Thread information").click();
  await page.getByRole("button", { name: "View transcript" }).click();
  const dialog = page.getByRole("dialog", { name: "Attempt transcript" });
  await expect(dialog).toContainText("thread-browser-123");
  await expect(dialog).toContainText("I inspected the current task.");
  await expect(dialog).toContainText("pnpm test (exit 0)");
  await expect(dialog).toContainText("output truncated");
  await expect(dialog.getByRole("button", { name: "Copy thread ID" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close transcript" }).click();

  await page.getByRole("button", { name: "Edit task" }).click();
  await page.getByLabel("Task title").fill("Inspect all coordination evidence");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByRole("heading", { name: "Inspect all coordination evidence" })).toBeVisible();

  await page.getByRole("button", { name: /Completion.*Next/ }).click();
  await expect(page.getByText(/Moved T-0001 to Completion/)).toBeVisible();
});

test("pointer dragging moves through the same command and conflicts stay actionable", async ({ page, request }) => {
  await page.goto("/");
  const handle = page.getByRole("button", { name: "Drag T-0002" });
  const destination = page.getByTestId("column-implementation");
  const sourceBox = await handle.boundingBox();
  const targetBox = await destination.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (sourceBox === null || targetBox === null) return;
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 100, { steps: 12 });
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
  await page.getByRole("button", { name: /Completion.*Next/ }).click();
  await expect(page.getByRole("alert")).toContainText(/changed since this page loaded/i);

  await page.getByRole("button", { name: "Edit task" }).click();
  const latestRevision = Number(
    (await page.getByText(/Revision \d+/).textContent())?.replace("Revision ", ""),
  );
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
