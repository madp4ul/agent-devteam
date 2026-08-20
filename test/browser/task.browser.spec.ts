import { expect, test } from "./browser-fixture.ts";
import { cleanWorkspaceGitScenario, runningConversationScenario } from "./browser-fixture.ts";

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
  await expect(dialog.locator(".conversation-run.selected-run")).toContainText("Run 1 · completed");
  const copyThreadId = dialog.getByRole("button", { name: "Copy thread ID" });
  const closeTranscript = dialog.getByRole("button", { name: "Close conversation" });
  const tokenUsage = dialog.getByRole("region", { name: "Token usage" });
  const [usageBox, copyBox, closeBox] = await Promise.all([
    tokenUsage.boundingBox(),
    copyThreadId.boundingBox(),
    closeTranscript.boundingBox(),
  ]);
  expect(usageBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  expect(closeBox).not.toBeNull();
  expect(Math.abs((copyBox!.y + copyBox!.height / 2) - (closeBox!.y + closeBox!.height / 2))).toBeLessThanOrEqual(4);
  await expect(closeTranscript.locator("svg")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Implementation Agent", exact: true })).toBeVisible();
  await expect(dialog.locator(".modal-heading .conversation-origin-summary")).toHaveText("Origin · Column entry");
  await expect(dialog.locator(".transcript-content .conversation-origin-summary")).toHaveCount(0);
  await expect(dialog).toContainText("Run 1 · completed");
  await expect(dialog.locator(".conversation-run")).toContainText("Implementation Agent");
  await expect(dialog).not.toContainText("Attempt 1 · completed");
  await expect(dialog.locator(".conversation-run-metrics")).toContainText(/Runtime\s+2m 30s/);
  await expect(dialog).not.toContainText("thread-browser-123");
  await expect(dialog).toContainText("I inspected the current task.");
  await expect(tokenUsage).toHaveText(/Input 600\s*·\s*Output 600/);
  await expect(tokenUsage).not.toContainText(/cached|reasoning|total|used|%/i);
  await expect(tokenUsage).not.toContainText(/cost|currency|\$/i);
  await expect(dialog).toContainText("pnpm test (exit 0)");
  await expect(dialog.getByText("output truncated")).toBeHidden();
  await dialog.getByText("View command output").click();
  await expect(dialog).toContainText("output truncated");
  await expect(copyThreadId).toBeVisible();
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
  expect(timelineBounds!.y - (commentBounds!.y + commentBounds!.height)).toBeGreaterThanOrEqual(8);
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
  await expect(page.getByRole("link", { name: "Back to board" })).toBeVisible();
  await expect.poll(() => topbar.evaluate((element) => element.getBoundingClientRect().top)).toBe(0);
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


test("an open task reconciles external timeline changes without disturbing a focused draft", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    reads += 1;
    if (reads === 2) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    if (reads >= 3) {
      detail.task.comments.push({
        id: "external-live-comment",
        body: "An agent added this while the task page remained open. @implementer",
        actor: { kind: "agent", id: "implementer" },
        occurredAt: "2026-08-09T12:00:00.000Z",
      });
      detail.task.activity.push({
        id: "external-live-activation-event",
        type: "activation.created",
        actor: { kind: "framework", id: "coordination" },
        occurredAt: "2026-08-09T12:00:00.001Z",
        details: {
          activationId: "external-live-activation",
          targetAgentId: "implementer",
        },
      });
      detail.task.activations.push({
        id: "external-live-activation",
        targetAgentId: "implementer",
        status: "queued",
        reason: { type: "agent-mention", sourceEventId: "external-live-comment" },
        attempts: [],
        startupFailure: null,
        recovery: null,
        model: null,
        reasoningEffort: null,
        stale: false,
      });
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const draft = page.getByRole("textbox", { name: "Comment" });
  await draft.fill("Keep this unfinished user draft.");
  await draft.focus();
  const liveComment = page.locator(".comment-entry").filter({ hasText: "An agent added this while the task page remained open." });
  await expect(liveComment).toBeVisible();
  await expect(liveComment.locator(".canonical-mention")).toHaveText("@implementer");
  await expect(liveComment).toContainText("Requested Implementation Agent");
  await page.waitForTimeout(750);
  await expect(liveComment).toBeVisible();
  await expect(liveComment).toContainText("Requested Implementation Agent");
  await expect(draft).toHaveValue("Keep this unfinished user draft.");
  await expect(draft).toBeFocused();
});


test("comment participants are discoverable and insert canonical mentions without submitting", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  const comment = page.getByRole("region", { name: "Add comment" });
  const draft = comment.getByRole("textbox", { name: "Comment" });

  await draft.fill("Please ask @imp");
  const suggestions = comment.getByRole("listbox", { name: "Mention participants" });
  await expect(suggestions).toBeVisible();
  const implementer = suggestions.getByRole("option", { name: /Implementation Agent.*Builds verified changes/ });
  await expect(implementer).toHaveAttribute("aria-selected", "true");
  await expect(draft).toHaveAttribute("aria-activedescendant", "mention-participant-implementer");
  await implementer.click();
  await expect(draft).toHaveValue("Please ask @implementer ");
  await expect(suggestions).toHaveCount(0);

  await draft.pressSequentially("and notify @");
  await draft.press("ArrowDown");
  await expect(suggestions.getByRole("option", { name: /User.*person overseeing the process/i }))
    .toHaveAttribute("aria-selected", "true");
  await draft.press("Enter");
  await expect(draft).toHaveValue("Please ask @implementer and notify @user ");
  await expect(page.locator(".comment-entry").filter({
    hasText: "Please ask @implementer and notify @user",
  })).toHaveCount(0);

  await comment.getByRole("button", { name: "Post" }).click();
  const submitted = page.locator(".comment-entry").filter({ hasText: "Please ask" });
  await expect(submitted.locator(".canonical-mention")).toHaveCount(2);
  await expect(submitted.locator(".canonical-mention").first()).toHaveAttribute("title", "Implementation Agent");
  await expect(submitted).toContainText("Requested Implementation Agent, user attention");
  const agentMention = submitted.locator(".canonical-mention.agent-mention");
  const userMention = submitted.locator(".canonical-mention.user-mention");
  const agentConsequence = submitted.locator(".comment-consequence .agent-mention");
  const userConsequence = submitted.locator(".comment-consequence .user-mention");
  await expect(agentMention).toHaveCount(1);
  await expect(userMention).toHaveCount(1);
  await expect(agentConsequence).toHaveText("Implementation Agent");
  await expect(userConsequence).toHaveText("user attention");
  const [agentMentionColor, userMentionColor, agentConsequenceColor, userConsequenceColor] = await Promise.all([
    agentMention.evaluate((element) => getComputedStyle(element).backgroundColor),
    userMention.evaluate((element) => getComputedStyle(element).backgroundColor),
    agentConsequence.evaluate((element) => getComputedStyle(element).backgroundColor),
    userConsequence.evaluate((element) => getComputedStyle(element).backgroundColor),
  ]);
  expect(agentMentionColor).not.toBe(userMentionColor);
  expect(agentConsequenceColor).toBe(agentMentionColor);
  expect(userConsequenceColor).toBe(userMentionColor);
});


test("mention discovery supports dismissal and ignores email-like and inline-code text", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  const comment = page.getByRole("region", { name: "Add comment" });
  const draft = comment.getByRole("textbox", { name: "Comment" });
  const suggestions = comment.getByRole("listbox", { name: "Mention participants" });

  await draft.fill("paul@imp");
  await expect(suggestions).toHaveCount(0);
  await draft.fill("Use `@imp` as an example");
  await expect(suggestions).toHaveCount(0);
  await draft.fill("Use ``@imp`` as an example");
  await expect(suggestions).toHaveCount(0);
  await draft.fill("Ask @imp");
  await expect(suggestions).toBeVisible();
  await draft.press("Escape");
  await expect(suggestions).toHaveCount(0);
  await expect(draft).toHaveValue("Ask @imp");
});


test("reply to an agent mention preserves the draft, avoids duplicates, and focuses the composer", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.comments.push({
      id: "agent-requested-user",
      body: "I need a decision from @user before continuing.",
      actor: { kind: "agent", id: "implementer" },
      occurredAt: "2026-08-09T12:30:00.000Z",
    });
    detail.task.comments.push({
      id: "removed-agent-requested-user",
      body: "A removed participant wrote @user and @removed.",
      actor: { kind: "agent", id: "removed" },
      occurredAt: "2026-08-09T12:31:00.000Z",
    });
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const draft = page.getByRole("textbox", { name: "Comment" });
  await draft.fill("Here is the decision.");
  const request = page.locator(".comment-entry").filter({ hasText: "I need a decision" });
  const reply = request.getByRole("button", { name: "Reply to Implementation Agent" });
  const consequence = request.locator(".comment-consequence");
  const [consequenceBox, replyBox] = await Promise.all([consequence.boundingBox(), reply.boundingBox()]);
  expect(consequenceBox).not.toBeNull();
  expect(replyBox).not.toBeNull();
  expect(Math.abs((consequenceBox!.y + consequenceBox!.height / 2) - (replyBox!.y + replyBox!.height / 2)))
    .toBeLessThanOrEqual(2);
  expect(replyBox!.x).toBeGreaterThan(consequenceBox!.x + consequenceBox!.width);
  await reply.click();
  await expect(draft).toHaveValue("Here is the decision. @implementer ");
  await expect(draft).toBeFocused();
  await reply.click();
  await expect(draft).toHaveValue("Here is the decision. @implementer ");
  const removed = page.locator(".comment-entry").filter({ hasText: "A removed participant" });
  await expect(removed.locator(".canonical-mention")).toHaveCount(1);
  await expect(removed.getByRole("button", { name: /Reply to/ })).toHaveCount(0);
});


test("reply preserves trailing draft whitespace and is absent without an active composer", async ({ page }) => {
  let archived = false;
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.comments.push({
      id: "whitespace-request",
      body: "Please answer @user.",
      actor: { kind: "agent", id: "implementer" },
      occurredAt: "2026-08-09T12:32:00.000Z",
    });
    if (archived) detail.task.archived = true;
    await route.fulfill({ response, json: detail });
  });
  await page.goto("/tasks/T-0001");
  const draft = page.getByRole("textbox", { name: "Comment" });
  await draft.fill("First line\n\n");
  await page.locator("#timeline-source-whitespace-request")
    .getByRole("button", { name: "Reply to Implementation Agent" }).click();
  await expect(draft).toHaveValue("First line\n\n@implementer ");

  archived = true;
  await page.reload();
  await expect(page.getByRole("region", { name: "Add comment" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reply to Implementation Agent" })).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});


test("task attention navigates to the exact mention and resolves beside its source", async ({ page }) => {
  const addressed = new Set<string>();
  const addressRequests: string[] = [];
  await page.route("**/api/attention/*/mark-addressed", async (route) => {
    const attentionReasonId = route.request().url().split("/").at(-2)!;
    addressed.add(attentionReasonId);
    addressRequests.push(attentionReasonId);
    await route.fulfill({ status: 200, json: { accepted: true, attentionReasonId } });
  });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.description = `${"A long agent-authored description. ".repeat(120)}\n\nEnd of description.`;
    detail.task.comments.push({
      id: "source-local-comment",
      body: "Please decide whether I should continue, @user.",
      actor: { kind: "agent", id: "implementer" },
      occurredAt: "2026-08-15T12:30:00.000Z",
    });
    detail.task.comments.push({
      id: "reply-local-comment",
      body: "Please send the implementation decision, @user.",
      actor: { kind: "agent", id: "implementer" },
      occurredAt: "2026-08-15T12:31:00.000Z",
    });
    detail.inspection.unresolvedAttention = [{
      id: "source-local-attention", type: "user-mention", sourceEventId: "source-local-comment",
      createdAt: "2026-08-15T12:30:00.000Z",
    }, {
      id: "reply-local-attention", type: "user-mention", sourceEventId: "reply-local-comment",
      createdAt: "2026-08-15T12:31:00.000Z",
    }].filter((reason) => !addressed.has(reason.id));
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001?attention=source-local-attention");
  const attention = page.getByRole("region", { name: "Needs attention" });
  const description = page.getByRole("region", { name: "Description" });
  const source = page.locator("#timeline-source-source-local-comment");
  expect(await attention.evaluate((attentionElement, descriptionElement) =>
    Boolean(attentionElement.compareDocumentPosition(descriptionElement as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
    await description.elementHandle(),
  )).toBe(true);
  await expect(attention.getByRole("button", { name: "View request" }).first()).toBeFocused();
  await page.setViewportSize({ width: 520, height: 800 });
  const highlightedReason = attention.locator(".attention-reason-card.highlighted");
  const [reasonTextBox, actionBox] = await Promise.all([
    highlightedReason.locator(":scope > span").first().boundingBox(),
    highlightedReason.getByRole("button", { name: "View request" }).boundingBox(),
  ]);
  expect(actionBox!.y).toBeGreaterThanOrEqual(reasonTextBox!.y + reasonTextBox!.height);
  expect(await attention.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await attention.getByRole("button", { name: "View request" }).first().click();
  await expect(source).toBeFocused();
  await expect(source).toHaveClass(/timeline-source-target/);
  await expect(source.getByRole("button", { name: "Mark addressed" })).toBeVisible();
  await expect(source.getByRole("button", { name: "Reply to Implementation Agent" })).toBeVisible();

  await source.getByRole("button", { name: "Mark addressed" }).click();
  await expect.poll(() => addressRequests).toEqual(["source-local-attention"]);
  await expect(source.getByRole("button", { name: "Mark addressed" })).toHaveCount(0);
  await expect(attention.locator(".attention-reason-card")).toHaveCount(1);

  await attention.getByRole("button", { name: "View request" }).click();
  const replySource = page.locator("#timeline-source-reply-local-comment");
  await expect(replySource).toBeFocused();
  await replySource.getByRole("button", { name: "Reply to Implementation Agent" }).click();
  await expect.poll(() => addressRequests).toEqual(["source-local-attention", "reply-local-attention"]);
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Comment" })).toHaveValue("@implementer ");
  await expect(page.getByRole("textbox", { name: "Comment" })).toBeFocused();
});


test("task details expose lazy and provisioned task workspaces", async ({ page, context, request }) => {
  const lazyTaskResponse = await request.post("/api/tasks", {
    data: {
      boardId: "delivery",
      columnId: "backlog",
      title: "Keep this workspace lazy",
      description: "Provision only when runnable work starts.",
      idempotencyKey: "browser-lazy-workspace-task",
    },
  });
  const lazyTask = await lazyTaskResponse.json() as { task: { id: string } };
  await page.goto(`/tasks/${lazyTask.task.id}`);
  const unprovisioned = page.getByRole("region", { name: "Workspace", exact: true });
  await expect(unprovisioned).toContainText("No task workspace exists yet");
  await expect(unprovisioned).toContainText("created before the first runnable activation");
  await expect(unprovisioned.getByRole("button", { name: "Copy path" })).toHaveCount(0);

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/tasks/T-0001");
  const workspace = page.getByRole("region", { name: "Workspace", exact: true });
  const workspaceFacts = await page.evaluate(async () => {
    const response = await fetch("/api/tasks/T-0001");
    const detail = await response.json();
    return detail.inspection.workspace as { path: string; commit: string };
  });
  const expectedPath = workspaceFacts.path;
  await expect(workspace).not.toContainText(expectedPath);
  await expect(workspace).not.toContainText("Starting ref");
  await expect(workspace).toContainText(workspaceFacts.commit.slice(0, 7));
  await expect(workspace).not.toContainText(workspaceFacts.commit);

  await workspace.getByRole("button", { name: "Copy path" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expectedPath);
  await expect(workspace.getByRole("status")).toContainText("Copied task workspace path");

  await workspace.getByRole("button", { name: "Open folder" }).click();
  await expect(workspace.getByRole("status")).toContainText("default folder application");

  await workspace.getByRole("button", { name: "More ways to open workspace" }).click();
  await workspace.getByRole("menuitem", { name: "Open in Visual Studio Code" }).click();
  await expect(workspace.getByRole("status")).toContainText("Visual Studio Code");

  await page.route("**/api/tasks/T-0001/workspace/open", (route) => route.fulfill({
    status: 503,
    json: {
      reason: "host-integration-unavailable",
      diagnostic: "Opening task workspaces is unavailable on this host.",
    },
  }));
  await workspace.getByRole("button", { name: "Open folder" }).click();
  await expect(workspace.getByRole("alert")).toContainText("unavailable on this host");

  await page.route("**/api/tasks/T-0001/workspace/open-vscode", (route) => route.fulfill({
    status: 409,
    json: {
      reason: "workspace-open-failed",
      diagnostic: "Visual Studio Code could not be found on this host.",
    },
  }));
  await workspace.getByRole("button", { name: "More ways to open workspace" }).click();
  await workspace.getByRole("menuitem", { name: "Open in Visual Studio Code" }).click();
  await expect(workspace.getByRole("alert")).toContainText("Visual Studio Code could not be found");

  await page.setViewportSize({ width: 360, height: 760 });
  const workspaceBounds = await workspace.boundingBox();
  const headingBounds = await workspace.getByRole("heading", { name: "Workspace" }).boundingBox();
  const actionBounds = await workspace.locator(".workspace-actions").boundingBox();
  const copyBounds = await workspace.getByRole("button", { name: "Copy path" }).boundingBox();
  const openBounds = await workspace.getByRole("button", { name: "Open folder" }).boundingBox();
  expect(workspaceBounds).not.toBeNull();
  expect(headingBounds).not.toBeNull();
  expect(actionBounds).not.toBeNull();
  expect(copyBounds).not.toBeNull();
  expect(openBounds).not.toBeNull();
  if (workspaceBounds !== null && actionBounds !== null) {
    expect(actionBounds.x).toBeGreaterThanOrEqual(workspaceBounds.x);
    expect(actionBounds.x + actionBounds.width).toBeLessThanOrEqual(
      workspaceBounds.x + workspaceBounds.width,
    );
  }
  if (headingBounds !== null && actionBounds !== null) {
    expect(actionBounds.y).toBeGreaterThanOrEqual(headingBounds.y + headingBounds.height);
    expect(Math.abs(actionBounds.x - headingBounds.x)).toBeLessThanOrEqual(2);
  }
  expect(Math.abs(copyBounds!.height - openBounds!.height)).toBeLessThanOrEqual(1);
});


test("task workspace Git summary refreshes branch, detached, history, and clean change state", async ({ page }) => {
  await page.clock.install();
  let reads = 0;
  await page.route("**/api/tasks/T-0001/workspace/git-state", async (route) => {
    reads += 1;
    await route.fulfill({
      status: 200,
      json: reads === 1
        ? {
            available: true,
            state: {
              head: { kind: "branch", name: "codex/issue-33", shortHash: "def5678" },
              history: { kind: "progress", commitsSinceTaskStart: 3 },
              changes: {
                additions: 14,
                deletions: 5,
                stagedFiles: 2,
                unstagedFiles: 2,
                untrackedFiles: 1,
              },
            },
          }
        : {
            available: true,
            state: {
              head: { kind: "detached", shortHash: "abc1234" },
              history: { kind: "diverged" },
              changes: {
                additions: 0,
                deletions: 0,
                stagedFiles: 0,
                unstagedFiles: 0,
                untrackedFiles: 0,
              },
            },
          },
    });
  });

  await page.goto("/tasks/T-0001");
  const summary = page.getByRole("region", { name: "Workspace Git summary" });
  const taskStartCommit = await page.evaluate(async () => {
    const response = await fetch("/api/tasks/T-0001");
    const detail = await response.json();
    return detail.inspection.workspace.commit as string;
  });
  await expect(summary).toContainText("Task start");
  await expect(summary).toContainText(taskStartCommit.slice(0, 7));
  await expect(summary).toContainText("codex/issue-33");
  await expect(summary).toContainText("def5678");
  await expect(summary).toContainText("3 commits since task start");
  await expect(summary).toContainText("+14");
  await expect(summary).toContainText("−5");
  await expect(summary).toContainText("2 staged");
  await expect(summary).toContainText("2 unstaged");
  await expect(summary).toContainText("1 untracked");
  const historyBounds = await summary.locator(".workspace-history-flow").boundingBox();
  const changesBounds = await summary.locator(".workspace-changes-card").boundingBox();
  expect(historyBounds).not.toBeNull();
  expect(changesBounds).not.toBeNull();
  if (historyBounds !== null && changesBounds !== null) {
    expect(historyBounds.y + historyBounds.height).toBeLessThanOrEqual(changesBounds.y);
  }

  await page.clock.fastForward(30_000);
  await expect(summary).toContainText("Detached at abc1234");
  await expect(summary).toContainText("History diverged from task start");
  await expect(summary).toContainText("No uncommitted changes");
  await expect(summary).not.toContainText("staged");
});


test("running workspace Git scans pause while hidden and never overlap", async ({ page, context, request }) => {
  await page.clock.install();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const detail = await (await request.get("/api/tasks/T-0001")).json();
  detail.activeRun = {
    attemptId: "live-attempt",
    activationId: "live-activation",
    taskId: "T-0001",
    agentId: "implementer",
    status: "running",
    startedAt: new Date().toISOString(),
  };
  await page.route("**/api/tasks/T-0001", async (route) => {
    await route.fulfill({ status: 200, json: detail });
  });
  let reads = 0;
  let releaseSlowScan: (() => void) | undefined;
  await page.route("**/api/tasks/T-0001/workspace/git-state", async (route) => {
    reads += 1;
    if (reads === 2) await new Promise<void>((resolve) => { releaseSlowScan = resolve; });
    await route.fulfill({ status: 200, json: cleanWorkspaceGitScenario() });
  });

  await page.goto("/tasks/T-0001");
  await expect(page.getByRole("region", { name: "Workspace Git summary" })).toContainText(
    "No uncommitted changes",
  );
  expect(reads).toBe(1);

  await page.clock.fastForward(5_000);
  await expect.poll(() => reads).toBe(2);
  await page.clock.fastForward(20_000);
  expect(reads).toBe(2);
  const workspace = page.getByRole("region", { name: "Workspace", exact: true });
  await workspace.getByRole("button", { name: "Copy path" }).click();
  await expect(workspace.getByRole("status")).toContainText("Copied task workspace path");
  await workspace.getByRole("button", { name: "Open folder" }).click();
  await expect(workspace.getByRole("status")).toContainText("default folder application");
  releaseSlowScan?.();

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(30_000);
  expect(reads).toBe(2);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => reads).toBe(3);
});


test("a failed workspace Git scan retains its result and recovers automatically", async ({ page }) => {
  await page.clock.install();
  let reads = 0;
  await page.route("**/api/tasks/T-0001/workspace/git-state", async (route) => {
    reads += 1;
    if (reads === 2) {
      await route.fulfill({
        status: 503,
        json: { available: false, reason: "git-status-unavailable" },
      });
      return;
    }
    await route.fulfill({ status: 200, json: cleanWorkspaceGitScenario() });
  });

  await page.goto("/tasks/T-0001");
  const summary = page.getByRole("region", { name: "Workspace Git summary" });
  await expect(summary).toContainText("No uncommitted changes");
  await page.clock.fastForward(30_000);
  await expect(summary.getByText("Git status unavailable")).toBeVisible();
  await expect(summary).toContainText("No uncommitted changes");
  const workspace = page.getByRole("region", { name: "Workspace", exact: true });
  await workspace.getByRole("button", { name: "More ways to open workspace" }).click();
  await workspace.getByRole("menuitem", { name: "Open in Visual Studio Code" }).click();
  await expect(workspace.getByRole("status")).toContainText("Visual Studio Code");
  await page.clock.fastForward(30_000);
  await expect(summary.getByText("Git status unavailable")).toHaveCount(0);
  expect(reads).toBe(3);
});


test("task relationships are discoverable, searchable, and recoverable", async ({ page, request }) => {
  let prerequisite = await (await request.get("/api/tasks/T-0001")).json() as {
    task: { archived: boolean; columnId: string; revision: number; title: string; description: string };
  };
  if (prerequisite.task.archived) {
    const unarchived = await request.post("/api/tasks/T-0001/unarchive", {
      data: { idempotencyKey: "restore-relationship-prerequisite" },
    });
    expect(unarchived.status()).toBe(200);
    prerequisite = await (await request.get("/api/tasks/T-0001")).json() as typeof prerequisite;
  }
  if (prerequisite.task.title !== "Inspect existing coordination") {
    const renamed = await request.patch("/api/tasks/T-0001", {
      data: {
        title: "Inspect existing coordination",
        description: prerequisite.task.description,
        expectedRevision: prerequisite.task.revision,
        idempotencyKey: "restore-relationship-prerequisite-title",
      },
    });
    expect(renamed.status()).toBe(200);
    prerequisite = await (await request.get("/api/tasks/T-0001")).json() as typeof prerequisite;
  }
  if (prerequisite.task.columnId !== "implementation") {
    const moved = await request.post("/api/tasks/T-0001/move", {
      data: {
        destinationColumnId: "implementation",
        expectedRevision: prerequisite.task.revision,
        idempotencyKey: "position-relationship-prerequisite",
      },
    });
    expect(moved.status()).toBe(200);
  }
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json() as {
      boards: Array<{ id: string; name: string; columns: Array<{ id: string; name: string; tasks: unknown[] }> }>;
    };
    body.boards.push({
      id: "operations",
      name: "Operations",
      columns: [
        {
          id: "investigation",
          name: "Investigation",
          tasks: [
            {
              id: "T-9001",
              title: "Cross-board investigation",
              boardId: "operations",
              column: { id: "investigation", name: "Investigation" },
              revision: 1,
              blocking: { blocked: false, blockerTaskIds: [] },
              relationships: [],
              unresolvedAttention: [],
              automationSuspended: false,
              run: { status: "idle", queuedActivationCount: 0, activeAttemptId: null },
            },
            ...Array.from({ length: 8 }, (_, index) => ({
              id: `T-91${index.toString().padStart(2, "0")}`,
              title: `Additional investigation ${index + 1}`,
              boardId: "operations",
              column: { id: "investigation", name: "Investigation" },
              revision: 1,
              blocking: { blocked: false, blockerTaskIds: [] },
              relationships: [],
              unresolvedAttention: [],
              automationSuspended: false,
              run: { status: "idle", queuedActivationCount: 0, activeAttemptId: null },
            })),
          ],
        },
        {
          id: "completion",
          name: "Completion",
          tasks: [{
            id: "T-9002",
            title: "Completed prerequisite",
            boardId: "operations",
            column: { id: "completion", name: "Completion" },
            revision: 2,
            blocking: { blocked: false, blockerTaskIds: [] },
            relationships: [],
            unresolvedAttention: [],
            automationSuspended: false,
            run: { status: "idle", queuedActivationCount: 0, activeAttemptId: null },
          }],
        },
      ],
    });
    await route.fulfill({ response, json: body });
  });
  await page.goto("/tasks/T-0002");

  const relationships = page.getByRole("region", { name: "Relationships" });
  await expect(relationships.getByRole("heading", { name: "Blocking tasks" })).toBeVisible();
  await expect(relationships.getByRole("link", { name: "Inspect existing coordination" })).toHaveAttribute("href", "/tasks/T-0001");
  await expect(relationships).toContainText("T-0001 · Product delivery / Implementation");
  await expect(relationships.getByRole("region", { name: "Blocking tasks" }).getByText("Blocking", { exact: true })).toHaveCount(0);
  const relationshipActions = relationships.getByRole("group", { name: "Add relationship" });
  const finder = relationshipActions.getByRole("combobox", { name: "Depends on" });
  const createChild = relationshipActions.getByRole("button", { name: "Create child task" });
  await expect(finder).toBeVisible();
  await expect(createChild).toBeVisible();
  const [createChildBox, finderBox] = await Promise.all([createChild.boundingBox(), finder.boundingBox()]);
  expect(createChildBox?.x).toBeLessThan(finderBox?.x ?? 0);
  const actionFrames = await relationshipActions.locator(":scope > *").evaluateAll((elements) =>
    elements.map((element) => ({
      borderWidth: getComputedStyle(element).borderWidth,
      backgroundColor: getComputedStyle(element).backgroundColor,
    })),
  );
  expect(actionFrames).toEqual([
    { borderWidth: "0px", backgroundColor: "rgba(0, 0, 0, 0)" },
    { borderWidth: "0px", backgroundColor: "rgba(0, 0, 0, 0)" },
  ]);
  await expect(relationshipActions.getByRole("listbox", { name: "Available dependency tasks" })).not.toBeVisible();
  await expect(page.getByLabel("Starting Git ref (optional)")).not.toBeVisible();
  await relationships.getByRole("button", { name: "Remove blocking dependency with Inspect existing coordination" }).click();
  const finalBlockerPreview = page.getByRole("dialog", { name: "Remove blocking dependency?" });
  await expect(finalBlockerPreview).toContainText("Neither task will be deleted");
  await expect(finalBlockerPreview).toContainText("clear the final blocker");
  await finalBlockerPreview.getByRole("button", { name: "Cancel" }).click();
  await finder.focus();
  const options = page.getByRole("listbox", { name: "Available dependency tasks" });
  await expect(options).toBeVisible();
  expect(await options.evaluate((element) => getComputedStyle(element).position)).toBe("absolute");
  expect(await options.evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  const overlayScroll = await options.evaluate((element) => {
    const overflow = element.scrollHeight > element.clientHeight;
    element.scrollTop = element.scrollHeight;
    return { overflow, scrollTop: element.scrollTop };
  });
  expect(overlayScroll.overflow).toBe(true);
  expect(overlayScroll.scrollTop).toBeGreaterThan(0);
  await finder.fill("Cross-board");
  await expect(options.getByRole("option", { name: /Cross-board investigation/ })).toContainText("T-9001 · Operations / Investigation");
  await finder.fill("Completed prerequisite");
  await expect(options.getByRole("option", { name: /Completed prerequisite/ })).toContainText("Completed · nonblocking");
  await finder.press("Escape");
  await expect(finder).toBeVisible();
  await expect(options).not.toBeVisible();
  await finder.focus();
  await finder.fill("Recover");
  const recoverOption = options.getByRole("option", { name: /Recover a workspace startup failure/ });
  await expect(recoverOption).toContainText("T-0003 · Product delivery / Implementation");
  await recoverOption.click();
  await expect(relationships.getByRole("heading", { name: "Depends on" })).toBeVisible();
  await expect(relationships.getByRole("link", { name: "Recover a workspace startup failure" })).toBeVisible();
  await expect(relationships.getByRole("region", { name: "Depends on" }).getByText("Blocking", { exact: true })).toBeVisible();
  const taskTimeline = page.getByRole("region", { name: "Task timeline" });
  await expect(taskTimeline.getByText("Dependency added", { exact: true })).toBeVisible();
  await expect(taskTimeline.getByText("Now depends on Recover a workspace startup failure.", { exact: true })).toBeVisible();
  await expect(taskTimeline.locator("strong.relationship-task-name", {
    hasText: "Recover a workspace startup failure",
  })).toBeVisible();
  await expect(finder).toBeVisible();
  await expect(options).not.toBeVisible();
  await expect(relationships.getByText("Selected: Recover a workspace startup failure")).toHaveCount(0);
  await expect(relationships.getByRole("button", { name: "Add dependency" })).toHaveCount(0);
  await expect(relationships.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  await finder.focus();
  await finder.fill("Recover");
  await expect(options.getByRole("option", { name: /Recover a workspace startup failure/ })).toHaveCount(0);
  await finder.press("Escape");

  await createChild.click();
  const childDialog = page.getByRole("dialog", { name: "Create child task" });
  await expect(childDialog).toContainText("Parent T-0002");
  await expect(childDialog.getByLabel("Starting column")).toHaveValue("backlog");
  await expect(childDialog.getByLabel("Starting column").locator('option[value="completion"]')).toHaveCount(0);
  await childDialog.getByLabel("Outcome-oriented title").fill("Investigate a focused child outcome");
  await childDialog.getByLabel("Complete description").fill("Keep the child isolated from dirty parent files.");
  await expect(childDialog.getByLabel("Starting Git ref (optional)")).not.toBeVisible();
  await childDialog.getByText("Advanced", { exact: true }).click();
  await childDialog.getByLabel("Starting Git ref (optional)").fill("main");
  await childDialog.getByRole("button", { name: "Create child task", exact: true }).click();
  await expect(page.locator(".feedback.status")).toContainText(/Created child T-\d{4}/);
  await expect(relationships.getByRole("heading", { name: "Child tasks" })).toBeVisible();
  await expect(taskTimeline.getByText("Child task added", { exact: true })).toBeVisible();
  await expect(taskTimeline.getByText("Investigate a focused child outcome was added as a child task.", { exact: true })).toBeVisible();
  await relationships.getByRole("link", { name: "Investigate a focused child outcome" }).click();
  const childRelationships = page.getByRole("region", { name: "Relationships" });
  const childTimeline = page.getByRole("region", { name: "Task timeline" });
  await expect(childRelationships.getByRole("heading", { name: "Parent tasks" })).toBeVisible();
  await expect(childRelationships.getByRole("link", { name: "Drag this task" })).toBeVisible();
  await expect(childRelationships.getByText("Blocking", { exact: true })).toHaveCount(0);
  await expect(childTimeline.getByText("Parent task added", { exact: true })).toBeVisible();
  await expect(childTimeline.getByText("Drag this task was added as the parent task.", { exact: true })).toBeVisible();
  await childRelationships.getByRole("link", { name: "Drag this task" }).click();

  const removeButton = relationships.getByRole("button", { name: "Remove dependency with Recover a workspace startup failure" });
  const removeIcon = removeButton.locator("svg");
  const [buttonBounds, iconBounds] = await Promise.all([removeButton.boundingBox(), removeIcon.boundingBox()]);
  expect(buttonBounds).not.toBeNull();
  expect(iconBounds).not.toBeNull();
  if (buttonBounds !== null && iconBounds !== null) {
    expect(Math.abs((buttonBounds.x + buttonBounds.width / 2) - (iconBounds.x + iconBounds.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs((buttonBounds.y + buttonBounds.height / 2) - (iconBounds.y + iconBounds.height / 2))).toBeLessThanOrEqual(1);
  }

  await removeButton.click();
  const confirmation = page.getByRole("dialog", { name: "Remove dependency?" });
  await expect(confirmation).toContainText("Neither task will be deleted");
  await expect(confirmation).toContainText("remain blocked by other unresolved work");
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(relationships.getByRole("link", { name: "Recover a workspace startup failure" })).toBeVisible();
  let removalAttempts = 0;
  await page.route("**/api/tasks/T-0002/relationships/*", async (route) => {
    if (route.request().method() === "DELETE" && removalAttempts++ === 0) {
      await route.fulfill({ status: 409, json: { accepted: false, reason: "relationship-conflict" } });
      return;
    }
    await route.continue();
  });
  await relationships.getByRole("button", { name: "Remove dependency with Recover a workspace startup failure" }).click();
  await page.getByRole("dialog", { name: "Remove dependency?" }).getByRole("button", { name: "Remove relationship" }).click();
  await expect(page.getByRole("alert")).toContainText("Relationship state was refreshed");
  await expect(relationships.getByRole("link", { name: "Recover a workspace startup failure" })).toBeVisible();
  await relationships.getByRole("button", { name: "Remove dependency with Recover a workspace startup failure" }).click();
  await page.getByRole("dialog", { name: "Remove dependency?" }).getByRole("button", { name: "Remove relationship" }).click();
  await expect(relationships.getByRole("link", { name: "Recover a workspace startup failure" })).toHaveCount(0);
  await expect(taskTimeline.getByText("Dependency removed", { exact: true })).toBeVisible();
  await expect(taskTimeline.getByText("Does not depend on Recover a workspace startup failure anymore.", { exact: true })).toBeVisible();
});


test("needs attention groups by task, locates the card, and opens the task action center", async ({ page }) => {
  await page.goto("/");
  const group = page.locator(".attention-groups > li").filter({ hasText: "T-0001" });
  await expect(group).toContainText("user mention");
  await group.getByRole("button", { name: "Locate card" }).click();
  await expect(page.locator('[data-task-id="T-0001"]')).toHaveClass(/highlighted/);
  await group.getByRole("button", { name: "Open details" }).click();
  await expect(page).toHaveURL(/\/tasks\/T-0001$/);
  const attentionReasons = page.getByRole("region", { name: "Needs attention" }).locator(".attention-list li");
  await expect(attentionReasons.first()).toBeVisible();
  await expect(attentionReasons.first().getByRole("button", { name: "View request" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Needs attention" }).getByRole("button"))
    .toHaveCount(await attentionReasons.count());
});
