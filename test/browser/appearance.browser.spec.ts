import { contrastRatio, expect, openAppearance, setAppearance, test } from "./browser-fixture.ts";

test.use({ desktopNotificationConsent: "unset" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("coordination.desktop-notifications.consent", "declined");
    if (sessionStorage.getItem("theme-test-initialized") === null) {
      localStorage.removeItem("coordination-theme");
      sessionStorage.setItem("theme-test-initialized", "true");
    }
  });
});

test("system theme is applied before the app is visible and follows preference changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(await openAppearance(page)).toHaveValue("system");
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveCSS("background-color", "rgb(242, 244, 239)");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
});

test("appearance control keeps readable text in light Settings", async ({ page }) => {
  await page.goto("/");
  const appearance = await openAppearance(page);
  await appearance.selectOption("light");

  await expect(appearance).toHaveCSS("color", "rgb(20, 34, 28)");
  const dialog = page.getByRole("dialog", { name: "Settings" });
  const appearanceCategory = dialog.getByRole("button", { name: "Appearance" });
  const notificationsCategory = dialog.getByRole("button", { name: "Notifications" });
  await expect(dialog).toHaveCSS("background-color", "rgb(255, 254, 249)");
  await expect(appearanceCategory).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(appearanceCategory).toHaveCSS("background-color", "rgb(23, 78, 58)");
  await expect(notificationsCategory).toHaveCSS("color", "rgb(20, 34, 28)");
  await expect(notificationsCategory).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await notificationsCategory.click();
  await expect(notificationsCategory).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(notificationsCategory).toHaveCSS("background-color", "rgb(23, 78, 58)");
  await expect(appearanceCategory).toHaveCSS("color", "rgb(20, 34, 28)");
  await expect(dialog.locator(".settings-content")).toHaveCSS("color", "rgb(20, 34, 28)");
});

test("task description stays prominent without competing with the dark task title", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  await setAppearance(page, "dark");

  await expect(page.locator(".task-heading h1")).toHaveCSS("color", "rgb(237, 243, 239)");
  await expect(page.locator(".description")).toHaveCSS("color", "rgb(210, 221, 215)");
  await expect(page.locator(".authored-prose").first()).toHaveCSS("color", "rgb(237, 243, 239)");
  await expect(page.locator(".markdown-content code").first()).toHaveCSS("color", "rgb(191, 232, 209)");
  await expect(page.getByRole("button", { name: "Copy description Markdown" })).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const attentionCard = page.locator(".task-attention-panel .attention-reason-card").first();
  await expect(attentionCard).toHaveCSS("border-color", "rgb(158, 130, 59)");
  await expect(attentionCard).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await setAppearance(page, "light");
  await expect(page.locator(".description")).toHaveCSS("color", "rgb(77, 91, 84)");
  await expect(page.locator(".markdown-content code").first()).toHaveCSS("color", "rgb(217, 238, 227)");
  await expect(attentionCard).toHaveCSS("border-color", "rgb(223, 194, 125)");
  await expect(attentionCard).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("explicit theme persists across navigation and reload and overrides the system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await setAppearance(page, "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/tasks/T-0002");
  await expect(await openAppearance(page)).toHaveValue("dark");
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(await openAppearance(page)).toHaveValue("dark");
  await page.keyboard.press("Escape");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await setAppearance(page, "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(242, 244, 239)");
  await expect(page.locator('[data-task-section="description"]')).toHaveCSS(
    "background-color",
    "rgb(255, 254, 249)",
  );
});

test("semantic board, task, modal, transcript, attention, and error surfaces use the dark palette", async ({ page }) => {
  await page.goto("/");
  await setAppearance(page, "dark");

  await expect(page.locator(".needs-attention")).toHaveCSS("background-color", "rgb(51, 43, 25)");
  await expect(page.locator(".board-column.user-owned").first()).toHaveCSS("background-color", "rgb(42, 39, 32)");
  await page.getByRole("button", { name: "Show archived tasks" }).click();
  await expect(page.locator(".archive-toggle")).toHaveCSS("background-color", "rgb(155, 126, 168)");

  await page.goto("/tasks/T-0001");
  await expect(page.locator(".comment-entry article").first()).toHaveCSS("background-color", "rgb(50, 43, 24)");
  await page.getByRole("button", { name: /View conversation/ }).first().click();
  await expect(page.getByRole("dialog")).toHaveCSS("background-color", "rgb(29, 37, 33)");
  await expect(page.locator("pre").first()).toHaveCSS("background-color", "rgb(10, 16, 13)");
  await page.getByRole("button", { name: "Close" }).click();

  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.startup = {
      mode: "configuration-error",
      diagnostics: [{
        file: "process.yaml",
        line: 4,
        column: 3,
        invalidValue: "missing-agent",
        rule: "Watching agents must exist.",
        consequence: "Automation cannot start.",
        correction: "Add the agent or change the watcher.",
      }],
    };
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("coordination-theme", "light"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".configuration-error li")).toHaveCSS("background-color", "rgb(255, 243, 239)");
  await page.evaluate(() => localStorage.setItem("coordination-theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".configuration-error li")).toHaveCSS("background-color", "rgb(72, 37, 31)");
});

test("dark interactive controls keep readable contrast without turning secondary actions into bright blocks", async ({ page }) => {
  await page.goto("/");
  await setAppearance(page, "dark");

  const dragHandle = page.getByRole("button", { name: "Drag T-0002" });
  await expect(dragHandle).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(await contrastRatio(dragHandle)).toBeGreaterThanOrEqual(4.5);

  await page.goto("/tasks/T-0001");
  const showMore = page.getByRole("button", { name: /Show \d+ more lines?/ }).first();
  await expect(showMore).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(await contrastRatio(showMore)).toBeGreaterThanOrEqual(4.5);

  const openFolder = page.getByRole("button", { name: "Open folder" });
  await expect(openFolder).toHaveCSS("background-color", "rgb(50, 110, 81)");
  expect(await contrastRatio(openFolder)).toBeGreaterThanOrEqual(4.5);
  await page.getByRole("button", { name: "More ways to open workspace" }).click();
  const openInCode = page.getByRole("menuitem", { name: "Open in Visual Studio Code" });
  await expect(openInCode).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(await contrastRatio(openInCode)).toBeGreaterThanOrEqual(4.5);

  const post = page.getByRole("button", { name: "Post" });
  await expect(post).toHaveCSS("background-color", "rgb(50, 110, 81)");
  expect(await contrastRatio(post)).toBeGreaterThanOrEqual(4.5);

  const commentMarker = page.locator(".comment-entry .timeline-marker").first();
  expect(await contrastRatio(commentMarker)).toBeGreaterThanOrEqual(4.5);
});

test("sticky comment composer uses a readable translucent overlay in both appearances", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.description = "Long appearance context. ".repeat(500);
    detail.task.comments.push({
      id: "sticky-appearance-source",
      body: "Timeline evidence remains readable beside the sticky composer.",
      actor: { kind: "agent", id: "implementer" },
      occurredAt: "2026-08-19T12:00:00.000Z",
    });
    await route.fulfill({ response, json: detail });
  });

  for (const theme of ["dark", "light"] as const) {
    await page.goto("/tasks/T-0001");
    await setAppearance(page, theme);
    const composer = page.getByRole("region", { name: "Add comment" });
    await composer.evaluate((element) => element.scrollIntoView({ block: "end" }));
    await page.evaluate(() => window.scrollBy(0, 500));
    const overlayStyle = await composer.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        backdropFilter: style.backdropFilter,
        bottomLeftRadius: style.borderBottomLeftRadius,
        bottomRightRadius: style.borderBottomRightRadius,
      };
    });
    expect(overlayStyle.background).toContain("/ 0.82");
    expect(overlayStyle.backdropFilter).toContain("blur(10px)");
    expect(overlayStyle.bottomLeftRadius).toBe("0px");
    expect(overlayStyle.bottomRightRadius).toBe("0px");
    const draft = composer.getByRole("textbox", { name: "Comment" });
    const [composerBounds, headingBounds, draftBounds] = await Promise.all([
      composer.boundingBox(),
      composer.getByRole("heading", { name: "Add comment" }).boundingBox(),
      draft.boundingBox(),
    ]);
    expect(composerBounds).not.toBeNull();
    expect(headingBounds).not.toBeNull();
    expect(draftBounds).not.toBeNull();
    expect(headingBounds!.y - composerBounds!.y).toBeLessThanOrEqual(22);
    expect(draftBounds!.y - (headingBounds!.y + headingBounds!.height)).toBeGreaterThanOrEqual(8);
    expect(await contrastRatio(draft)).toBeGreaterThanOrEqual(4.5);
    await expect(page.locator("#timeline-source-sticky-appearance-source")).toBeVisible();
  }
});

test("conversation index remains quiet and readable in dark and light appearances", async ({ page }) => {
  for (const theme of ["dark", "light"] as const) {
    await page.goto("/tasks/T-0001");
    await setAppearance(page, theme);
    const row = page.getByRole("region", { name: "Conversations" }).getByRole("button").first();

    await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await row.hover();
    await expect(row).toHaveCSS("color", theme === "dark" ? "rgb(237, 243, 239)" : "rgb(20, 34, 28)");
    await expect(row).toHaveCSS("background-color", theme === "dark" ? "rgb(42, 53, 47)" : "rgb(233, 237, 231)");
    expect(await contrastRatio(row)).toBeGreaterThanOrEqual(4.5);

    await row.focus();
    await expect(row).toHaveCSS("outline-style", "solid");
    await expect(row).toHaveCSS("outline-width", "2px");
    await expect(row).toHaveCSS("outline-color", theme === "dark" ? "rgb(168, 206, 233)" : "rgb(49, 81, 107)");
  }
});

test("conversation overflow icon is centered and retirement confirmation stays compact in both appearances", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).first().click();
  const conversation = page.getByRole("dialog", { name: "Agent conversation" });
  const actions = conversation.getByRole("button", { name: "More conversation actions" });

  const [buttonBounds, iconBounds] = await Promise.all([
    actions.boundingBox(),
    actions.locator("svg").boundingBox(),
  ]);
  expect(buttonBounds).not.toBeNull();
  expect(iconBounds).not.toBeNull();
  expect(Math.abs((buttonBounds!.x + buttonBounds!.width / 2) - (iconBounds!.x + iconBounds!.width / 2))).toBeLessThan(1);
  expect(Math.abs((buttonBounds!.y + buttonBounds!.height / 2) - (iconBounds!.y + iconBounds!.height / 2))).toBeLessThan(1);

  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((selectedTheme) => {
      document.documentElement.dataset.theme = selectedTheme;
    }, theme);
    await actions.click();
    const retire = conversation.getByRole("menuitem", { name: "Retire conversation" });
    await expect(retire).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await retire.click();
    const confirmation = page.getByRole("dialog", { name: "Retire conversation?" });
    const bounds = await confirmation.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeLessThanOrEqual(544);
    await expect(confirmation.getByRole("button", { name: "Cancel" })).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(42, 53, 47)" : "rgb(233, 237, 231)",
    );
    await confirmation.getByRole("button", { name: "Cancel" }).click();
  }
});

test("conversation activity spinner and attention dot remain distinct in dark and light appearances", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const template = detail.conversations[0];
    detail.conversations = [
      { ...template, id: "appearance-running-conversation", status: "running" },
      { ...template, id: "appearance-attention-conversation", status: "needs-attention" },
    ];
    await route.fulfill({ response, json: detail });
  });

  for (const theme of ["dark", "light"] as const) {
    await page.goto("/tasks/T-0001");
    await setAppearance(page, theme);
    const conversations = page.getByRole("region", { name: "Conversations" });
    const running = conversations.getByRole("status", { name: "Conversation running" });
    const attention = conversations.getByRole("status", { name: "Conversation needs attention" });
    await expect(running).toHaveCSS(
      "border-top-color",
      theme === "dark" ? "rgb(156, 229, 187)" : "rgb(20, 80, 57)",
    );
    await expect(running).toHaveCSS("animation-name", "cost-pending-spin");
    await expect(attention).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(243, 207, 120)" : "rgb(114, 80, 14)",
    );
    const runningBounds = await running.boundingBox();
    const attentionBounds = await attention.boundingBox();
    expect(runningBounds).not.toBeNull();
    expect(attentionBounds).not.toBeNull();
    expect(runningBounds!.width).toBeGreaterThan(attentionBounds!.width);
    expect(attentionBounds!.width).toBe(8);
    expect(attentionBounds!.height).toBe(8);
  }
});

test("conversation follow-up composer remains readable and operable in both appearances", async ({ page }) => {
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    const message = {
      id: "appearance-queued-message",
      conversationId: result.conversation.id,
      body: "Please verify this queued turn.",
      actor: { kind: "user", id: "local-user" },
      occurredAt: "2026-08-15T12:00:00.000Z",
    };
    result.conversation.history.push({
      kind: "message",
      activationId: "appearance-queued-activation",
      status: "queued",
      attemptIds: [],
      message,
    });
    await route.fulfill({ response, json: result });
  });
  for (const theme of ["dark", "light"] as const) {
    await page.goto("/tasks/T-0001");
    await setAppearance(page, theme);
    await page.getByRole("button", { name: "View conversation" }).click();
    const dialog = page.getByRole("dialog", { name: "Agent conversation" });
    const composer = dialog.getByRole("textbox", { name: "Follow-up message" });
    await composer.fill("Check the appearance boundary.");
    const send = dialog.getByRole("button", { name: "Send follow-up" });
    const userMessage = dialog.locator(".user-message");
    const queuedTurn = dialog.getByRole("status", { name: "Follow-up queued" });

    expect(await contrastRatio(composer)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(send)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(userMessage)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(queuedTurn)).toBeGreaterThanOrEqual(4.5);
    await expect(userMessage).toHaveCSS("border-right-width", "1px");
    await expect(dialog.locator(".conversation-run")).toHaveCount(0);
    await expect(dialog.locator(".conversation-composer")).toHaveCSS("position", "sticky");
    const [composerBox, sendBox] = await Promise.all([composer.boundingBox(), send.boundingBox()]);
    expect(composerBox).not.toBeNull();
    expect(sendBox).not.toBeNull();
    expect(sendBox!.x + sendBox!.width).toBeLessThanOrEqual(composerBox!.x + composerBox!.width);
    expect(sendBox!.y + sendBox!.height).toBeLessThanOrEqual(composerBox!.y + composerBox!.height);
    const transcriptPadding = await dialog.locator(".transcript-content").evaluate((element) =>
      parseFloat(getComputedStyle(element).paddingRight)
    );
    expect(transcriptPadding).toBeGreaterThanOrEqual(8);
    const scrollbarClearance = await dialog.locator(".transcript-content").evaluate((element) => {
      const content = element.getBoundingClientRect();
      const rightmost = Math.max(...[...element.querySelectorAll<HTMLElement>(".conversation-stream > *, .conversation-composer")]
        .map((child) => child.getBoundingClientRect().right));
      return content.left + element.clientWidth - rightmost;
    });
    expect(scrollbarClearance).toBeGreaterThanOrEqual(8);
    await composer.focus();
    await expect(composer).toBeFocused();
    await expect(composer).toHaveCSS("outline-style", "solid");
    await expect(composer).toHaveCSS("outline-offset", "-3px");
    await dialog.getByRole("button", { name: "Close conversation" }).click();
  }
});

test("queued activation dismissal matches secondary round controls in both themes", async ({ page }) => {
  await page.route("**/api/tasks/T-0002", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.task.activations = [{
      id: "visual-dismissal",
      targetAgentId: "implementer",
      status: "queued",
      reason: { type: "column-entry", sourceEventId: "visual-dismissal-source" },
      attempts: [],
      startupFailure: null,
      recovery: null,
      stale: false,
      model: null,
      reasoningEffort: null,
      dismissal: { mayStartNext: false },
    }];
    body.inspection.run = {
      status: "queued",
      activeAgentId: null,
      queuedActivationCount: 1,
      failedActivationCount: 0,
    };
    body.activeRun = null;
    await route.fulfill({ response, json: body });
  });

  for (const theme of ["light", "dark"] as const) {
    await page.goto("/tasks/T-0002");
    await setAppearance(page, theme);
    const dismiss = page.getByRole("button", { name: "Dismiss activation for Implementation Agent" });
    await expect(dismiss).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(dismiss.locator("svg")).toHaveCount(1);
    expect(await dismiss.evaluate((button) => {
      const icon = button.querySelector("svg")!;
      const buttonRect = button.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      return {
        x: Math.abs(iconRect.x + iconRect.width / 2 - (buttonRect.x + buttonRect.width / 2)),
        y: Math.abs(iconRect.y + iconRect.height / 2 - (buttonRect.y + buttonRect.height / 2)),
      };
    })).toEqual({ x: 0, y: 0 });
  }
});
