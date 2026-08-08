import { expect, test } from "@playwright/test";

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
  await expect(page.getByText("Model: Codex default · Reasoning: Codex default")).toBeVisible();

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

test("task details create children and dependencies through contextual controls", async ({ page }) => {
  await page.goto("/tasks/T-0002");

  await expect(page.getByText("Dependency: T-0001 → T-0002")).toBeVisible();
  await expect(page.getByLabel("Blocking task ID")).not.toBeVisible();
  await expect(page.getByLabel("Starting Git ref (optional)")).not.toBeVisible();
  await page.getByText("Manage relationships", { exact: true }).click();

  const dependencyForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Add dependency" }) });
  await dependencyForm.getByLabel("Blocking task ID").fill("T-0003");
  await dependencyForm.getByRole("button", { name: "Add dependency" }).click();
  await expect(page.getByText("Blocked by T-0003")).toBeVisible();

  const childForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Create child task" }) });
  await childForm.getByLabel("Title").fill("Investigate a focused child outcome");
  await childForm.getByLabel("Description").fill("Keep the child isolated from dirty parent files.");
  await childForm.getByLabel("Column").selectOption("backlog");
  await childForm.getByLabel("Starting Git ref (optional)").fill("main");
  await childForm.getByRole("button", { name: "Create child" }).click();
  await expect(page.getByRole("status")).toContainText(/Created child T-\d{4}/);
  await expect(page.getByText(/Parent \/ child: T-0002/)).toBeVisible();
});

test("pre-attempt startup diagnostics remain discoverable after navigation", async ({ page }) => {
  await page.goto("/");
  const failedLink = page.getByRole("link", { name: /T-0003 Recover a workspace startup failure/ });
  const failedCard = failedLink.locator("..");
  await expect(failedCard).toContainText(/failed/i);
  await expect(failedCard).toContainText(/attention/i);
  await expect(failedCard).toContainText("Startup failed before attempt · repository-access");
  await expect(failedCard).toContainText(/Could not access project repository/);
  await failedLink.click();
  await expect(page.getByText("Startup failed before attempt")).toBeVisible();
  await expect(page.getByText(/Boundary: repository-access/)).toBeVisible();
  await expect(page.locator(".diagnostic").filter({ hasText: "Could not access project repository" }))
    .toBeVisible();
  const currentState = page.getByRole("region", { name: "Implementation" });
  await expect(currentState.getByText("Requested model").locator("..")).toContainText("Codex default");
  await expect(currentState.getByText("Requested reasoning").locator("..")).toContainText("Codex default");
  await page.getByRole("link", { name: "Back to board" }).click();
  await page.goto("/tasks/T-0003");
  await expect(page.locator(".diagnostic").filter({ hasText: "missing-project-repository" }))
    .toBeVisible();
});

test("failed activation recovery is explicit on the current attention reason", async ({ page }) => {
  await page.goto("/");
  const recovery = page.locator(".attention-groups > li").filter({
    hasText: "Recover a workspace startup failure",
  });
  await expect(recovery).toContainText(/Could not access project repository/);
  await expect(recovery.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(recovery.getByRole("button", { name: "Dismiss" })).toBeVisible();
  await recovery.getByRole("button", { name: "Retry" }).click();
  await expect(recovery).toHaveCount(0);
});

test("permission attention explains why automatic retry is unavailable", async ({ page }) => {
  await page.goto("/tasks/T-0001?attention=browser-permission-attention");
  const reason = page.locator(".attention-list li").filter({
    hasText: "Writing the protected release file requires user approval.",
  });
  await expect(reason).toContainText("Automatic retry is unavailable for permission blocks.");
  await expect(reason.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect(reason.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

test("desktop notifications are opt-in, privacy-safe, suppressed on the active task, and navigate without resolving", async ({ page, request }) => {
  await page.addInitScript(() => {
    const notifications: Array<{
      title: string;
      options: NotificationOptions;
      onclick: (() => void) | null;
      close(): void;
    }> = [];
    class ControlledNotification {
      static permission: NotificationPermission = "default";
      static requestCount = 0;
      static async requestPermission(): Promise<NotificationPermission> {
        ControlledNotification.requestCount += 1;
        ControlledNotification.permission = "granted";
        return "granted";
      }
      readonly title: string;
      readonly options: NotificationOptions;
      onclick: (() => void) | null = null;
      constructor(title: string, options: NotificationOptions = {}) {
        this.title = title;
        this.options = options;
        notifications.push(this);
      }
      close(): void {}
    }
    Object.defineProperty(window, "Notification", { value: ControlledNotification, configurable: true });
    Object.assign(window, { __controlledNotifications: notifications, __ControlledNotification: ControlledNotification });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Desktop notifications off" })).toBeVisible();
  expect(await page.evaluate(() => Notification.permission)).toBe("default");
  await page.getByRole("button", { name: "Desktop notifications off" }).click();
  await expect(page.getByRole("button", { name: "Desktop notifications on" })).toBeVisible();
  await page.waitForTimeout(1_700);
  expect(await page.evaluate(() => (window as typeof window & { __controlledNotifications: unknown[] }).__controlledNotifications.length)).toBe(0);

  await page.getByRole("link", { name: /T-0002 Drag this task/ }).click();
  await expect(page).toHaveURL(/\/tasks\/T-0002$/);
  await page.getByRole("textbox", { name: "Comment" }).fill("@user please inspect this while I am open.");
  await page.getByRole("button", { name: "Add comment" }).click();
  await page.waitForTimeout(1_700);
  expect(await page.evaluate(() => (window as typeof window & { __controlledNotifications: unknown[] }).__controlledNotifications.length)).toBe(0);

  await page.getByRole("link", { name: "Back to board" }).click();
  await expect(page).toHaveURL(/\/$/);
  await request.post("/api/tasks/T-0001/comments", {
    data: {
      body: "@user private comment text must not appear in the desktop notification.",
      idempotencyKey: "controlled-notification-comment",
    },
  });
  await expect.poll(() => page.evaluate(() => {
    const controlled = window as typeof window & { __controlledNotifications: unknown[] };
    return controlled.__controlledNotifications.length;
  })).toBe(1);
  const delivered = await page.evaluate(() => {
    const controlled = window as typeof window & {
      __controlledNotifications: Array<{ title: string; options: NotificationOptions }>;
      __ControlledNotification: { requestCount: number };
    };
    const notification = controlled.__controlledNotifications[0];
    return {
      title: notification?.title,
      body: notification?.options.body,
      tag: notification?.options.tag,
      requestCount: controlled.__ControlledNotification.requestCount,
    };
  });
  expect(delivered.requestCount).toBe(1);
  expect(delivered.title).toBe("Product delivery · T-0001");
  expect(delivered.body).toBe("Inspect all coordination evidence · user mention");
  expect(JSON.stringify(delivered)).not.toContain("private comment text");
  await page.waitForTimeout(1_700);
  expect(await page.evaluate(() => (window as typeof window & { __controlledNotifications: unknown[] }).__controlledNotifications.length)).toBe(1);
  await page.evaluate(() => {
    const controlled = window as typeof window & {
      __controlledNotifications: Array<{ onclick: (() => void) | null }>;
    };
    controlled.__controlledNotifications[0]?.onclick?.();
  });
  await expect(page).toHaveURL(new RegExp(`/tasks/T-0001\\?attention=${delivered.tag}$`));
  await expect(page.locator(".attention-list .highlighted")).toContainText("user mention");
});

test("notification delivery failure is attempted once while durable attention remains", async ({ page, request }) => {
  await page.addInitScript(() => {
    class FailingNotification {
      static permission: NotificationPermission = "default";
      static attempts = 0;
      static async requestPermission(): Promise<NotificationPermission> {
        FailingNotification.permission = "granted";
        return "granted";
      }
      constructor() {
        FailingNotification.attempts += 1;
        throw new Error("Operating-system notification service is unavailable");
      }
    }
    Object.defineProperty(window, "Notification", { value: FailingNotification, configurable: true });
    Object.assign(window, { __FailingNotification: FailingNotification });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Desktop notifications off" }).click();
  await request.post("/api/tasks/T-0002/comments", {
    data: {
      body: "@user delivery failure must not lose this reason.",
      idempotencyKey: "failing-notification-comment",
    },
  });
  await expect.poll(() => page.evaluate(() => {
    const controlled = window as typeof window & { __FailingNotification: { attempts: number } };
    return controlled.__FailingNotification.attempts;
  })).toBe(1);
  await page.waitForTimeout(1_700);
  expect(await page.evaluate(() => {
    const controlled = window as typeof window & { __FailingNotification: { attempts: number } };
    return controlled.__FailingNotification.attempts;
  })).toBe(1);
  const board = await request.get("/api/board");
  const body = await board.json() as {
    attention: Array<{ task: { id: string }; reasons: Array<{ type: string }> }>;
  };
  expect(body.attention.find((group) => group.task.id === "T-0002")?.reasons)
    .toContainEqual(expect.objectContaining({ type: "user-mention" }));
});

test("an unavailable Notification API leaves desktop delivery unavailable without affecting the board", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "Notification");
  });
  await page.goto("/");
  await expect(page.getByText("Desktop notifications unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: /Desktop notifications/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
});

test("needs attention groups by task, locates the card, opens details, and resolves independently", async ({ page }) => {
  await page.goto("/");
  const group = page.locator(".attention-groups > li").filter({ hasText: "T-0001" });
  await expect(group).toContainText("user mention");
  await group.getByRole("button", { name: "Locate card" }).click();
  await expect(page.locator('[data-task-id="T-0001"]')).toHaveClass(/highlighted/);
  await group.getByRole("button", { name: "Open details" }).click();
  await expect(page).toHaveURL(/\/tasks\/T-0001$/);
  const attentionReasons = page.locator(".attention-list li");
  await expect(attentionReasons.first()).toBeVisible();
  const before = await attentionReasons.count();
  expect(before).toBeGreaterThan(0);
  await attentionReasons.first().getByRole("button", { name: "Mark addressed" }).click();
  await expect(attentionReasons).toHaveCount(before - 1);
});

test("pointer dragging moves through the same command and conflicts stay actionable", async ({ page, request }) => {
  await page.goto("/");
  const handle = page.getByRole("button", { name: "Drag T-0002" });
  const destination = page.getByTestId("column-implementation");
  await handle.scrollIntoViewIfNeeded();
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
