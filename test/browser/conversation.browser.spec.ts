import { expect, test } from "./browser-fixture.ts";
import { cleanWorkspaceGitScenario, runningConversationScenario } from "./browser-fixture.ts";

test("conversation messages render Markdown and commands remain quiet but inspectable", async ({ page }) => {
  const codexMarkdown = "Reviewed **two risks**.\n\n- Preserve source\n- Keep [evidence](https://example.com/evidence)";
  const userMarkdown = "Please run `pnpm test` before the **handoff**.";
  const command = "pnpm test -- --filter conversation";

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    const run = result.conversation.runs[0];
    run.sourceMessageId = "conversation-display-follow-up";
    run.transcript.items = [
      { id: "message-markdown", kind: "message", role: "agent", text: codexMarkdown },
      { id: "command-success", kind: "command", command, status: "completed", output: "All tests passed." },
      { id: "command-running", kind: "command", command: "pnpm typecheck", status: "running" },
      { id: "command-failed", kind: "command", command: "pnpm lint", status: "failed", output: "Lint failed." },
    ];
    result.conversation.messages = [{
      id: "conversation-display-follow-up",
      conversationId: result.conversation.id,
      body: userMarkdown,
      occurredAt: run.attempt.startedAt,
      activationId: run.activationId,
    }];
    await route.fulfill({ response, json: result });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });

  await expect(dialog.locator("strong", { hasText: "two risks" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "evidence" })).toHaveAttribute("href", "https://example.com/evidence");
  await expect(dialog.getByText("pnpm test", { exact: true })).toBeVisible();
  await expect(dialog.locator("strong", { hasText: "handoff" })).toBeVisible();
  await expect(dialog).not.toContainText("Codex message");
  await expect(dialog.locator(".conversation-message, .conversation-run")).toHaveCount(2);
  expect(await dialog.locator(".conversation-message, .conversation-run").evaluateAll((entries) =>
    entries.map((entry) => entry.classList.contains("conversation-message") ? "message" : "run"),
  )).toEqual(["message", "run"]);
  expect(await dialog.locator(".conversation-run > .transcript-item, .conversation-run > .transcript-command")
    .evaluateAll((entries) => entries.map((entry) => entry.classList.contains("message") ? "message" : "command")))
    .toEqual(["message", "command", "command", "command"]);

  await dialog.getByRole("button", { name: "Copy Codex message Markdown" }).click();
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n")))
    .toBe(codexMarkdown);
  await dialog.getByRole("button", { name: "Copy your message Markdown" }).click();
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n")))
    .toBe(userMarkdown);

  const commands = dialog.locator(".transcript-command");
  await expect(commands).toHaveCount(3);
  await expect(commands.nth(0).getByRole("img", { name: "Command succeeded" })).toBeVisible();
  await expect(commands.nth(1).getByRole("img", { name: "Command running" })).toBeVisible();
  await expect(commands.nth(2).getByRole("img", { name: "Command failed" })).toBeVisible();
  await expect(commands.nth(0).locator(".command-disclosure-icon")).toBeVisible();
  await expect(commands.nth(0).getByText(command, { exact: true })).not.toBeVisible();
  await expect(commands.nth(0).locator(".command-disclosure-icon")).toHaveCSS("transform", "none");
  await commands.nth(0).locator("summary").click();
  await expect(commands.nth(0).locator(".command-disclosure-icon")).not.toHaveCSS("transform", "none");
  await expect(commands.nth(0)).toContainText(command);
  await expect(commands.nth(0)).toContainText("All tests passed.");
  await commands.nth(1).locator("summary").click();
  await expect(commands.nth(1)).toContainText("pnpm typecheck");

  const compactHeights = await dialog.evaluate(() => ({
    userMessage: document.querySelector(".conversation-message.user-message")!.getBoundingClientRect().height,
    collapsedCommand: document.querySelectorAll(".transcript-command")[2]!.getBoundingClientRect().height,
  }));
  expect(compactHeights.userMessage).toBeLessThan(90);
  expect(compactHeights.collapsedCommand).toBeLessThan(60);

  const compactRow = await commands.nth(2).evaluate((element) => {
    const row = element.querySelector("summary")!.getBoundingClientRect();
    const icon = element.querySelector(".command-disclosure-icon")!.getBoundingClientRect();
    const title = element.querySelector(".command-title")!.getBoundingClientRect();
    return {
      leftInset: title.left - element.getBoundingClientRect().left,
      iconCenterY: icon.top + icon.height / 2,
      titleCenterY: title.top + title.height / 2,
      rowCenterY: row.top + row.height / 2,
    };
  });
  expect(compactRow.leftInset).toBeGreaterThanOrEqual(8);
  expect(Math.abs(compactRow.iconCenterY - compactRow.rowCenterY)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(compactRow.titleCenterY - compactRow.rowCenterY)).toBeLessThanOrEqual(0.5);
  await expect(commands.nth(2)).toHaveCSS("border-radius", "7.2px");

  const centers = await commands.nth(0).evaluate((element) => {
    const slot = element.querySelector(".command-status")!.getBoundingClientRect();
    const icon = element.querySelector(".command-status svg")!.getBoundingClientRect();
    return {
      slotX: slot.x + slot.width / 2,
      slotY: slot.y + slot.height / 2,
      iconX: icon.x + icon.width / 2,
      iconY: icon.y + icon.height / 2,
    };
  });
  expect(Math.abs(centers.slotX - centers.iconX)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(centers.slotY - centers.iconY)).toBeLessThanOrEqual(0.5);
});

test("wide transcript content wraps without overflowing the dialog or page", async ({ page }) => {
  const unbroken = "C:/workspace/" + "deeply-nested-segment/".repeat(18) + "artifact.json";
  const prose = "Transcript prose remains readable within the available width even when it contains " +
    `an unbroken value such as ${unbroken}.`;
  const structuredOutput = JSON.stringify({ path: unbroken, status: "completed" }, null, 2);
  const preformattedOutput = `COMMAND\tRESULT\n${unbroken}\tcompleted`;

  await page.setViewportSize({ width: 360, height: 720 });
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    result.conversation.runs[0].transcript.items = [
      { kind: "message", role: "agent", text: prose },
      {
        kind: "command",
        command: structuredOutput,
        status: "completed",
        output: preformattedOutput,
      },
      { kind: "diagnostic", text: unbroken },
    ];
    await route.fulfill({ response, json: result });
  });

  await page.goto("/tasks/T-0001");
  const pageScrollWidthBeforeDialog = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(dialog).toContainText(unbroken);

  const containment = await dialog.evaluate((element) => {
    const content = element.querySelector<HTMLElement>(".transcript-content");
    const records = [...element.querySelectorAll<HTMLElement>(".transcript-item, .transcript-command")];
    return {
      viewportWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      dialogRight: element.getBoundingClientRect().right,
      dialogOverflow: element.scrollWidth > element.clientWidth,
      contentOverflow: content === null ? true : content.scrollWidth > content.clientWidth,
      recordOverflow: records.some((record) => record.scrollWidth > record.clientWidth),
    };
  });
  expect(containment.pageScrollWidth).toBeLessThanOrEqual(pageScrollWidthBeforeDialog);
  expect(containment.dialogRight).toBeLessThanOrEqual(containment.viewportWidth);
  expect(containment.dialogOverflow).toBe(false);
  expect(containment.contentOverflow).toBe(false);
  expect(containment.recordOverflow).toBe(false);

  const commandDetails = dialog.locator(".command-details");
  await commandDetails.locator("summary").click();
  const pre = commandDetails.locator("pre").nth(1);
  await expect(pre).toHaveText(preformattedOutput);
  expect(await pre.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await commandDetails.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
  expect(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
});


test("attempt outcomes show canonical-looking participant text without executable mention styling", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const outcome = detail.task.activations[0]?.attempts[0]?.outcome;
    if (outcome !== undefined && outcome !== null) {
      outcome.summary = "No further response from @implementer is required.";
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const outcome = page.getByRole("region", { name: "Outcome" });
  await expect(outcome).toContainText("No further response from @implementer is required.");
  await expect(outcome.locator(".canonical-mention")).toHaveCount(0);
});


test("a conversation without reported usage does not present zero as measured usage", async ({ page }) => {
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    delete result.conversation.runs[0].transcript.usage;
    await route.fulfill({ response, json: result });
  });
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });

  await expect(dialog).toContainText("I inspected the current task.");
  await expect(dialog.getByRole("region", { name: "Token usage" })).toHaveCount(0);
  await expect(dialog).not.toContainText("0 total tokens");
});


test("a conversation discloses when Codex replaced an unusable resumed thread", async ({ page }) => {
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    result.conversation.runs[0].attempt.threadContinuity = "replaced";
    await route.fulfill({ response, json: result });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  await expect(page.getByRole("dialog", { name: "Agent conversation" })).toContainText(
    "This run started a replacement thread, so earlier model context was not retained.",
  );
});

test("one conversation presents distinct run boundaries for several ordinary activations", async ({ page }) => {
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    const firstRun = result.conversation.runs[0];
    firstRun.attempt.status = "completed";
    firstRun.attempt.completedAt = "2026-08-09T12:01:00.000Z";
    firstRun.attempt.outcome = { status: "completed", summary: "First activation complete." };
    result.conversation.runs.push({
      activationId: "browser-ordinary-activation-2",
      attempt: {
        ...firstRun.attempt,
        id: "browser-ordinary-attempt-2",
        startedAt: "2026-08-09T12:03:00.000Z",
        completedAt: "2026-08-09T12:04:00.000Z",
        outcome: { status: "completed", summary: "Second activation complete." },
      },
      transcript: {
        available: true,
        items: [{ kind: "message", role: "agent", text: "Handled the later ordinary activation." }],
      },
    });
    await route.fulfill({ response, json: result });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(dialog.locator(".conversation-run")).toHaveCount(2);
  await expect(dialog.getByRole("heading", { name: "Run 1 · completed" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Run 2 · completed" })).toBeVisible();
  await expect(dialog).toContainText("Handled the later ordinary activation.");
});


test("compact conversation rows stay last in the supporting column and open by keyboard", async ({ page, request }) => {
  const detail = await (await request.get("/api/tasks/T-0001")).json() as {
    task: { activations: Array<{ conversationId: string | null }> };
  };
  const conversationId = detail.task.activations.find(({ conversationId }) => conversationId !== null)?.conversationId;
  expect(conversationId).not.toBeNull();
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const taskDetail = await response.json();
    taskDetail.conversations = [
      {
        id: conversationId,
        owningAgent: {
          id: "implementer",
          name: "Implementation Agent",
          historicalName: "Implementation Agent",
          present: true,
        },
        label: "Inspect existing coordination",
        latestActivityAt: "2026-08-09T12:05:00.000Z",
        status: null,
        continuation: { available: true },
      },
      {
        id: "historical-conversation",
        owningAgent: {
          id: "implementer",
          name: "Implementation Agent",
          historicalName: "Implementation Agent",
          present: false,
        },
        label: "Verify the responsive navigation order",
        latestActivityAt: "2026-08-09T12:00:00.000Z",
        status: null,
        continuation: { available: false, reason: "owning-agent-unavailable" },
      },
    ];
    await route.fulfill({ response, json: taskDetail });
  });

  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/tasks/T-0001");
  const conversations = page.getByRole("region", { name: "Conversations" });
  const rows = conversations.getByRole("button");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Implementation Agent");
  await expect(rows.nth(0)).toContainText(/ago|just now/);
  await expect(rows.nth(0)).not.toContainText("Inspect existing coordination");
  await expect(rows.nth(1)).not.toContainText("Verify the responsive navigation order");
  const [agentNameBox, activityTimeBox] = await Promise.all([
    rows.nth(0).locator("strong").boundingBox(),
    rows.nth(0).locator("time").boundingBox(),
  ]);
  expect(agentNameBox).not.toBeNull();
  expect(activityTimeBox).not.toBeNull();
  expect(activityTimeBox!.x).toBeGreaterThan(agentNameBox!.x + agentNameBox!.width);
  expect(Math.abs(
    activityTimeBox!.y + activityTimeBox!.height / 2 - (agentNameBox!.y + agentNameBox!.height / 2),
  )).toBeLessThanOrEqual(2);
  await expect(conversations).not.toContainText(/attempt|token|duration|completed|unavailable/i);
  const supportingOrder = await page.locator(".detail-column > [data-task-section]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-task-section")),
  );
  expect(supportingOrder.at(-1)).toBe("conversations");
  const [widePrimary, wideSupporting, wideConversations] = await Promise.all([
    page.locator(".detail-primary-column").boundingBox(),
    page.locator(".detail-column").boundingBox(),
    page.locator('[data-task-section="conversations"]').boundingBox(),
  ]);
  expect(widePrimary).not.toBeNull();
  expect(wideSupporting).not.toBeNull();
  expect(wideConversations).not.toBeNull();
  expect(wideConversations!.x).toBeGreaterThan(widePrimary!.x + widePrimary!.width);
  expect(Math.abs(wideConversations!.x - wideSupporting!.x)).toBeLessThanOrEqual(2);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const [stickyTop, topbarBottom] = await Promise.all([
    page.locator('[data-task-section="conversations"]').evaluate((element) => element.getBoundingClientRect().top),
    page.locator(".detail-topbar").evaluate((element) => element.getBoundingClientRect().bottom),
  ]);
  expect(stickyTop).toBeGreaterThanOrEqual(topbarBottom);
  expect(stickyTop - topbarBottom).toBeLessThanOrEqual(20);

  await rows.nth(0).focus();
  await expect(rows.nth(0)).toBeFocused();
  await rows.nth(0).press("Enter");
  await expect(page.getByRole("dialog", { name: "Agent conversation" })).toBeVisible();
  await page.getByRole("button", { name: "Close conversation" }).click();

  await page.setViewportSize({ width: 600, height: 900 });
  const narrowOrder = await page.locator("[data-task-section]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-task-section")),
  );
  expect(narrowOrder.at(-1)).toBe("conversations");
  const [narrowTimeline, narrowConversations] = await Promise.all([
    page.locator('[data-task-section="timeline"]').boundingBox(),
    page.locator('[data-task-section="conversations"]').boundingBox(),
  ]);
  expect(narrowTimeline).not.toBeNull();
  expect(narrowConversations).not.toBeNull();
  expect(Math.abs(narrowConversations!.x - narrowTimeline!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(narrowConversations!.width - narrowTimeline!.width)).toBeLessThanOrEqual(2);
  expect(narrowConversations!.y).toBeGreaterThan(narrowTimeline!.y + narrowTimeline!.height);

  const withoutConversation = await request.post("/api/tasks", {
    data: {
      boardId: "delivery",
      columnId: "backlog",
      title: "No agent conversation yet",
      description: "Keep the empty conversation state explicit.",
      idempotencyKey: "browser-no-conversation-task",
    },
  });
  const withoutConversationBody = await withoutConversation.json() as { task: { id: string } };
  await page.goto(`/tasks/${withoutConversationBody.task.id}`);
  await expect(page.getByRole("region", { name: "Conversations" })).toHaveCount(0);
});


test("compact conversation dots expose running and attention without decorating idle history", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const template = detail.conversations[0];
    detail.conversations = [
      { ...template, id: "idle-conversation", status: null },
      { ...template, id: "running-conversation", status: "running" },
      { ...template, id: "attention-conversation", status: "needs-attention" },
    ];
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const rows = page.getByRole("region", { name: "Conversations" }).getByRole("button");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).getByRole("status")).toHaveCount(0);
  const running = rows.nth(1).getByRole("status", { name: "Conversation running" });
  await expect(running).toHaveAttribute("title", "Conversation running");
  await expect(running).toHaveCSS("background-color", "rgb(20, 80, 57)");
  const attention = rows.nth(2).getByRole("status", { name: "Conversation needs attention" });
  await expect(attention).toHaveAttribute("title", "Conversation needs attention");
  await expect(attention).toHaveCSS("background-color", "rgb(114, 80, 14)");
  await expect(rows.nth(1)).not.toContainText("running");
  await expect(rows.nth(2)).not.toContainText("needs attention");
});


test("conversation dialog contains focus, closes with Escape, and restores its opener", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  const opener = page.getByRole("button", { name: "View conversation" }).first();
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const close = dialog.getByRole("button", { name: "Close conversation" });
  await expect(close).toBeFocused();
  await dialog.getByRole("textbox", { name: "Follow-up message" }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Retire conversation" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});


test("conversation dialog opened from the conversation list covers timeline markers", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  await page.getByRole("region", { name: "Conversations" }).getByRole("button").first().click();
  await expect(page.getByRole("dialog", { name: "Agent conversation" })).toBeVisible();

  const exposedMarkers = await page.locator(".timeline-marker").evaluateAll((markers) => markers.filter((marker) => {
    const bounds = marker.getBoundingClientRect();
    const topmost = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return topmost === marker || marker.contains(topmost);
  }).length);

  expect(exposedMarkers).toBe(0);
});


test("conversation continuation navigation highlights and scrolls to its authored message", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.activity.push({
      id: "selected-conversation-continuation",
      type: "conversation.continued",
      actor: { kind: "user", id: "local-user" },
      occurredAt: "2026-08-15T12:00:00.000Z",
      details: {
        conversationId: "browser-conversation",
        messageId: "selected-conversation-message",
        activationId: "selected-conversation-activation",
        messageBody: "Focus this exact authored follow-up.",
      },
    });
    await route.fulfill({ response, json: detail });
  });
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const items = Array.from({ length: 40 }, (_, index) => ({
      id: `selected-history-${index}`,
      kind: "message",
      role: "agent",
      text: `Prior conversation evidence ${index + 1}.`,
    }));
    const result = runningConversationScenario(items);
    (result.conversation as Record<string, unknown>).messages = [{
      id: "selected-conversation-message",
      conversationId: "browser-conversation",
      body: "Focus this exact authored follow-up.",
      actor: { kind: "user", id: "local-user" },
      occurredAt: "2026-08-15T12:00:00.000Z",
    }];
    await route.fulfill({ status: 200, json: result });
  });

  await page.goto("/tasks/T-0001");
  const continuation = page.locator(".event-entry").filter({ hasText: "Focus this exact authored follow-up." });
  await continuation.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const selectedMessage = dialog.locator(".conversation-user-turn.selected-message-turn");
  await expect(selectedMessage).toContainText("Focus this exact authored follow-up.");
  await expect(selectedMessage).toHaveCSS("background-color", "rgb(243, 247, 250)");
  expect(await dialog.locator(".transcript-content").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});


test("an open conversation replaces one running tool entry with its terminal evidence", async ({ page }) => {
  await page.clock.install();
  let reads = 0;
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const attempt = detail.task.activations[0]?.attempts[0];
    if (attempt !== undefined) {
      attempt.status = "running";
      attempt.completedAt = null;
      attempt.outcome = null;
    }
    await route.fulfill({ response, json: detail });
  });
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    reads += 1;
    const retainedMessages = Array.from({ length: 30 }, (_, index) => ({
      id: `retained-message-${index}`,
      kind: "message",
      role: "agent",
      text: `Retained transcript message ${index + 1}.`,
    }));
    await route.fulfill({
      status: 200,
      json: runningConversationScenario(reads === 1
          ? [{
              id: "live-browser-command",
              kind: "command",
              command: "pnpm test",
              status: "running",
            }, ...retainedMessages]
          : [{
              id: "live-browser-command",
              kind: "command",
              command: "pnpm test",
              status: "completed",
              output: "All live checks passed.",
            }, ...retainedMessages]),
    });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const liveCommand = dialog.locator(".transcript-command").first();
  await expect(liveCommand.getByRole("img", { name: "Command running" })).toBeVisible();
  await liveCommand.locator("summary").click();
  await expect(liveCommand.locator("details")).toHaveAttribute("open", "");
  expect(reads).toBe(1);
  const transcriptContent = dialog.locator(".transcript-content");
  const readingPosition = await transcriptContent.evaluate((element) => {
    element.scrollTop = 120;
    return element.scrollTop;
  });
  expect(readingPosition).toBeGreaterThan(0);
  await page.clock.fastForward(2_000);
  await expect.poll(() => reads).toBeGreaterThanOrEqual(2);
  await expect(liveCommand.getByRole("img", { name: "Command succeeded" })).toBeVisible();
  await expect(liveCommand.locator("details")).toHaveAttribute("open", "");
  await expect(dialog).toContainText("All live checks passed.");
  await expect(dialog.locator(".transcript-item, .transcript-command")).toHaveCount(31);
  expect(await transcriptContent.evaluate((element) => element.scrollTop)).toBe(readingPosition);

  await dialog.getByRole("button", { name: "Close conversation" }).click();
  await page.getByRole("button", { name: "View conversation" }).click();
  await expect(page.getByRole("dialog", { name: "Agent conversation" })).toContainText("All live checks passed.");
  await page.getByRole("dialog", { name: "Agent conversation" }).getByRole("button", { name: "Close conversation" }).click();
  await page.goto("/");
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  await expect(page.getByRole("dialog", { name: "Agent conversation" })).toContainText("All live checks passed.");
});


test("an idle open conversation discovers externally added evidence within two seconds", async ({ page }) => {
  await page.clock.install();
  let reads = 0;
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    reads += 1;
    const result = runningConversationScenario([{
      id: "external-message",
      kind: "message",
      role: "agent",
      text: reads === 1 ? "No external follow-up yet." : "An external follow-up is now visible.",
    }]);
    const conversation = result.conversation as {
      originatingActivation: { status: string };
      runs: Array<{
        attempt: {
          status: string;
          completedAt: string | null;
          outcome: { status: string; summary: string } | null;
        };
      }>;
    };
    conversation.originatingActivation.status = "completed";
    const attempt = conversation.runs[0]!.attempt;
    attempt.status = "completed";
    attempt.completedAt = "2026-08-09T12:05:00.000Z";
    attempt.outcome = { status: "completed", summary: "Idle conversation." };
    await route.fulfill({ status: 200, json: result });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("region", { name: "Conversations" }).getByRole("button").first().click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(dialog).toContainText("No external follow-up yet.");
  expect(reads).toBe(1);

  await page.clock.fastForward(2_000);
  await expect(dialog).toContainText("An external follow-up is now visible.");
  expect(reads).toBeGreaterThanOrEqual(2);
});


test("a live conversation follows appended items only while the reader is at the bottom", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const attempt = detail.task.activations[0]?.attempts[0];
    if (attempt !== undefined) {
      attempt.status = "completed";
      attempt.completedAt = "2026-08-09T12:05:00.000Z";
      attempt.outcome = { status: "completed", summary: "Historical run complete." };
    }
    await route.fulfill({ response, json: detail });
  });
  let reads = 0;
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    reads += 1;
    const items = Array.from({ length: 40 }, (_, index) => ({
      id: `follow-message-${index}`,
      kind: "message",
      role: "agent",
      text: `Live transcript message ${index + 1}.`,
    }));
    if (reads > 1) {
      items.push({
        id: "new-bottom-message",
        kind: "message",
        role: "agent",
        text: "This newly appended message should stay visible.",
      });
    }
    await route.fulfill({
      status: 200,
      json: runningConversationScenario(items),
    });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const transcriptContent = dialog.locator(".transcript-content");
  await expect(dialog).toContainText("Live transcript message 40.");
  await transcriptContent.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(dialog).toContainText("This newly appended message should stay visible.");
  await expect.poll(() => transcriptContent.evaluate((element) =>
    element.scrollHeight - element.clientHeight - element.scrollTop,
  )).toBeLessThanOrEqual(1);
});


test("a conversation follow-up retains its draft on failure and refreshes in place after retry", async ({ page }) => {
  let submitted = false;
  let followUpReads = 0;
  const submissions: Array<{ body: string; idempotencyKey: string }> = [];
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    if (route.request().method() === "POST") {
      submissions.push(route.request().postDataJSON() as { body: string; idempotencyKey: string });
      if (submissions.length === 1) {
        await route.fulfill({ status: 500, json: { error: "temporary failure" } });
        return;
      }
      submitted = true;
      await route.fulfill({
        status: 200,
        json: {
          accepted: true,
          activationId: "browser-follow-up-activation",
          message: {
            id: "browser-follow-up-message",
            conversationId: "browser-conversation",
            body: submissions.at(-1)?.body,
            actor: { kind: "user", id: "local-user" },
            occurredAt: "2026-08-09T12:06:00.000Z",
          },
        },
      });
      return;
    }
    const result = runningConversationScenario([]);
    if (submitted) {
      followUpReads += 1;
      (result.conversation as Record<string, unknown>).messages = [{
        id: "browser-follow-up-message",
        conversationId: "browser-conversation",
        body: "Please check this edge case.\nIt affects retries.",
        actor: { kind: "user", id: "local-user" },
        occurredAt: "2026-08-09T12:06:00.000Z",
      }];
      if (followUpReads > 1) {
        (result.conversation as { originatingActivation: { status: string } }).originatingActivation.status = "completed";
        const runs = (result.conversation as Record<string, unknown>).runs as Array<Record<string, unknown>>;
        Object.assign(runs[0]!.attempt as Record<string, unknown>, {
          status: "completed",
          completedAt: "2026-08-09T12:05:00.000Z",
        });
        runs.push({
        activationId: "browser-follow-up-activation",
        sourceMessageId: "browser-follow-up-message",
        attempt: {
          id: "browser-follow-up-attempt",
          status: "completed",
          workspacePath: "C:/workspace",
          startedAt: "2026-08-09T12:06:01.000Z",
          completedAt: "2026-08-09T12:06:02.000Z",
          outcome: { status: "completed", summary: "Checked the edge case." },
          threadId: "thread-browser-123",
          model: null,
          reasoningEffort: null,
        },
        transcript: {
          available: true,
          items: [{ id: "browser-follow-up-answer", kind: "message", role: "agent", text: "The edge case is covered." }],
        },
        });
      }
    }
    await route.fulfill({ status: 200, json: result });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const composer = dialog.getByRole("textbox", { name: "Follow-up message" });
  await composer.fill("Please check this edge case.\nIt affects retries.");
  await dialog.getByRole("button", { name: "Send follow-up" }).click();
  await expect(dialog.getByRole("alert")).toContainText("500");
  await expect(composer).toHaveValue("Please check this edge case.\nIt affects retries.");
  await dialog.getByRole("button", { name: "Send follow-up" }).click();
  await expect(composer).toHaveValue("");
  await expect(dialog).toContainText("Please check this edge case.");
  const queuedTurn = dialog.getByRole("status", { name: "Follow-up queued" });
  await expect(queuedTurn).toContainText("Waiting for Implementation Agent to finish the current run.");
  const queuedMessage = dialog.locator(".conversation-user-turn.awaiting-run .user-message");
  await expect(queuedMessage).toHaveCSS("border-right-width", "4px");
  const [messageBox, queuedBox] = await Promise.all([queuedMessage.boundingBox(), queuedTurn.boundingBox()]);
  expect(messageBox).not.toBeNull();
  expect(queuedBox).not.toBeNull();
  expect(queuedBox!.y).toBeGreaterThanOrEqual(messageBox!.y + messageBox!.height);
  await expect(dialog).toContainText("The edge case is covered.");
  await expect(queuedTurn).toHaveCount(0);
  const historyKinds = await dialog.locator(".conversation-run, .conversation-message").evaluateAll((entries) =>
    entries.map((entry) => entry.classList.contains("conversation-message") ? "message" : "run"),
  );
  expect(historyKinds).toEqual(["run", "message", "run"]);
  expect(submissions).toHaveLength(2);
  expect(submissions[1]?.idempotencyKey).toBe(submissions[0]?.idempotencyKey);
});


test("an assembled conversation follow-up runs and remains attributable in the task timeline", async ({ page, request }) => {
  const followUpBody = [
    "Run this assembled follow-up and preserve the exact authored request.",
    "Check the application boundary.",
    "Check the runtime boundary.",
    "Check the task timeline attribution.",
    "Keep the existing workspace.",
    "Resume the existing thread.",
    "Report the final result here.",
  ].join("\n");
  const startupFailure = await (await request.get("/api/tasks/T-0003")).json() as {
    task: { activations: Array<{ id: string; status: string }> };
  };
  for (const activation of startupFailure.task.activations.filter(({ status }) => status === "queued")) {
    const dismissed = await request.post(`/api/activations/${activation.id}/dismiss`, {
      data: { idempotencyKey: `dismiss-startup-${activation.id}` },
    });
    expect(dismissed.status()).toBe(200);
  }
  const before = await (await request.get("/api/tasks/T-0001")).json() as {
    task: {
      relationships: Array<{ id: string }>;
      activations: Array<{ id: string; status: string }>;
    };
  };
  for (const relationship of before.task.relationships) {
    const removed = await request.delete(`/api/tasks/T-0001/relationships/${relationship.id}`, {
      data: { idempotencyKey: `remove-before-follow-up-${relationship.id}` },
    });
    expect(removed.status()).toBe(200);
  }
  const unblocked = await (await request.get("/api/tasks/T-0001")).json() as typeof before;
  for (const activation of unblocked.task.activations.filter(({ status }) => status === "queued")) {
    const dismissed = await request.post(`/api/activations/${activation.id}/dismiss`, {
      data: { idempotencyKey: `dismiss-before-follow-up-${activation.id}` },
    });
    expect(dismissed.status()).toBe(200);
  }

  await page.goto("/tasks/T-0001");
  const conversations = page.getByRole("region", { name: "Conversations" });
  const originatingConversation = conversations.getByTitle("Inspect existing coordination", { exact: true });
  await originatingConversation.click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await dialog.getByRole("textbox", { name: "Follow-up message" }).fill(followUpBody);
  await dialog.getByRole("button", { name: "Send follow-up" }).click();
  await expect(dialog.getByRole("textbox", { name: "Follow-up message" })).toHaveValue("");
  await dialog.getByRole("button", { name: "Close conversation" }).click();
  await page.reload();

  const timeline = page.getByRole("region", { name: "Task timeline" });
  const continuationEntry = timeline.locator(".event-entry").filter({ hasText: "Conversation continued" });
  await expect(continuationEntry).toContainText("Run this assembled follow-up and preserve the exact authored request.");
  await expect(continuationEntry).not.toContainText("Conversation continuedConversation continued");
  const continuationText = continuationEntry.locator(".authored-prose");
  expect(await continuationText.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await continuationEntry.getByRole("button", { name: /Show \d+ more lines?/ }).click();
  await expect(continuationEntry.getByRole("button", { name: "Show less" })).toBeVisible();
  await expect(continuationEntry).toContainText("Report the final result here.");
  await continuationEntry.getByRole("button", { name: "View conversation" }).click();
  const queuedConversation = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(queuedConversation).toContainText(followUpBody);
  await expect(queuedConversation.getByRole("status", { name: "Follow-up queued" })).toContainText(
    "Waiting for Implementation Agent's next run to start.",
  );
  await page.getByRole("button", { name: "Close conversation" }).click();
  await page.getByRole("button", { name: "Resume" }).click();
  const runningStatus = originatingConversation.getByRole("status", { name: "Conversation running" });
  await expect(runningStatus).toBeVisible();
  await originatingConversation.click();
  const runningConversation = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(runningConversation).toContainText("Run 2 · running");
  await expect(runningConversation).toContainText("Checking the assembled follow-up now.");
  await expect(runningConversation.getByRole("img", { name: "Command running" })).toBeVisible();
  await runningConversation.getByRole("button", { name: "Close conversation" }).click();
  await expect(timeline).toContainText("Follow-up resumed thread-browser-123", { timeout: 15_000 });
  const followUpAttempt = timeline.locator(".attempt-entry").filter({ hasText: "Follow-up resumed thread-browser-123" });
  const triggerLink = followUpAttempt.getByRole("link", { name: "the conversation continuation" });
  await expect(triggerLink).toBeVisible();
  await triggerLink.click();
  await expect(continuationEntry.locator("article")).toBeFocused();
  await page.reload();
  await page.getByRole("region", { name: "Conversations" })
    .getByTitle("Inspect existing coordination", { exact: true }).click();
  const refreshed = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(refreshed).toContainText(followUpBody);
  await expect(refreshed).toContainText("Run 2 · completed", { timeout: 15_000 });
  await expect(refreshed).toContainText("Assembled follow-up verified.");
});

test("a settled conversation can be retired by keyboard and remains visible in dialog, list, and timeline", async ({ page, request }) => {
  const reason = "The inherited implementation approach assumes an obsolete constraint.";
  const before = await (await request.get("/api/tasks/T-0001")).json() as {
    task: { relationships: Array<{ id: string }>; activations: Array<{ id: string; status: string }> };
  };
  for (const relationship of before.task.relationships) {
    expect((await request.delete(`/api/tasks/T-0001/relationships/${relationship.id}`, {
      data: { idempotencyKey: `remove-before-retirement-${relationship.id}` },
    })).status()).toBe(200);
  }
  const unblocked = await (await request.get("/api/tasks/T-0001")).json() as typeof before;
  for (const activation of unblocked.task.activations.filter(({ status }) => status === "queued")) {
    expect((await request.post(`/api/activations/${activation.id}/dismiss`, {
      data: { idempotencyKey: `dismiss-before-retirement-${activation.id}` },
    })).status()).toBe(200);
  }

  await page.goto("/tasks/T-0001");
  const conversations = page.getByRole("region", { name: "Conversations" });
  const row = conversations.getByTitle("Inspect existing coordination", { exact: true });
  await row.click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const retire = dialog.getByRole("button", { name: "Retire conversation" });
  await expect(retire).toBeEnabled();
  await retire.click();
  const reasonBox = dialog.getByRole("textbox", { name: "Reason for retirement" });
  await expect(reasonBox).toBeFocused();
  await reasonBox.fill(reason);
  await reasonBox.press("Tab");
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Confirm retirement" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("note")).toContainText(reason);
  await expect(dialog).toContainText("This conversation is retired");
  await expect(dialog.getByRole("textbox", { name: "Follow-up message" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Close conversation" }).click();

  await page.reload();
  await expect(page.getByRole("region", { name: "Conversations" }).getByText("Retired", { exact: true })).toBeVisible();
  const retirementEvent = page.getByRole("region", { name: "Task timeline" })
    .locator(".event-entry").filter({ hasText: "Conversation retired" });
  await expect(retirementEvent).toContainText("Implementation Agent");
  await expect(retirementEvent).toContainText(reason);

  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((selectedTheme) => {
      document.documentElement.dataset.theme = selectedTheme;
    }, theme);
    await expect(page.getByRole("region", { name: "Conversations" }).getByText("Retired", { exact: true })).toBeVisible();
  }

  const replacementSource = "@implementer replace the retired approach with current constraints.";
  expect((await request.post("/api/tasks/T-0001/comments", {
    data: { body: replacementSource, idempotencyKey: "browser-create-replacement-conversation" },
  })).status()).toBe(201);
  await page.reload();
  await page.getByRole("region", { name: "Conversations" }).getByTitle(replacementSource, { exact: false }).click();
  const replacementDialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(replacementDialog.getByRole("note")).toContainText("Replacement context");
  await expect(replacementDialog.getByRole("note")).toContainText(reason);
});
