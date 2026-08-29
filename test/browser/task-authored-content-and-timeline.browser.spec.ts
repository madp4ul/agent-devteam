import { expect, test } from "./browser-fixture.ts";

test("rendered Markdown code stays within every authored task surface", async ({ page }) => {
  const unbrokenToken = `https://example.invalid/${"unbroken".repeat(24)}`;
  const codeSource = [
    "  const ordinaryLine = \"This intentionally long code line remains readable while preserving its indentation and authored newline.\";",
    `  ${unbrokenToken}`,
    "  final line",
  ].join("\n");
  const codeBlock = [
    "```text",
    codeSource,
    "```",
  ].join("\n");

  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.description = `Description code\n\n${codeBlock}`;
    detail.task.comments[0].body = `Comment code\n\n${codeBlock}`;
    const activation = detail.task.activations.find((candidate: { attempts: unknown[] }) => candidate.attempts.length > 0);
    activation.attempts[0].outcome.summary = `Outcome code\n\n${codeBlock}`;
    detail.task.activity.push({
      id: "long-code-conversation-message",
      type: "conversation.continued",
      actor: { kind: "user", id: "local-user" },
      occurredAt: "2026-08-15T12:00:00.000Z",
      details: {
        conversationId: "browser-conversation",
        messageId: "long-code-message",
        activationId: "long-code-activation",
        messageBody: `Conversation message code\n\n${codeBlock}`,
      },
    });
    await route.fulfill({ response, json: detail });
  });

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: /Show \d+ more lines?/ }).all().then(async (buttons) => {
    for (const button of buttons) await button.click();
  });

  const descriptionSurface = page.getByRole("region", { name: "Description" });
  const commentSurface = page.locator(".comment-entry, .nested-comment").filter({ hasText: "Comment code" });
  const outcomeSurface = page.getByRole("region", { name: "Outcome" }).filter({ hasText: "Outcome code" });
  const conversationMessageSurface = page.locator(".event-entry").filter({ hasText: "Conversation message code" });
  const surfaces = [descriptionSurface, commentSurface, outcomeSurface, conversationMessageSurface];

  for (const appearance of ["dark", "light"] as const) {
    await page.evaluate((theme) => {
      localStorage.setItem("coordination-theme", theme);
      document.documentElement.dataset.theme = theme;
    }, appearance);
    for (const width of [1280, 420]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      for (const surface of surfaces) {
        const code = surface.locator("pre code");
        await expect(code).toHaveText(`${codeSource}\n`);
        expect(await surface.locator("pre").evaluate((element) => ({
          contained: element.scrollWidth <= element.clientWidth,
          wraps: element.getBoundingClientRect().height > Number.parseFloat(getComputedStyle(element).fontSize) * 1.2 * 4,
        }))).toEqual({ contained: true, wraps: true });
      }
    }
  }

  const copyCases = [
    { surface: descriptionSurface, label: "Copy description Markdown", prefix: "Description code" },
    { surface: commentSurface, label: "Copy comment Markdown", prefix: "Comment code" },
    { surface: outcomeSurface, label: "Copy outcome Markdown", prefix: "Outcome code" },
    { surface: conversationMessageSurface, label: "Copy message Markdown", prefix: "Conversation message code" },
  ];
  for (const copyCase of copyCases) {
    await copyCase.surface.getByRole("button", { name: copyCase.label }).click();
    await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n")))
      .toBe(`${copyCase.prefix}\n\n${codeBlock}`);
  }
});

test("details keep contextual controls, one timeline, and readable transcript evidence", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  const topbar = page.locator(".detail-topbar");
  await expect(topbar.getByRole("button", { name: /Pause|Resume/ })).toBeVisible();
  await expect(topbar.getByText(/Current runs · \d+/)).toBeVisible();
  const description = page.getByRole("region", { name: "Description" });
  await expect(description.getByRole("button", { name: "Edit task" })).toBeVisible();
  await expect(description.getByText("More actions", { exact: true })).toBeVisible();
  await expect(description.getByRole("heading", { name: "Coordination evidence" })).toBeVisible();
  await expect(description.getByText("full task history", { exact: true })).toHaveCSS("font-weight", "700");
  await expect(description.getByRole("listitem")).toHaveText([
    "Keep authored context readable",
    "Preserve the exact Markdown source",
  ]);
  await expect(description.getByRole("link", { name: "current automation state" })).toHaveAttribute("target", "_blank");
  await expect(description.locator("img")).toHaveCount(0);
  await expect(description.getByRole("link", { name: "Unsafe link" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as Window & { markdownInjected?: boolean }).markdownInjected)).not.toBe(true);
  const relationships = page.getByRole("region", { name: "Relationships" });
  await expect(relationships.getByRole("heading", { name: "Depends on" })).toBeVisible();
  await expect(relationships.getByRole("link", { name: "Drag this task" })).toBeVisible();
  await expect(relationships.getByRole("link", { name: "Drag this task" })).toHaveAttribute("target", "_blank");
  await expect(relationships).toContainText("Blocking");
  const attention = page.getByRole("region", { name: "Needs attention" });
  const agentActivity = page.getByRole("region", { name: "Agent activity" });
  await expect(attention.getByText("user mention", { exact: true })).toBeVisible();
  await expect(agentActivity).not.toContainText("user mention");
  await expect(page.locator('.detail-primary-column > [data-task-section="attention"] + [data-task-section="description"]'))
    .toHaveCount(1);
  await expect(page.getByText("Please preserve the authored context")).toBeVisible();
  await expect(page.getByText("Please also verify the migration behavior.")).toBeVisible();
  await expect(page.getByText("Task moved")).toBeVisible();
  await expect(page.getByText(/Immutable framework event/)).toHaveCount(0);
  await expect(page.locator(".attempt-entry").filter({ hasText: "Implementation Agent" })
    .filter({ hasText: "Attempt 1" }).filter({ hasText: "Completed" })).toBeVisible();
  await expect(page.getByText("2m 30s")).toBeVisible();
  await expect(page.getByText("handoff", { exact: true })).toHaveCSS("font-weight", "700");
  await expect(page.getByText(/Model: Codex default/)).toHaveCount(0);
  await expect(page.getByText("Activation queued")).toHaveCount(0);
  await expect(page.getByText("Attempt started")).toHaveCount(0);
  await expect(page.getByText("Attempt completed")).toHaveCount(0);

  const movement = page.getByRole("combobox", { name: "Move task" });
  await expect(movement).toHaveValue("implementation");
  await expect(movement.locator("option")).toHaveText(["Backlog", "Implementation", "Completion"]);
  const currentColumnSource = page.getByRole("link", { name: "View move to Implementation in timeline" });
  await expect(currentColumnSource).toHaveAttribute("href", /#timeline-source-/);
  await currentColumnSource.click();
  const movementSourceId = (await currentColumnSource.getAttribute("href"))!;
  await expect(page.locator(movementSourceId)).toBeFocused();

  const movementEntry = page.locator(".movement-entry").first();
  await expect(movementEntry.locator(".timeline-marker")).toHaveText("→");
  await expect(movementEntry.locator("article")).toHaveCSS("background-color", "rgb(243, 247, 250)");
  await expect(movementEntry.locator("article")).toHaveCSS("border-left-width", "1px");
  await expect(movementEntry.locator("article")).toHaveCSS("outline-style", "none");
  await expect(movementEntry.locator("article")).toHaveClass(/timeline-source-target/);
  const relativeTimestamp = page.getByRole("region", { name: "Task timeline" }).locator("time").first();
  await expect(relativeTimestamp).toHaveAttribute("datetime", /T/);
  await expect(relativeTimestamp).toHaveAttribute("title", /\d/);
  await expect(relativeTimestamp).not.toHaveText(/\b20\d{2}\b/);

  const attemptEntry = page.locator(".attempt-entry.completed-attempt").filter({ hasText: "Attempt 1" });
  const userComment = page.locator(".comment-entry").filter({ hasText: "Please also verify the migration behavior." });
  await expect(userComment.locator("article")).toHaveCSS("background-color", "rgb(255, 249, 232)");
  const [userCommentBox, attemptBox] = await Promise.all([userComment.boundingBox(), attemptEntry.boundingBox()]);
  expect(userCommentBox).not.toBeNull();
  expect(attemptBox).not.toBeNull();
  expect(userCommentBox!.y).toBeLessThan(attemptBox!.y);
  await expect(attemptEntry).toContainText("Triggered by You moving the task to Implementation");
  await expect(attemptEntry).toContainText("Started");
  await expect(attemptEntry.locator(".attempt-agent-name")).toHaveText("Implementation Agent");
  await expect(attemptEntry.locator(".attempt-number")).toHaveText("Attempt 1");
  const attemptMetadata = attemptEntry.locator(".attempt-metadata");
  const transcriptButton = attemptEntry.getByRole("button", { name: "View conversation" });
  const [attemptMetadataBox, transcriptButtonBox] = await Promise.all([
    attemptMetadata.boundingBox(),
    transcriptButton.boundingBox(),
  ]);
  expect(attemptMetadataBox).not.toBeNull();
  expect(transcriptButtonBox).not.toBeNull();
  expect(Math.abs(
    (attemptMetadataBox!.y + attemptMetadataBox!.height / 2) -
    (transcriptButtonBox!.y + transcriptButtonBox!.height / 2),
  )).toBeLessThanOrEqual(2);
  expect(transcriptButtonBox!.x).toBeGreaterThan(attemptMetadataBox!.x + attemptMetadataBox!.width);
  const nestedComment = attemptEntry.locator(".nested-comment");
  await expect(nestedComment.locator(".entry-meta strong")).toHaveText("Commented");
  await expect(nestedComment).toHaveCSS("background-color", "rgb(255, 249, 232)");
  const attentionComment = page.locator(".comment-entry").filter({ hasText: "Please confirm the completed handoff." });
  await expect(attentionComment).toContainText("Requested user attention");
  await expect(attentionComment.locator(".comment-consequence")).toHaveCSS("font-weight", "600");
  await expect(nestedComment.getByRole("heading", { name: "Preserve authored context" })).toBeVisible();
  await expect(nestedComment.getByRole("listitem")).toHaveCount(2);
  await expect(nestedComment.locator("pre code")).toContainText('const source = "raw Markdown";');
  const authoredProse = nestedComment.locator(".authored-prose");
  expect(await authoredProse.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await nestedComment.getByRole("button", { name: /Show \d+ more lines?/ }).click();
  await expect(nestedComment.getByRole("button", { name: "Show less" })).toBeVisible();
  expect(await authoredProse.evaluate((element) => element.scrollHeight === element.clientHeight)).toBe(true);

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const expectedDescription = [
    "## Coordination evidence",
    "",
    "Understand the **full task history** and its [current automation state](https://example.com/automation).",
    "",
    "- Keep authored context readable",
    "- Preserve the exact Markdown source",
    "",
    '<img src=x onerror="window.markdownInjected=true">',
    "![Remote image](https://example.com/tracker.png)",
    "[Unsafe link](javascript:window.markdownInjected=true)",
  ].join("\n");
  await description.getByRole("button", { name: "Copy description Markdown" }).click();
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"))).toBe(expectedDescription);
  const commentCopy = nestedComment.getByRole("button", { name: "Copy comment Markdown" });
  await commentCopy.click();
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"))).toContain("### Preserve authored context");
  const outcome = attemptEntry.getByRole("region", { name: "Outcome" });
  await outcome.getByRole("button", { name: "Copy outcome Markdown" }).click();
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"))).toBe(
    [
      "Completed the **handoff** with [verification](https://example.com/result).",
      "",
      "- Tests passed",
      "- Source preserved",
      "",
      "```mermaid",
      "graph TD",
      "  A --> B",
      "```",
    ].join("\n"),
  );
  await expect(outcome.locator("pre code")).toContainText("graph TD");
  await expect(outcome.locator(".markdown-content svg")).toHaveCount(0);
  await expect(outcome.getByRole("heading", { name: "Outcome" })).toHaveCSS("text-transform", "none");
  const [copyButtonBox, copyIconBox] = await Promise.all([
    commentCopy.boundingBox(),
    commentCopy.locator("svg").boundingBox(),
  ]);
  expect(copyButtonBox).not.toBeNull();
  expect(copyIconBox).not.toBeNull();
  expect(Math.abs((copyButtonBox!.x + copyButtonBox!.width / 2) - (copyIconBox!.x + copyIconBox!.width / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs((copyButtonBox!.y + copyButtonBox!.height / 2) - (copyIconBox!.y + copyIconBox!.height / 2))).toBeLessThanOrEqual(1);
  await expect(attemptEntry.getByText("Thread information")).toHaveCount(0);
  await expect(attemptEntry).not.toContainText("thread-browser-123");
  await expect(attemptEntry.getByRole("button", { name: "Copy thread ID" })).toHaveCount(0);
  await expect(page.getByText("Token usage", { exact: true })).toHaveCount(0);
  await attemptEntry.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const focusedActivation = dialog.locator("[data-conversation-activation]").first();
  await expect(focusedActivation).toBeFocused();
  await expect(focusedActivation).toHaveCSS("outline-style", "solid");
  expect(await focusedActivation.evaluate((element) => {
    const activation = element.getBoundingClientRect();
    const viewport = element.closest(".transcript-content")!.getBoundingClientRect();
    return activation.top >= viewport.top && activation.bottom <= viewport.bottom;
  })).toBe(true);
  const moreActions = dialog.getByRole("button", { name: "More conversation actions" });
  const closeTranscript = dialog.getByRole("button", { name: "Close conversation" });
  const tokenUsage = dialog.getByRole("region", { name: "Token usage" });
  const [copyBox, closeBox] = await Promise.all([
    moreActions.boundingBox(),
    closeTranscript.boundingBox(),
  ]);
  expect(copyBox).not.toBeNull();
  expect(closeBox).not.toBeNull();
  expect(Math.abs((copyBox!.y + copyBox!.height / 2) - (closeBox!.y + closeBox!.height / 2))).toBeLessThanOrEqual(4);
  await expect(closeTranscript.locator("svg")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Implementation Agent", exact: true })).toBeVisible();
  await expect(dialog.locator(".modal-heading .conversation-origin-summary")).toHaveText("Origin · Column entry");
  await expect(dialog.locator(".transcript-content .conversation-origin-summary")).toHaveCount(0);
  await expect(dialog.locator(".conversation-run")).toHaveCount(0);
  await expect(dialog).not.toContainText("Attempt 1 · completed");
  await expect(dialog.locator(".conversation-run-metrics")).toHaveCount(0);
  await expect(dialog).not.toContainText("thread-browser-123");
  await expect(dialog).toContainText("I inspected the current task.");
  await expect(tokenUsage).toHaveCount(0);
  await expect(dialog.getByRole("img", { name: "Command succeeded" })).toBeVisible();
  await expect(dialog.getByText("output truncated")).toBeHidden();
  await dialog.locator(".transcript-command summary").click();
  await expect(dialog).toContainText("pnpm test");
  await expect(dialog).toContainText("output truncated");
  await moreActions.click();
  await dialog.getByRole("menuitem", { name: "Copy thread ID" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("thread-browser-123");
  await expect(dialog.getByRole("menuitem", { name: "Copied" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(moreActions).toBeFocused();
  const taskScrollPosition = await page.evaluate(() => {
    window.scrollTo(0, 240);
    return window.scrollY;
  });
  expect(taskScrollPosition).toBeGreaterThan(0);
  await dialog.hover();
  for (let index = 0; index < 4; index += 1) {
    await page.mouse.wheel(0, 1_000);
  }
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.scrollY)).toBe(taskScrollPosition);
  await page.locator(".transcript-backdrop").click({ position: { x: 4, y: 4 } });
  await expect(dialog).toBeHidden();

  await description.getByRole("button", { name: "Edit task" }).click();
  await expect(page.getByLabel("Task description")).toHaveValue(expectedDescription);
  await page.getByLabel("Task title").fill("Inspect all coordination evidence");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByRole("heading", { name: "Inspect all coordination evidence" })).toBeVisible();

  await movement.press("ArrowDown");
  await expect(page.getByText(/Moved T-0001 to Completion/)).toBeVisible();

  const commentBounds = await page.getByRole("region", { name: "Add comment" }).boundingBox();
  const timelineBounds = await page.getByRole("region", { name: "Task timeline" }).boundingBox();
  expect(commentBounds).not.toBeNull();
  expect(timelineBounds).not.toBeNull();
  expect(Math.abs(timelineBounds!.y - commentBounds!.y)).toBeLessThanOrEqual(1);
});

test("task details distinguish agent-inspectable content from user-only evidence", async ({ page }) => {
  await page.goto("/tasks/T-0001");

  const description = page.getByRole("region", { name: "Description" });
  const descriptionMarker = description.getByRole("button", { name: "Agent-inspectable information" });
  await expect(descriptionMarker).toBeVisible();
  await descriptionMarker.hover();
  await expect(description.getByRole("tooltip")).toHaveText(
    "Agents can inspect this information through their coordination tools.",
  );
  await descriptionMarker.focus();
  await expect(description.getByRole("tooltip")).toBeVisible();

  const relationship = page.locator(".relationship-row").first();
  const relationshipMarker = relationship.getByRole("button", { name: "Agent-inspectable information" });
  await expect(relationshipMarker).toBeVisible();
  await expect(relationship.locator(":scope > :last-child"))
    .toHaveAttribute("class", /agent-inspectable-disclosure/);

  const standaloneComment = page.locator(".comment-entry").first();
  const standaloneCommentMarker = standaloneComment.getByRole("button", { name: "Agent-inspectable information" });
  await expect(standaloneCommentMarker).toBeVisible();
  const movement = page.locator(".movement-entry").first();
  const movementMarker = movement.getByRole("button", { name: "Agent-inspectable information" });
  await expect(movementMarker).toBeVisible();

  for (const width of [1280, 420]) {
    await page.setViewportSize({ width, height: 900 });
    const [commentBox, movementBox] = await Promise.all([
      standaloneCommentMarker.boundingBox(),
      movementMarker.boundingBox(),
    ]);
    expect(commentBox).not.toBeNull();
    expect(movementBox).not.toBeNull();
    expect(Math.abs((commentBox!.x + commentBox!.width) - (movementBox!.x + movementBox!.width)))
      .toBeLessThanOrEqual(1);
  }

  const attempt = page.locator(".attempt-entry.completed-attempt").filter({ hasText: "Attempt 1" });
  await expect(attempt.locator(":scope > article > .attempt-heading")
    .getByRole("button", { name: "Agent-inspectable information" })).toHaveCount(0);
  await expect(attempt.getByRole("region", { name: "Outcome" })
    .getByRole("button", { name: "Agent-inspectable information" })).toHaveCount(0);
  await expect(attempt.locator(".nested-comment")
    .getByRole("button", { name: "Agent-inspectable information" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Task workspace" })
    .getByRole("button", { name: "Agent-inspectable information" })).toHaveCount(0);

  const markerCount = await page.getByRole("button", { name: "Agent-inspectable information" }).count();
  await page.waitForTimeout(1_200);
  await expect(page.getByRole("button", { name: "Agent-inspectable information" })).toHaveCount(markerCount);
});

test("task timeline filters mixed grouped history and keeps the choice through live refresh", async ({ page }) => {
  let publishLiveHistory = false;
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const activation = detail.task.activations.find((candidate: { attempts: unknown[] }) => candidate.attempts.length > 0);
    const attempt = activation?.attempts[0];
    const occurredAt = new Date().toISOString();
    detail.task.comments.push(
      {
        id: "filter-inspectable-comment",
        body: "Inspectable standalone filter evidence.",
        actor: { kind: "user", id: "local-user" },
        occurredAt,
      },
      {
        id: "filter-user-only-comment",
        body: "User-only standalone filter evidence.",
        actor: { kind: "user", id: "local-user" },
        occurredAt,
      },
    );
    detail.agentInspectableContent.commentIds.push("filter-inspectable-comment");
    if (attempt !== undefined) {
      detail.task.activity.push(
        {
          id: "filter-inspectable-nested",
          type: "task.edited",
          actor: { kind: "framework", id: "coordination" },
          occurredAt,
          details: { attemptId: attempt.id },
        },
        {
          id: "filter-user-only-nested",
          type: "automation.suspended",
          actor: { kind: "framework", id: "coordination" },
          occurredAt,
          details: { attemptId: attempt.id },
        },
      );
      detail.agentInspectableContent.activityIds.push("filter-inspectable-nested");
    }
    if (publishLiveHistory) {
      detail.task.comments.push(
        {
          id: "filter-live-inspectable",
          body: "Live inspectable filter evidence.",
          actor: { kind: "agent", id: "implementer" },
          occurredAt,
        },
        {
          id: "filter-live-user-only",
          body: "Live user-only filter evidence.",
          actor: { kind: "user", id: "local-user" },
          occurredAt,
        },
      );
      detail.agentInspectableContent.commentIds.push("filter-live-inspectable");
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const timeline = page.getByRole("region", { name: "Task timeline" });
  const filter = timeline.getByRole("checkbox", { name: "Visible to agents" });
  await expect(filter).not.toBeChecked();
  await expect(timeline.getByText("Inspectable standalone filter evidence.")).toBeVisible();
  await expect(timeline.getByText("User-only standalone filter evidence.")).toBeVisible();

  const authoredText = timeline.locator(".authored-prose")
    .filter({ hasText: "This intentionally long comment explains" })
    .locator("..");
  const disclosure = authoredText.getByRole("button", { name: /Show \d+ more lines?/ });
  await disclosure.click();
  const retainedNestedComment = timeline.locator(".nested-comment")
    .filter({ hasText: "This intentionally long comment explains" });
  await retainedNestedComment.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const centerBeforeFilter = await retainedNestedComment.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.top + bounds.height / 2;
  });
  await filter.evaluate((checkbox) => {
    (checkbox as HTMLInputElement).click();
  });

  await expect(filter).toBeChecked();
  await expect(timeline.getByText("Inspectable standalone filter evidence.")).toBeVisible();
  await expect(timeline.getByText("User-only standalone filter evidence.")).toHaveCount(0);
  await expect(timeline.getByText("Task edited", { exact: true })).toBeVisible();
  await expect(timeline.getByText("Task automation suspended", { exact: true })).toHaveCount(0);
  await expect(timeline.getByRole("region", { name: "Outcome" })).toHaveCount(0);
  await expect(authoredText.getByRole("button", { name: "Show less" })).toBeVisible();
  const retainedAttempt = timeline.locator(".attempt-entry")
    .filter({ hasText: "This intentionally long comment explains" });
  await expect(retainedAttempt.getByText("Completed", { exact: true })).toBeVisible();
  await expect(retainedAttempt.getByText("Attempt 1", { exact: true })).toBeVisible();
  await expect(retainedAttempt.getByText(/Triggered by/)).toBeVisible();
  await expect(retainedAttempt.getByRole("button", { name: "View conversation" })).toBeVisible();
  const centerAfterFilter = await retainedNestedComment.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.top + bounds.height / 2;
  });
  expect(Math.abs(centerAfterFilter - centerBeforeFilter)).toBeLessThanOrEqual(2);

  publishLiveHistory = true;
  await expect(timeline.getByText("Live inspectable filter evidence.")).toBeVisible();
  await expect(timeline.getByText("Live user-only filter evidence.")).toHaveCount(0);
  await expect(filter).toBeChecked();

  await filter.uncheck();
  await expect(timeline.getByText("Live user-only filter evidence.")).toBeVisible();
  await expect(timeline.getByRole("region", { name: "Outcome" }).first()).toBeVisible();
  await expect(authoredText.getByRole("button", { name: "Show less" })).toBeVisible();
});

test("task timeline explains an empty agent-visible result", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.agentInspectableContent.commentIds = [];
    detail.agentInspectableContent.activityIds = [];
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const timeline = page.getByRole("region", { name: "Task timeline" });
  const filter = timeline.getByRole("checkbox", { name: "Visible to agents" });
  await filter.check();
  await expect(timeline.getByText("No timeline content matches this filter.")).toBeVisible();
  await expect(timeline.locator(".timeline-entry")).toHaveCount(0);
  await expect(filter).toBeChecked();
});


test("collapsed timeline prose reports hidden rendered lines at desktop and narrow widths", async ({ page }) => {
  let authoredBody = "First line.  \nSecond line.  \nThird line.  \nFourth line.  \nFifth line.";
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const authoredComment = detail.task.comments.find((comment: { body: string }) =>
      comment.body.includes("Please preserve the **authored context**"));
    if (authoredComment !== undefined) {
      authoredComment.body = authoredBody;
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const authoredComment = page.locator(".comment-entry, .nested-comment").filter({ hasText: "First line." });
  const authoredProseId = await authoredComment.locator(".authored-prose").getAttribute("id");
  expect(authoredProseId).not.toBeNull();
  const authoredText = page.locator(`[id="${authoredProseId}"]`).locator("..");
  const disclosure = authoredText.getByRole("button", { name: /Show \d+ more lines?/ });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await disclosure.press("Enter");
  await expect(authoredText.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");

  authoredBody = Array.from({ length: 10 }, (_, index) =>
    `Responsive wrapping sentence ${index + 1} stays measurable when timeline content refreshes.`).join(" ");
  await expect(authoredText).toContainText("Responsive wrapping sentence 10");
  await expect(authoredText.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
  await authoredText.getByRole("button", { name: "Show less" }).click();
  const desktopDisclosure = authoredText.getByRole("button", { name: /Show \d+ more lines?/ });
  const desktopHiddenLines = Number((await desktopDisclosure.textContent())?.match(/\d+/)?.[0]);
  expect(desktopHiddenLines).toBeGreaterThan(1);

  await desktopDisclosure.click();
  await page.setViewportSize({ width: 420, height: 900 });
  await expect(authoredText.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
  await authoredText.getByRole("button", { name: "Show less" }).click();
  await expect(authoredText.getByRole("button", { name: /Show \d+ more lines?/ })).toBeVisible();
  const narrowHiddenLines = Number((await authoredText.locator(".text-disclosure").textContent())?.match(/\d+/)?.[0]);
  expect(narrowHiddenLines).toBeGreaterThan(desktopHiddenLines);

  authoredBody = "Short update.";
  await expect(authoredText).toContainText("Short update.");
  await expect(authoredText.locator(".text-disclosure")).toHaveCount(0);
});


test("task timeline keeps the centered record stable when polling inserts newer history", async ({ page }) => {
  let addNewHistory = false;
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    if (addNewHistory) {
      const occurredAt = new Date().toISOString();
      for (let index = 0; index < 4; index += 1) {
        detail.task.comments.push({
          id: `polling-comment-${index}`,
          body: `New polling history ${index}`,
          actor: { kind: "user", id: "local-user" },
          occurredAt,
        });
      }
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const attempt = page.locator(".attempt-entry.completed-attempt").filter({ hasText: "Attempt 1" });
  await attempt.scrollIntoViewIfNeeded();
  await attempt.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const centerBefore = await attempt.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.top + bounds.height / 2;
  });

  addNewHistory = true;
  await expect(page.getByText("New polling history 3")).toBeVisible();
  const centerAfter = await attempt.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.top + bounds.height / 2;
  });
  expect(Math.abs(centerAfter - centerBefore)).toBeLessThanOrEqual(2);
});


test("attempt comments and movements form full-width color bands without separators", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const activation = detail.task.activations.find((candidate: { attempts: unknown[] }) => candidate.attempts.length > 0);
    const attempt = activation?.attempts[0];
    if (attempt !== undefined) {
      detail.task.activity.push({
        id: "nested-browser-movement",
        type: "task.moved",
        actor: { kind: "agent", id: "implementer" },
        occurredAt: new Date(Date.parse(attempt.startedAt) + 90_000).toISOString(),
        details: {
          fromColumnId: "implementation",
          toColumnId: "completion",
          attemptId: attempt.id,
        },
      });
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const attempt = page.locator(".attempt-entry.completed-attempt").filter({ hasText: "Attempt 1" });
  const article = attempt.locator("article");
  const history = attempt.locator(".attempt-history");
  const movement = attempt.locator(".nested-movement");
  const comment = attempt.locator(".nested-comment");
  await expect(movement).toHaveCSS("background-color", "rgb(243, 247, 250)");
  await expect(comment).toHaveCSS("background-color", "rgb(255, 249, 232)");
  await expect(history).toHaveCSS("border-top-width", "0px");
  await expect(movement).toHaveCSS("border-bottom-width", "0px");

  const [articleBounds, movementBounds, commentBounds] = await Promise.all([
    article.boundingBox(),
    movement.boundingBox(),
    comment.boundingBox(),
  ]);
  expect(articleBounds).not.toBeNull();
  expect(movementBounds).not.toBeNull();
  expect(commentBounds).not.toBeNull();
  expect(movementBounds!.x - articleBounds!.x).toBeLessThanOrEqual(4);
  expect(articleBounds!.x + articleBounds!.width - movementBounds!.x - movementBounds!.width).toBeLessThanOrEqual(1);
  expect(commentBounds!.x - articleBounds!.x).toBeLessThanOrEqual(4);
  expect(articleBounds!.x + articleBounds!.width - commentBounds!.x - commentBounds!.width).toBeLessThanOrEqual(1);
  expect(Math.abs(movementBounds!.y + movementBounds!.height - commentBounds!.y)).toBeLessThanOrEqual(1);
});


test("task timeline keeps retries separate and links each retry to the preceding attempt", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const activation = detail.task.activations.find((candidate: { attempts: unknown[] }) => candidate.attempts.length > 0);
    const first = activation?.attempts[0];
    if (activation !== undefined && first !== undefined) {
      first.status = "failed";
      first.outcome = { status: "failed", summary: "The first attempt lost its runtime connection." };
      activation.attempts.push({
        ...first,
        id: "browser-retry-attempt",
        status: "completed",
        startedAt: new Date(Date.parse(first.completedAt) + 1_000).toISOString(),
        completedAt: new Date(Date.parse(first.completedAt) + 121_000).toISOString(),
        outcome: { status: "completed", summary: "The retry completed the handoff." },
      });
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const retry = page.locator("#timeline-source-browser-retry-attempt").locator("..");
  const first = page.locator(".attempt-entry.failed-attempt")
    .filter({ hasText: "The first attempt lost its runtime connection." });
  await expect(retry).toBeVisible();
  await expect(first).toBeVisible();
  expect((await retry.boundingBox())!.y).toBeLessThan((await first.boundingBox())!.y);
  const trigger = retry.getByRole("link", { name: "Attempt 1 failed" });
  await expect(trigger).toHaveAttribute("href", /timeline-source-/);
  await trigger.click();
  await expect(first.locator("article")).toBeFocused();
});


test("task details keep board navigation pinned while scrolling long history", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  await expect(page.getByRole("heading", { name: "Task timeline" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  const topbar = page.locator(".detail-topbar");
  const backLink = page.getByRole("link", { name: "Back to board" });
  await expect(backLink).toBeVisible();
  await expect.poll(() => topbar.evaluate((element) => element.getBoundingClientRect().top)).toBe(0);
  const [topbarCenter, backLinkTextCenter] = await Promise.all([
    topbar.evaluate((element) => element.getBoundingClientRect().top + element.clientHeight / 2),
    backLink.evaluate((element) => {
      const textBounds = document.createRange();
      textBounds.selectNodeContents(element);
      const bounds = textBounds.getBoundingClientRect();
      return bounds.top + bounds.height / 2;
    }),
  ]);
  expect(Math.abs(backLinkTextCenter - topbarCenter)).toBeLessThanOrEqual(1);
});


test("task details prioritize agent activity and preserve the responsive reading order", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.automation = { state: "paused", attemptsMayStart: false };
    detail.collaborators = [
      { id: "implementer", name: "Implementation Agent", summary: "Builds verified changes." },
      { id: "reviewer", name: "Review Agent", summary: "Reviews completed changes." },
    ];
    detail.activeRun = null;
    detail.inspection.blocking = { blocked: true, blockerTaskIds: ["T-0002"] };
    detail.inspection.automationSuspended = true;
    detail.task.activations.push(
      {
        id: "queued-implementation-one",
        targetAgentId: "implementer",
        status: "queued",
        reason: { type: "agent-mention", sourceEventId: "queued-comment-one" },
        attempts: [],
        startupFailure: null,
        recovery: null,
        model: "gpt-5.6",
        reasoningEffort: "high",
        stale: false,
      },
      {
        id: "queued-implementation-two",
        targetAgentId: "implementer",
        status: "queued",
        reason: { type: "column-entry", sourceEventId: "queued-move-two" },
        attempts: [],
        startupFailure: null,
        recovery: null,
        model: null,
        reasoningEffort: null,
        stale: false,
      },
      {
        id: "queued-review",
        targetAgentId: "reviewer",
        status: "queued",
        reason: { type: "agent-mention", sourceEventId: "queued-comment-three" },
        attempts: [],
        startupFailure: null,
        recovery: null,
        model: null,
        reasoningEffort: null,
        stale: false,
      },
    );
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const description = page.getByRole("region", { name: "Description" });
  await expect(description).toBeVisible();
  const attention = page.getByRole("region", { name: "Needs attention" });
  const activity = page.getByRole("region", { name: "Agent activity" });
  const workspace = page.getByRole("region", { name: "Workspace", exact: true });
  const movement = page.getByRole("region", { name: "Move task" });
  const relationships = page.getByRole("region", { name: "Relationships" });
  await expect(activity.getByText("Current work", { exact: true })).toHaveCount(0);
  await expect(workspace.getByText("Development files", { exact: true })).toHaveCount(0);
  await expect(movement.getByText("Workflow", { exact: true })).toHaveCount(0);
  await expect(relationships.getByText("Coordination", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Add comment" }).getByText("Authored communication", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Task timeline" }).getByText("Complete history", { exact: true })).toHaveCount(0);
  await expect(activity.getByText("Waiting", { exact: true })).toBeVisible();
  await expect(activity).toContainText("Process automation is paused");
  await activity.getByText(/more reasons?/).click();
  await expect(activity).toContainText("Blocked by T-0002");
  await expect(activity).toContainText("Task automation is suspended");
  await expect(activity.getByText("Implementation Agent", { exact: true })).toHaveCount(2);
  await expect(activity.getByText("Review Agent", { exact: true })).toHaveCount(1);
  await expect(activity.getByText("Activated by column entry", { exact: true })).toBeVisible();
  await expect(activity).not.toContainText("Requested model");
  await expect(activity).not.toContainText("Requested reasoning");
  await expect(activity).not.toContainText("Failed activations");

  const descriptionBounds = await description.boundingBox();
  const attentionBounds = await attention.boundingBox();
  const activityBounds = await activity.boundingBox();
  expect(descriptionBounds).not.toBeNull();
  expect(attentionBounds).not.toBeNull();
  expect(activityBounds).not.toBeNull();
  expect(descriptionBounds!.y - (attentionBounds!.y + attentionBounds!.height)).toBeLessThanOrEqual(24);
  expect(activityBounds!.y - (descriptionBounds!.y + descriptionBounds!.height)).toBeLessThanOrEqual(24);

  const workspaceBounds = await workspace.boundingBox();
  expect(workspaceBounds).not.toBeNull();
  expect(Math.abs(workspaceBounds!.y - attentionBounds!.y)).toBeLessThanOrEqual(2);
  const overviewBounds = await page.locator('[data-task-section="overview"]').boundingBox();
  expect(overviewBounds).not.toBeNull();
  expect(overviewBounds!.width).toBeGreaterThan(descriptionBounds!.width * 1.25);
  await expect(page.getByText(/Revision \d+/)).toHaveCount(0);

  const primaryGaps = await page.locator(".detail-primary-column > [data-task-section]").evaluateAll((elements) =>
    elements.slice(1).map((element, index) => {
      const previous = elements[index]!.getBoundingClientRect();
      const current = element.getBoundingClientRect();
      return current.top - previous.bottom;
    }),
  );
  const secondaryGaps = await page.locator(".detail-column > [data-task-section]").evaluateAll((elements) =>
    elements.slice(1).map((element, index) => {
      const previous = elements[index]!.getBoundingClientRect();
      const current = element.getBoundingClientRect();
      return current.top - previous.bottom;
    }),
  );
  expect(new Set(primaryGaps.map(Math.round)).size).toBe(1);
  expect(new Set(secondaryGaps.map(Math.round)).size).toBe(1);

  await page.setViewportSize({ width: 600, height: 900 });
  const readingOrder = await page.locator("[data-task-section]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-task-section")),
  );
  expect(readingOrder).toEqual([
    "overview",
    "attention",
    "description",
    "activity",
    "comment",
    "timeline",
    "workspace",
    "move",
    "relationships",
    "conversations",
  ]);
});
