import { contrastRatio, expect, fulfillConversationTranscript, setAppearance, test } from "./browser-fixture.ts";

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

  const codexMessageLayout = await dialog.locator(".transcript-item.message").evaluate((element) => {
    const card = element.getBoundingClientRect();
    const content = element.querySelector(".markdown-content")!.getBoundingClientRect();
    const copy = element.querySelector(".markdown-copy-button")!.getBoundingClientRect();
    return {
      contentTopInset: content.top - card.top,
      copyTopInset: copy.top - card.top,
      copyRightInset: card.right - copy.right,
    };
  });
  expect(codexMessageLayout.contentTopInset).toBeLessThan(18);
  expect(codexMessageLayout.copyTopInset).toBeLessThan(12);
  expect(codexMessageLayout.copyRightInset).toBeGreaterThanOrEqual(8);

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

test("generic MCP calls identify the capability and disclose bounded literal evidence", async ({ page }) => {
  const longPath = `C:/workspace/${"nested-segment/".repeat(40)}evidence.json`;
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    await fulfillConversationTranscript(route, [
      {
        id: "mcp-success",
        kind: "mcp",
        server: "source_control_server",
        tool: "create_pull_request",
        status: "succeeded",
        rawStatus: "completed",
        arguments: { title: "Do **not** render this", path: longPath },
        result: { content: [{ type: "text", text: "{\"number\":42}" }] },
      },
      {
        id: "mcp-running",
        kind: "mcp",
        server: "browserTools",
        tool: "takeScreenshot",
        status: "running",
        rawStatus: "in_progress",
      },
      {
        id: "mcp-failed",
        kind: "mcp",
        server: "filesystem",
        tool: "read_file",
        status: "failed",
        rawStatus: "failed",
        error: { message: "Access denied for **secret**.txt", code: "EACCES" },
      },
      {
        id: "mcp-rejected",
        kind: "coordination",
        tool: "add_dependency",
        status: "rejected",
        summary: "T-0040: dependency on T-0041 · Rejected: duplicate-relationship",
        presentation: {
          kind: "coordination-dependency",
          sourceTask: { id: "T-0040" },
          targetTask: { id: "T-0041" },
        },
        diagnostic: { kind: "rejection", message: "Duplicate relationship" },
        evidence: {
          rawStatus: "completed",
          arguments: { targetTaskId: "T-0041" },
          result: { content: [{ type: "text", text: "{\"accepted\":false,\"reason\":\"duplicate-relationship\"}" }] },
        },
      },
    ]);
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const calls = dialog.locator(".transcript-mcp");
  const coordination = dialog.getByRole("article", { name: "Add dependency" });

  await expect(calls).toHaveCount(3);
  await expect(calls.nth(0).getByText("Source control server · Create pull request", { exact: true })).toBeVisible();
  await expect(calls.nth(1).getByText("Browser tools · Take screenshot", { exact: true })).toBeVisible();
  await expect(calls.nth(2).getByText("Filesystem · Read file", { exact: true })).toBeVisible();
  await expect(calls.nth(0).getByRole("img", { name: "MCP call succeeded" })).toBeVisible();
  await expect(calls.nth(1).getByRole("img", { name: "MCP call running" })).toBeVisible();
  await expect(calls.nth(2).getByRole("img", { name: "MCP call failed" })).toBeVisible();
  await expect(coordination.getByRole("img", { name: "Coordination action rejected" })).toBeVisible();
  await expect(calls.nth(2).getByRole("img", { name: "MCP call failed" })).toHaveClass(/failed/);
  await expect(coordination.getByRole("img", { name: "Coordination action rejected" })).toHaveClass(/rejected/);
  expect(await calls.nth(2).locator(".tool-status path").evaluateAll((paths) => paths.map((path) => path.getAttribute("d"))))
    .not.toEqual(await coordination.locator(".tool-status path").evaluateAll((paths) => paths.map((path) => path.getAttribute("d"))));
  await expect(calls.nth(2).getByRole("img", { name: "MCP call succeeded" })).toHaveCount(0);
  await expect(coordination.getByRole("img", { name: "Coordination action succeeded" })).toHaveCount(0);
  await expect(calls.nth(0).locator("summary")).not.toContainText("completed");
  await expect(calls.nth(2).locator("summary")).not.toContainText("Access denied");

  await calls.nth(0).locator("summary").focus();
  await expect(calls.nth(0).locator("summary")).toBeFocused();
  await expect(calls.nth(0).locator("summary")).toHaveCSS("outline-style", "solid");
  await calls.nth(0).locator("summary").press("Enter");
  await expect(calls.nth(0)).toContainText("source_control_server");
  await expect(calls.nth(0)).toContainText("create_pull_request");
  await expect(calls.nth(0)).toContainText('"title": "Do **not** render this"');
  await expect(calls.nth(0)).toContainText('"text": "{\\"number\\":42}"');
  await expect(calls.nth(0).locator("strong")).toHaveCount(0);

  await calls.nth(1).locator("summary").click();
  await expect(calls.nth(1).getByText("Arguments", { exact: true })).toHaveCount(0);
  await expect(calls.nth(1).getByText("Result", { exact: true })).toHaveCount(0);
  await expect(calls.nth(1).getByText("Failure", { exact: true })).toHaveCount(0);

  await calls.nth(2).locator("summary").click();
  await expect(calls.nth(2)).toContainText('"message": "Access denied for **secret**.txt"');
  await expect(calls.nth(2).locator("strong")).toHaveCount(0);
  await expect(coordination.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(coordination).toContainText("Duplicate relationship");
  await expect(coordination.locator("details")).toHaveCount(0);
  await expect(coordination).not.toContainText(/Server identifier|Tool identifier|Raw status|Arguments|Result|completed|succeeded/);

  const containment = await calls.nth(0).evaluate((element) => ({
    rowOverflow: element.scrollWidth > element.clientWidth,
    dialogOverflow: element.closest("[role=dialog]")!.scrollWidth > element.closest("[role=dialog]")!.clientWidth,
    evidenceScrolls: [...element.querySelectorAll("pre")].some((pre) => pre.scrollWidth > pre.clientWidth),
  }));
  expect(containment.rowOverflow).toBe(false);
  expect(containment.dialogOverflow).toBe(false);
  expect(containment.evidenceScrolls).toBe(true);
});

test("a known coordination move presents only its domain transition", async ({ page }) => {
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    await fulfillConversationTranscript(route, [{
      id: "coordination-move",
      kind: "coordination",
      tool: "move_current_task",
      status: "succeeded",
      summary: "T-0001: implementation → code-review",
      presentation: {
        kind: "coordination-task-move",
        fromColumnId: "implementation",
        toColumnId: "code-review",
      },
      evidence: {
        rawStatus: "completed",
        arguments: { destinationColumnId: "wrong-column", expectedRevision: 4 },
        result: { accepted: true, transition: { taskId: "T-0001", fromColumnId: "wrong-source", toColumnId: "wrong-column" } },
      },
    }]);
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const move = dialog.getByRole("article", { name: "Move current task" });

  await expect(move.locator(".coordination-activity-title")).toHaveText("Move current task");
  await expect(move.getByText("From", { exact: true })).toBeVisible();
  await expect(move.getByText("To", { exact: true })).toBeVisible();
  await expect(move.locator(".coordination-activity-facts strong")).toHaveText(["Implementation", "Code review"]);
  const moveWeights = await move.evaluate((element) => ({
    action: Number.parseInt(getComputedStyle(element.querySelector(".coordination-activity-title")!).fontWeight, 10),
    columns: [...element.querySelectorAll(".coordination-activity-facts strong")].map((column) =>
      Number.parseInt(getComputedStyle(column).fontWeight, 10)),
  }));
  expect(moveWeights.columns.every((weight) => weight > moveWeights.action)).toBe(true);
  await expect(move.getByRole("img", { name: "Coordination action succeeded" })).toBeVisible();
  await expect(move.locator("details")).toHaveCount(0);
  await expect(move).not.toContainText(/Server identifier|Tool identifier|Raw status|Arguments|Result|T-0001|completed/);
});

test("coordination inspections present authoritative scopes and navigable task references", async ({ page }) => {
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    await fulfillConversationTranscript(route, [
      {
        kind: "coordination", tool: "inspect_current_task", status: "succeeded",
        summary: "T-0001: current task inspection",
        presentation: { kind: "coordination-inspection", scope: "current-task", taskTitle: "Current delivery task", columnName: "Implementation" },
      },
      {
        kind: "coordination", tool: "inspect_operating_context", status: "succeeded",
        presentation: { kind: "coordination-inspection", scope: "operating-context", attemptId: "attempt-authoritative", taskId: "T-0042", processName: "Release train", boardName: "Delivery", owningAgentName: "Code Reviewer" },
      },
      {
        kind: "coordination", tool: "list_collaborators", status: "succeeded", summary: "Collaborator directory",
        presentation: { kind: "coordination-inspection", scope: "collaborators", collaboratorCount: 2 },
      },
      {
        kind: "coordination", tool: "summarize_boards", status: "succeeded", summary: "Board summaries",
        presentation: { kind: "coordination-inspection", scope: "board-summaries", boards: [{ id: "delivery", name: "API Delivery" }, { id: "maintenance", name: "Maintenance" }] },
      },
      {
        kind: "coordination", tool: "list_archived_tasks", status: "succeeded",
        presentation: { kind: "coordination-inspection", scope: "archived-tasks", taskCount: 3 },
      },
      {
        kind: "coordination", tool: "inspect_task", status: "succeeded",
        arguments: { taskId: "T-requested" }, summary: "T-requested: inspect task",
        presentation: { kind: "coordination-inspection", scope: "task", taskId: "T-0042", taskTitle: "Authoritative task" },
      },
      {
        kind: "coordination", tool: "list_task_activity", status: "running",
        arguments: { taskId: "T-0043" }, summary: "T-0043: list task activity",
        presentation: { kind: "coordination-inspection", scope: "task-activity", taskId: "T-0043" },
      },
      {
        kind: "coordination", tool: "list_task_attachments", status: "failed",
        diagnostic: { kind: "failure", message: "Attachment store unavailable" },
        presentation: { kind: "coordination-inspection", scope: "task-attachments", taskId: "T-0044" },
      },
      {
        kind: "coordination", tool: "list_tasks", status: "succeeded",
        arguments: { boardId: "requested-board", columnIds: ["requested-column"] },
        presentation: { kind: "coordination-inspection", scope: "tasks", board: { id: "requested-board" }, columns: [{ id: "requested-column" }] },
      },
    ]);
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const currentTask = dialog.getByRole("article", { name: "Inspect current task" });
  await expect(currentTask.getByText("Task", { exact: true })).toBeVisible();
  await expect(currentTask.locator("strong")).toHaveText(["Current delivery task", "Implementation"]);
  const operatingContext = dialog.getByRole("article", { name: "Inspect operating context" });
  await expect(operatingContext.getByText("Run context", { exact: true })).toHaveCount(0);
  await expect(operatingContext).not.toContainText("attempt-authoritative");
  const collaborators = dialog.getByRole("article", { name: "List collaborators" });
  await expect(collaborators.getByText("Result", { exact: true })).toBeVisible();
  await expect(collaborators.locator("strong")).toHaveText("2 collaborators");
  const boards = dialog.getByRole("article", { name: "Summarize boards" });
  await expect(boards.getByText("Boards", { exact: true })).toBeVisible();
  await expect(boards.locator("strong")).toHaveText("API Delivery, Maintenance");
  const archived = dialog.getByRole("article", { name: "List archived tasks" });
  await expect(archived.getByText("Result", { exact: true })).toBeVisible();
  await expect(archived.locator("strong")).toHaveText("3 archived tasks");
  const inspectedTask = dialog.getByRole("article", { name: "Inspect task" });
  const inspectedTaskLink = inspectedTask.getByRole("link", { name: "T-0042 Authoritative task" });
  await expect(inspectedTaskLink).toHaveAttribute("target", "_blank");
  await expect(inspectedTaskLink).toHaveAttribute("rel", /noopener/);
  await expect(inspectedTaskLink.locator("strong")).toHaveText("Authoritative task");
  const activity = dialog.getByRole("article", { name: "Read task activity" });
  await expect(activity.getByRole("link", { name: "T-0043" })).toHaveAttribute("target", "_blank");
  const attachments = dialog.getByRole("article", { name: "Read task attachments" });
  await expect(attachments.getByText("Failure", { exact: true })).toBeVisible();
  await expect(attachments).toContainText("Attachment store unavailable");
  const taskList = dialog.getByRole("article", { name: "List tasks" });
  await expect(taskList.getByText("Board", { exact: true })).toBeVisible();
  await expect(taskList.getByText("Columns", { exact: true })).toBeVisible();
  await expect(taskList.locator("strong")).toHaveText(["Requested board", "Requested column"]);
  await expect(dialog.getByRole("img", { name: "Coordination action running" })).toBeVisible();
  await expect(dialog.getByRole("img", { name: "Coordination action failed" })).toBeVisible();
  await expect(dialog.locator(".coordination-activity-summary, .transcript-coordination details")).toHaveCount(0);
  expect((await dialog.locator(".transcript-coordination").allTextContents()).join(" ")).not.toMatch(
    /T-0001: current task inspection|T-requested|requested-board|requested-column|completed|succeeded| · /,
  );

  await inspectedTaskLink.focus();
  await expect(inspectedTaskLink).toBeFocused();
  await expect(inspectedTaskLink).toHaveCSS("outline-style", "solid");
  const currentUrl = page.url();
  const popupPromise = page.waitForEvent("popup");
  await inspectedTaskLink.press("Enter");
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/tasks\/T-0042$/);
  expect(page.url()).toBe(currentUrl);
  await popup.close();
});

test("coordination task actions link complete task identities and separate failures from action text", async ({ page }) => {
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    await fulfillConversationTranscript(route, [
      {
        kind: "coordination", tool: "create_child_task", status: "succeeded",
        presentation: { kind: "coordination-child-task", task: { id: "T-0099", title: "Review API" }, columnId: "code-review" },
      },
      {
        kind: "coordination", tool: "add_dependency", status: "succeeded",
        presentation: {
          kind: "coordination-dependency",
          sourceTask: { id: "T-0001", title: "Current delivery task" },
          targetTask: { id: "T-0088", title: "Review the API" },
        },
      },
      {
        kind: "coordination", tool: "report_permission_block", status: "succeeded",
        presentation: {
          kind: "coordination-permission-block",
          reason: "Writing the protected release file requires user approval.",
        },
      },
      {
        kind: "coordination", tool: "list_tasks", status: "failed",
        diagnostic: { kind: "failure", message: "The coordination call did not complete." },
        presentation: { kind: "coordination-inspection", scope: "tasks", board: { id: "delivery" }, columns: [{ id: "awaiting-user-approval" }] },
      },
    ]);
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const child = dialog.getByRole("article", { name: "Create child task" });
  const childLink = child.getByRole("link", { name: "T-0099 Review API" });
  await expect(childLink).toHaveAttribute("target", "_blank");
  await expect(childLink.locator("strong")).toHaveText("Review API");
  await expect(child.getByText("Column", { exact: true })).toBeVisible();
  await expect(child.locator("strong").last()).toHaveText("Code review");
  const dependency = dialog.getByRole("article", { name: "Add dependency" });
  await expect(dependency.getByRole("link", { name: "T-0001 Current delivery task" })).toHaveAttribute("target", "_blank");
  await expect(dependency.getByRole("link", { name: "T-0088 Review the API" })).toHaveAttribute("target", "_blank");
  const permissionBlock = dialog.getByRole("article", { name: "Report permission block" });
  await expect(permissionBlock.getByText("Reason", { exact: true })).toBeVisible();
  await expect(permissionBlock).toContainText("Writing the protected release file requires user approval.");
  await expect(permissionBlock.locator("details")).toHaveCount(0);
  const failedList = dialog.getByRole("article", { name: "List tasks" });
  await expect(failedList.getByText("Board", { exact: true })).toBeVisible();
  await expect(failedList.locator(".coordination-activity-facts strong")).toHaveText(["Delivery", "Awaiting user approval"]);
  const failure = failedList.locator(".coordination-activity-exception");
  await expect(failure.getByText("Failure", { exact: true })).toBeVisible();
  await expect(failure).toContainText("The coordination call did not complete.");
  expect(((await failure.textContent()) ?? "").match(/fail/giu)).toHaveLength(1);
});

test("long coordination inspection scopes stay contained at a narrow viewport", async ({ page }) => {
  const longTaskId = `T-${"authoritative-scope-".repeat(18)}`;
  const longTaskTitle = `Task-${"unbroken-context-".repeat(18)}`;
  await page.setViewportSize({ width: 360, height: 720 });
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    await fulfillConversationTranscript(route, [{
      kind: "coordination",
      tool: "inspect_operating_context",
      status: "succeeded",
      presentation: {
        kind: "coordination-inspection",
        scope: "operating-context",
        attemptId: "attempt-contained-scope",
        taskId: longTaskId,
        processName: longTaskTitle,
        boardName: "API Delivery",
        owningAgentName: "Code Reviewer",
      },
    }]);
  });

  await page.goto("/tasks/T-0001");
  const pageScrollWidthBeforeDialog = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const inspection = dialog.locator(".transcript-coordination");
  await expect(inspection).toContainText(longTaskId);
  await expect(inspection).toContainText(longTaskTitle);
  const containment = await inspection.evaluate((element) => ({
    rowOverflow: element.scrollWidth > element.clientWidth,
    dialogOverflow: element.closest("[role=dialog]")!.scrollWidth > element.closest("[role=dialog]")!.clientWidth,
    pageScrollWidth: document.documentElement.scrollWidth,
  }));
  expect(containment).toEqual({
    rowOverflow: false,
    dialogOverflow: false,
    pageScrollWidth: pageScrollWidthBeforeDialog,
  });
});

test("a coordination comment renders its Markdown with the timeline disclosure", async ({ page }) => {
  const taskResponse = await page.request.get("/api/tasks/T-0001");
  const taskResult = await taskResponse.json();
  const sourceComment = taskResult.task.comments.find((comment: { body: string }) =>
    comment.body.includes("Preserve authored context"));
  expect(sourceComment).toBeTruthy();
  const body = sourceComment.body as string;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    await fulfillConversationTranscript(route, [{
      id: "coordination-comment",
      kind: "coordination",
      tool: "add_comment",
      status: "succeeded",
      summary: "T-0001: comment",
      presentation: { kind: "coordination-comment", body, commentId: sourceComment.id },
      evidence: {
        rawStatus: "completed",
        arguments: { body, expectedRevision: 5 },
        result: { accepted: true, commentId: sourceComment.id },
      },
    }]);
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const comment = page.getByRole("dialog", { name: "Agent conversation" })
    .getByRole("article", { name: "Comment added" });

  await expect(comment.locator("strong", { hasText: "authored context" })).toBeVisible();
  await expect(comment.getByRole("img", { name: "Coordination action succeeded" })).toBeVisible();
  await expect(comment.locator("details")).toHaveCount(0);
  await expect(comment).not.toContainText(/Server identifier|Tool identifier|Raw status|Arguments|Result|T-0001|completed/);
  const disclosure = comment.getByRole("button", { name: /Show \d+ more lines/ });
  await expect(disclosure).toBeVisible();
  await disclosure.click();
  await expect(comment.getByRole("button", { name: "Show less" })).toBeVisible();

  await comment.getByRole("button", { name: "Copy comment Markdown" }).click();
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n")))
    .toBe(body);

  const historyAction = comment.getByRole("button", { name: "View in task history" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(historyAction).toBeFocused();
  await expect(historyAction).toHaveCSS("outline-style", "solid");
  await historyAction.press("Enter");
  await expect(page.getByRole("dialog", { name: "Agent conversation" })).toHaveCount(0);
  const timelineSource = page.locator(`#timeline-source-${sourceComment.id}`);
  await expect(timelineSource).toBeFocused();
  await expect(timelineSource).toHaveClass(/timeline-source-target/);
  await expect(timelineSource.getByRole("button", { name: "Show less" })).toBeVisible();
});

test("wide transcript content wraps without overflowing the dialog or page", async ({ page }) => {
  const unbroken = "C:/workspace/" + "deeply-nested-segment/".repeat(18) + "artifact.json";
  const prose = "Transcript prose remains readable within the available width even when it contains " +
    `an unbroken value such as ${unbroken}.`;
  const structuredOutput = JSON.stringify({ path: unbroken, status: "completed" }, null, 2);
  const preformattedOutput = `COMMAND\tRESULT\n${unbroken}\tcompleted`;

  await page.setViewportSize({ width: 360, height: 720 });
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    await fulfillConversationTranscript(route, [
      { kind: "message", role: "agent", text: prose },
      {
        kind: "command",
        command: structuredOutput,
        status: "completed",
        output: preformattedOutput,
      },
      { kind: "diagnostic", text: unbroken },
    ]);
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


test("conversation message, command, and MCP stream remains readable in both appearances", async ({ page }) => {
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    await fulfillConversationTranscript(route, [
      { id: "appearance-command-running", kind: "command", command: "pnpm typecheck", status: "running" },
      { id: "appearance-command-failed", kind: "command", command: "pnpm lint", status: "failed", output: "Lint failed." },
      {
        id: "appearance-mcp",
        kind: "mcp",
        server: "source_control_server",
        tool: "create_pull_request",
        status: "succeeded",
        rawStatus: "completed",
        arguments: { title: "Appearance evidence" },
      },
      {
        id: "appearance-mcp-rejected",
        kind: "coordination",
        tool: "add_dependency",
        status: "rejected",
        summary: "T-0001: dependency on T-0002 · Rejected: duplicate-relationship",
        presentation: {
          kind: "coordination-dependency",
          sourceTask: { id: "T-0001" },
          targetTask: { id: "T-0002" },
        },
        diagnostic: { kind: "rejection", message: "Duplicate relationship" },
        evidence: { rawStatus: "completed" },
      },
      {
        id: "appearance-coordination-inspection",
        kind: "coordination",
        tool: "inspect_task",
        status: "succeeded",
        presentation: {
          kind: "coordination-inspection",
          scope: "task",
          taskId: "T-0002",
          taskTitle: "Inspect linked evidence",
        },
      },
      {
        id: "appearance-coordination-comment",
        kind: "coordination",
        tool: "add_comment",
        status: "succeeded",
        presentation: {
          kind: "coordination-comment",
          body: "Recorded **appearance evidence**.",
          commentId: "appearance-comment-source",
        },
      },
    ], { append: true });
  });
  for (const theme of ["dark", "light"] as const) {
    await page.goto("/tasks/T-0001");
    await setAppearance(page, theme);
    await page.getByRole("button", { name: "View conversation" }).click();
    const dialog = page.getByRole("dialog", { name: "Agent conversation" });
    const message = dialog.locator(".transcript-item.message").first();
    const command = dialog.locator(".transcript-command").first();
    const mcp = dialog.locator(".transcript-mcp").first();
    const coordination = dialog.getByRole("article", { name: "Add dependency" });
    const inspection = dialog.getByRole("article", { name: "Inspect task" });
    const inspectionLink = inspection.getByRole("link", { name: "T-0002 Inspect linked evidence" });
    const commentHistoryAction = dialog.getByRole("button", { name: "View in task history" });
    const statuses = [
      command.getByRole("img", { name: "Command succeeded" }),
      dialog.getByRole("img", { name: "Command running" }),
      dialog.getByRole("img", { name: "Command failed" }),
      mcp.getByRole("img", { name: "MCP call succeeded" }),
      coordination.getByRole("img", { name: "Coordination action rejected" }),
    ];
    const disclosure = command.locator("summary");
    const disclosureIcon = command.locator(".command-disclosure-icon");

    expect(await contrastRatio(message)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(command.locator(".command-title"))).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(mcp.locator(".mcp-title"))).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(coordination.locator(".coordination-activity-title"))).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(inspectionLink)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(commentHistoryAction)).toBeGreaterThanOrEqual(4.5);
    for (const status of statuses) expect(await contrastRatio(status)).toBeGreaterThanOrEqual(3);
    await disclosure.hover();
    await expect(disclosureIcon).toHaveCSS("stroke", theme === "dark" ? "rgb(114, 214, 159)" : "rgb(23, 78, 58)");
    await disclosure.focus();
    await expect(disclosure).toBeFocused();
    await expect(disclosure).toHaveCSS("outline-style", "solid");
    await expect(disclosure).toHaveCSS("outline-width", "2px");
    await disclosure.click();
    await expect(command.locator("pre").first()).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(10, 16, 13)" : "rgb(23, 33, 29)",
    );
    await mcp.locator("summary").click();
    await expect(mcp.locator("pre").first()).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(10, 16, 13)" : "rgb(23, 33, 29)",
    );
    await inspectionLink.focus();
    await expect(inspectionLink).toBeFocused();
    await expect(inspectionLink).toHaveCSS("outline-style", "solid");
    await commentHistoryAction.hover();
    expect(await contrastRatio(commentHistoryAction)).toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(commentHistoryAction).toBeFocused();
    await expect(commentHistoryAction).toHaveCSS("outline-style", "solid");
    await expect(commentHistoryAction).toHaveCSS("outline-width", "2px");
    await dialog.getByRole("button", { name: "Close conversation" }).click();
  }
});
