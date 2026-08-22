import { expect, test } from "./browser-fixture.ts";

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
