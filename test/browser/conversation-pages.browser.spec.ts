import { availableConversationResponse, clearTextSelection, contrastRatio, expect, runningConversationScenario, selectRenderedText, selectedText, test } from "./browser-fixture.ts";

test("ten thousand elements keep a bounded window, reload evicted pages and preserve the reading anchor in both themes", async ({ page }) => {
  let baseline: Awaited<ReturnType<typeof availableConversationResponse>> | undefined;
  const requests: string[] = [];
  let holdOlder: Promise<void> | undefined;
  let releaseOlder: (() => void) | undefined;
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    baseline ??= await availableConversationResponse(await route.fetch());
    const params = new URL(route.request().url()).searchParams;
    requests.push(params.toString());
    const size = Number(params.get("pageSize") ?? 50);
    const cursor = params.get("cursor");
    if (cursor?.startsWith("older:") && holdOlder !== undefined) await holdOlder;
    let start = 10_000 - size;
    if (cursor !== null) {
      const [direction, value] = cursor.split(":");
      const position = Number(value);
      start = direction === "older" ? Math.max(0, position - size) : direction === "ending" ? Math.max(0, position - size + 1) : direction === "newer" ? position + 1 : position;
    }
    const end = Math.min(10_000, start + size);
    await route.fulfill({ json: { ...baseline, conversation: { ...baseline.conversation,
      liveStatus: null,
      history: Array.from({ length: end - start }, (_, offset) => ({ kind: "item", activationId: "browser-activation", attemptId: "browser-attempt", item: { id: `item-${start + offset}`, kind: "message", role: "agent", text: `History evidence ${start + offset}` } })),
      page: { recordIds: Array.from({ length: end - start }, (_, offset) => `record-${start + offset}`), olderCursor: start === 0 ? null : `older:${start}`, newerCursor: end === 10_000 ? null : `newer:${end - 1}`, refreshCursor: `refresh:${start}`, endingCursor: `ending:${end - 1}`, atLatest: end === 10_000 },
    } } });
  });
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(dialog).toContainText("History evidence 9999");
  const content = dialog.locator(".transcript-content");
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    for (let index = 0; index < 5; index++) {
      const earlier = dialog.getByRole("button", { name: "Load earlier history" });
      const priorFirst = await dialog.locator("[data-history-record]").first().getAttribute("data-history-record");
      expect(await contrastRatio(earlier)).toBeGreaterThanOrEqual(4.5);
      await earlier.click();
      await expect(dialog.locator("[data-history-record]").first()).not.toHaveAttribute("data-history-record", priorFirst!);
      await expect(dialog.locator("[data-history-record]")).toHaveCount(theme === "dark" && index === 0 ? 100 : 150);
      await expect(dialog.getByText("Loading history…", { exact: true })).toHaveCount(0);
    }
    expect(await dialog.locator("[data-history-record]").count()).toBeLessThanOrEqual(150);
  }
  await dialog.getByRole("button", { name: "Load later history" }).click();
  await expect(dialog.locator("[data-history-record]")).toHaveCount(150);
  expect(requests.filter((request) => request.includes("older")).length).toBeGreaterThan(3);
  await expect(dialog.getByText("Loading history…", { exact: true })).toHaveCount(0);
  holdOlder = new Promise<void>((resolve) => { releaseOlder = resolve; });
  await content.evaluate((element) => { element.scrollTop = (element.querySelector<HTMLElement>(".conversation-stream")?.offsetTop ?? 0) - (element as HTMLElement).offsetTop + 120; });
  await content.hover();
  await page.mouse.wheel(0, -500);
  await expect(dialog.getByText("Loading history…", { exact: true })).toBeVisible();
  const anchor = dialog.locator("[data-history-record]").first();
  const anchorId = await anchor.getAttribute("data-history-record");
  const selected = await selectRenderedText(anchor.locator(".message p"));
  const before = (await anchor.boundingBox())!.y;
  releaseOlder!();
  holdOlder = undefined;
  await expect(dialog.getByText("Loading history…", { exact: true })).toHaveCount(0);
  const retainedAnchor = dialog.locator(`[data-history-record="${anchorId}"]`);
  expect(Math.abs((await retainedAnchor.boundingBox())!.y - before)).toBeLessThanOrEqual(1);
  expect(await selectedText(page)).toBe(selected);
  expect(await dialog.locator("[data-history-record]").count()).toBeLessThanOrEqual(150);
  await dialog.getByRole("button", { name: "Load later history" }).evaluate((element) => (element as HTMLButtonElement).click());
  await expect(dialog.locator("[data-history-record]").first()).toHaveAttribute("data-history-record", anchorId!);
  expect(await selectedText(page)).toBe(selected);
  await expect(dialog.getByText("Loading history…", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Load later history" }).evaluate((element) => (element as HTMLButtonElement).click());
  await expect(dialog.getByText("Clear the text selection before moving to another history window.")).toBeVisible();
  expect(await selectedText(page)).toBe(selected);
  await clearTextSelection(page);
  await dialog.getByRole("button", { name: "Retry history" }).click();
  await expect(dialog.getByText("Clear the text selection before moving to another history window.")).toHaveCount(0);
});

test("switching tasks discards a delayed conversation response", async ({ page }) => {
  const response = await page.request.post("/api/tasks", { data: { boardId: "delivery", columnId: "implementation", title: "Second paging task", description: "Race isolation", idempotencyKey: "paging-second-task" } });
  const created = await response.json() as { accepted: boolean; task: { id: string } };
  expect(created.accepted).toBe(true);
  let releaseFirst: (() => void) | undefined;
  const firstResponse = new Promise<void>((resolve) => { releaseFirst = resolve; });
  await page.route("**/api/tasks/*/conversations/*", async (route) => {
    const oldTask = route.request().url().includes("/tasks/T-0001/");
    if (oldTask) await firstResponse;
    await route.fulfill({ json: runningConversationScenario([{ id: "race", kind: "message", role: "agent", text: oldTask ? "Stale task evidence" : "New task evidence" }]) }).catch(() => undefined);
  });
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  await expect(page.getByRole("dialog", { name: "Agent conversation" })).toContainText("Loading conversation");
  await page.keyboard.press("Escape");
  await page.goto(`/tasks/${created.task.id}`);
  await page.locator(".conversation-index-row").click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(dialog).toContainText("New task evidence");
  releaseFirst!();
  await expect(dialog).not.toContainText("Stale task evidence");
});

test("source navigation selects a direct window and history failures are retryable", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    calls++;
    if (calls <= 2) expect(new URL(route.request().url()).searchParams.get("attemptId")).toBeTruthy();
    await route.fulfill({ status: calls === 1 ? 503 : 200, json: calls === 1 ? { error: "Temporary read failure" } : await (await route.fetch()).json() });
  });
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog).toContainText("Implementation Agent", { timeout: 6000 });
});

test("retry clears a failed newer edge after background refresh reaches the end", async ({ page }) => {
  let failed = false;
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    if (cursor === "newer" && !failed) {
      failed = true;
      await route.fulfill({ status: 503, json: { error: "Newer read failed" } });
      return;
    }
    const count = failed ? 60 : 50;
    const result = runningConversationScenario(Array.from({ length: count }, (_, index) => ({ id: `edge-${index}`, kind: "message", role: "agent", text: `Edge evidence ${index}` })));
    result.conversation.history = result.conversation.history.filter((entry) => entry.kind === "item");
    result.conversation.liveStatus = null;
    result.conversation.page = { recordIds: Array.from({ length: count }, (_, index) => `edge-${index}`), olderCursor: null, newerCursor: failed ? null : "newer", refreshCursor: "refresh", endingCursor: "ending", atLatest: failed };
    await route.fulfill({ json: result });
  });
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await dialog.getByRole("button", { name: "Load later history" }).click();
  await expect(dialog.getByRole("button", { name: "Retry history" })).toBeVisible();
  await expect(dialog.locator("[data-history-record]")).toHaveCount(60);
  await expect(dialog.getByRole("button", { name: "Load later history" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Retry history" }).click();
  await expect(dialog.getByRole("button", { name: "Retry history" })).toHaveCount(0);
  await expect(dialog.locator("[data-history-record]")).toHaveCount(60);
});
