import { clearTextSelection, contrastRatio, expect, selectRenderedText, selectedText, test } from "./browser-fixture.ts";
import type { UserTaskDetailQueryResult } from "../../src/application/user-task-detail-contract.ts";

test("large timeline retains requested pages and navigates unloaded map destinations", async ({ page }) => {
  let baseline: Extract<UserTaskDetailQueryResult, { available: true }> | undefined;
  let mapReads = 0;
  const targetReads: string[] = [];
  const record = (index: number) => ({ key: `activity-move-${index}`, kind: "activity", occurredAt: "2027-01-01", activity: { id: `move-${index}`, type: index === 75 ? "relationship.removed" : "task.moved", actor: { kind: "user", id: "paul" }, occurredAt: "2027-01-01", details: index === 75 ? { relatedTaskId: "T-0002", relationshipType: "dependency", relationshipRole: "source" } : { fromColumnId: "backlog", toColumnId: "implementation" } } });
  const windowPage = (start: number, size = 50) => ({ records: Array.from({ length: Math.min(size, 10_000 - start) }, (_, i) => record(start + i)), total: 10_000, start, olderCursor: start + size < 10_000 ? `older:${start + size}` : null, newerCursor: start > 0 ? `newer:${Math.max(0, start - 50)}` : null, refreshCursor: `refresh:${start}`, inspectableSources: { commentIds: [], activityIds: Array.from({ length: Math.min(size, 10_000 - start) }, (_, i) => `move-${start + i}`) }, relatedTasks: start <= 75 && start + size > 75 ? [{ id: "T-0002", title: "Earlier relationship label", available: true, archived: false, completed: false }] : [] });
  await page.route("**/api/tasks/T-0001", async (route) => {
    if (!baseline) {
      const result = await (await route.fetch()).json() as UserTaskDetailQueryResult;
      expect(result.available).toBe(true);
      if (!result.available) throw new Error("Fixture task unavailable");
      baseline = result;
    }
    await route.fulfill({ json: { ...baseline, timeline: windowPage(0), movementSummary: { total: 10_000, latestSourceId: "move-0" } } });
  });
  await page.route("**/api/tasks/T-0001/timeline?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const source = params.get("sourceId");
    if (source) targetReads.push(source);
    const start = source ? Number(source.split("-")[1]) : Number(params.get("cursor")?.split(":")[1] ?? 0);
    await route.fulfill({ json: { available: true, page: windowPage(start, Number(params.get("pageSize") ?? 50)) } });
  });
  await page.route("**/api/tasks/T-0001/movement-map?*", async (route) => {
    mapReads++;
    const after = Number(new URL(route.request().url()).searchParams.get("after"));
    await route.fulfill({ json: { available: true, map: { movements: after ? [] : Array.from({ length: 10_000 }, (_, i) => ({ ...record(i).activity, recordId: `activity-move-${i}`, sequence: 10_000 - i })), cursor: 10_000, total: 10_000 } } });
  });
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/tasks/T-0001");
  await expect(page.locator(".timeline > li")).toHaveCount(50);
  expect(mapReads).toBe(0);
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "Load older timeline" }).evaluate((element) => (element as HTMLButtonElement).click());
    await expect(page.locator(".timeline > li")).toHaveCount(100 + i * 50);
    await expect(page.getByText("Loading timeline…", { exact: true })).toHaveCount(0);
    if (i === 0) {
      await page.getByRole("checkbox", { name: "Visible to agents" }).check();
      await expect(page.locator(".timeline > li")).toHaveCount(100);
      await expect(page.getByRole("link", { name: "Earlier relationship label", exact: true })).toBeVisible();
      await page.getByRole("checkbox", { name: "Visible to agents" }).uncheck();
    }
  }
  await page.locator(".timeline > li").last().scrollIntoViewIfNeeded();
  await expect(page.locator(".movement-map-landmark")).toHaveCount(10_000);
  await page.locator('[data-testid="movement-map"] button[data-source-id="move-9999"]').evaluate((element) => (element as HTMLButtonElement).click());
  await expect(page.locator("#timeline-source-move-9999")).toHaveClass(/timeline-source-target/);
  expect(targetReads).toContain("move-9999");
  expect(await page.locator(".timeline > [data-history-record]").count()).toBeGreaterThanOrEqual(251);
  await expect(page.locator(".timeline-history-gap button")).toBeVisible();
  await expect(page.locator(".timeline-window-spacer")).toHaveCount(0);
});


test("map waits for an available layout, retries locally and keyboard targets reject stale responses in both themes", async ({ page }) => {
  let mapReads = 0;
  let failures = 1;
  let releaseOld: (() => void) | undefined;
  let holdOld = true;
  const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
  const targets: string[] = [];
  const record = (index: number) => ({ key: `activity-race-${index}`, kind: "activity", occurredAt: "2027-01-01", activity: { id: `race-${index}`, type: "task.moved", actor: { kind: "user", id: "paul" }, occurredAt: "2027-01-01", details: { fromColumnId: "backlog", toColumnId: "implementation" } } });
  const windowPage = (start: number) => ({ records: Array.from({ length: Math.min(50, 10_000 - start) }, (_, i) => record(start + i)), total: 10_000, start, olderCursor: null, newerCursor: null, refreshCursor: `refresh:${start}` });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const detail = await (await route.fetch()).json();
    await route.fulfill({ json: { ...detail, timeline: windowPage(0), movementSummary: { total: 10_000 } } });
  });
  await page.route("**/api/tasks/T-0001/timeline?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const source = params.get("sourceId");
    const start = source ? Number(source.split("-")[1]) : Number(params.get("cursor")?.split(":")[1] ?? 0);
    if (source) targets.push(source);
    if (source === "race-9999" && holdOld) await oldGate;
    await route.fulfill({ json: { available: true, page: windowPage(start) } }).catch(() => undefined);
  });
  await page.route("**/api/tasks/T-0001/movement-map?*", async (route) => {
    mapReads++;
    if (failures-- > 0) return route.fulfill({ status: 503, json: { error: "Temporary map failure" } });
    const after = Number(new URL(route.request().url()).searchParams.get("after"));
    await route.fulfill({ json: { available: true, map: { movements: after ? [] : Array.from({ length: 10_000 }, (_, i) => ({ ...record(i).activity, recordId: `activity-race-${i}`, sequence: 10_000 - i })), cursor: 10_000, total: 10_000 } } });
  });
  await page.setViewportSize({ width: 1200, height: 600 });
  await page.goto("/tasks/T-0001");
  await page.locator(".timeline > li").last().scrollIntoViewIfNeeded();
  expect(mapReads).toBe(0);
  await expect(page.getByRole("textbox", { name: "Comment" })).toBeEnabled();
  await page.setViewportSize({ width: 1200, height: 900 });
  const map = page.locator('[data-testid="movement-map"]');
  await expect(map.getByRole("alert")).toBeVisible();
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    expect(await contrastRatio(map.getByRole("alert"))).toBeGreaterThanOrEqual(4.5);
  }
  await map.getByRole("button", { name: "Retry map" }).focus();
  await page.keyboard.press("Enter");
  await expect(map.locator(".movement-map-landmark")).toHaveCount(10_000);
  await map.locator('button[data-source-id="race-9999"]').evaluate((element) => (element as HTMLButtonElement).click());
  await expect.poll(() => targets.includes("race-9999")).toBe(true);
  for (const id of [4000, 5000, 6000]) await map.locator(`button[data-source-id="race-${id}"]`).evaluate((element) => (element as HTMLButtonElement).click());
  holdOld = false; releaseOld!();
  await expect(page.locator("#timeline-source-race-6000")).toBeFocused();
  expect(targets).toEqual(["race-9999", "race-6000"]);
  await expect(page.locator("#timeline-source-race-9999")).toHaveCount(0);
  await map.locator('button[data-source-id="race-6000"]').evaluate((element) => (element as HTMLButtonElement).focus({ preventScroll: true }));
  await page.keyboard.press("End");
  await expect(page.locator("#timeline-source-race-9999")).toBeFocused();
  await map.locator('button[data-source-id="race-9999"]').evaluate((element) => (element as HTMLButtonElement).focus({ preventScroll: true }));
  await page.keyboard.press("Home");
  await expect(page.locator("#timeline-source-race-0")).toBeFocused();
});

test("timeline failures retry without losing a reading anchor or selected text", async ({ page }) => {
  let failOlder = true;
  let releaseOlder: (() => void) | undefined;
  const olderGate = new Promise<void>((resolve) => { releaseOlder = resolve; });
  const record = (index: number) => ({ key: `comment-selection-${index}`, kind: "comment", occurredAt: "2027-01-01", comment: { id: `selection-${index}`, body: `Selection evidence ${index}`, actor: { kind: "user", id: "paul" }, occurredAt: "2027-01-01" } });
  const windowPage = (start: number, size: number) => ({ records: Array.from({ length: size }, (_, i) => record(start + i)), total: 10_000, start, olderCursor: `older:${start + size}`, newerCursor: start > 0 ? `newer:${Math.max(0, start - 50)}` : null, refreshCursor: `refresh:${start}` });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const detail = await (await route.fetch()).json();
    await route.fulfill({ json: { ...detail, timeline: windowPage(0, 50) } });
  });
  await page.route("**/api/tasks/T-0001/timeline?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const cursor = params.get("cursor");
    if (cursor?.startsWith("older:")) {
      if (failOlder) { failOlder = false; return route.fulfill({ status: 503, json: { error: "Temporary timeline failure" } }); }
      await olderGate;
    }
    const start = Number(params.get("sourceId")?.split("-")[1] ?? cursor?.split(":")[1] ?? 0);
    await route.fulfill({ json: { available: true, page: windowPage(start, Number(params.get("pageSize") ?? 50)) } });
  });
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "Load older timeline" }).evaluate((element) => (element as HTMLButtonElement).click());
  await expect(page.getByRole("button", { name: "Retry timeline" })).toBeVisible();
  await page.getByRole("button", { name: "Retry timeline" }).evaluate((element) => (element as HTMLButtonElement).click());
  await page.locator('[data-timeline-record="selection-20"]').evaluate((element) => {
    const header = document.querySelector(".detail-topbar")!;
    window.scrollBy(0, element.getBoundingClientRect().top - header.getBoundingClientRect().bottom - 10);
  });
  const anchor = page.locator('[data-timeline-record="selection-20"]');
  const text = await selectRenderedText(anchor.getByText("Selection evidence 20", { exact: true }));
  const before = (await anchor.boundingBox())!.y;
  releaseOlder!();
  await expect(page.locator(".timeline > li")).toHaveCount(100);
  expect(Math.abs((await anchor.boundingBox())!.y - before)).toBeLessThanOrEqual(1);
  expect(await selectedText(page)).toBe(text);
  await clearTextSelection(page);
  await page.getByRole("button", { name: "Load older timeline" }).evaluate((element) => (element as HTMLButtonElement).click());
  await expect(page.locator(".timeline > li")).toHaveCount(150);
});


test("one large attempt keeps nested metadata, survives loaded-target races and scrubs the complete journey", async ({ page }) => {
  let mapReads = 0;
  let releaseMap: (() => void) | undefined;
  const mapGate = new Promise<void>((resolve) => { releaseMap = resolve; });
  let releaseTarget: (() => void) | undefined;
  const targetGate = new Promise<void>((resolve) => { releaseTarget = resolve; });
  let holdTarget = true;
  let oldTargetReturned = false;
  const targets: string[] = [];
  let attempt: Extract<import("../../src/application/timeline-contract.ts").TimelineRecord, { kind: "attempt" }> | undefined;
  let liveNested = false;
  const content = (index: number) => ({ kind: "activity", sequence: 10_000 - index, occurredAt: "2027-01-01", activity: { id: `nested-${index}`, type: index === 50 ? "relationship.removed" : "task.moved", actor: { kind: "user", id: "paul" }, occurredAt: "2027-01-01", details: index === 50 ? { relationshipType: "dependency", relationshipRole: "source", relatedTaskId: "T-0002" } : { fromColumnId: "backlog", toColumnId: "implementation" } } });
  const windowPage = (start: number, direct = false) => ({ records: [{ ...attempt, content: Array.from({ length: direct ? 1 : 50 }, (_, i) => content(start + i - (liveNested && start === 0 && !direct ? 1 : 0))), contentPage: { total: 10_000, olderCursor: direct ? null : `nested:${start + 50}`, ...(start ? { sourceId: `nested-${start}` } : {}) } }], total: 1, start: 0, olderCursor: null, newerCursor: null, refreshCursor: "refresh",
    inspectableSources: { commentIds: [], activityIds: Array.from({ length: direct ? 1 : 50 }, (_, i) => `nested-${start + i - (liveNested && start === 0 && !direct ? 1 : 0)}`) }, relatedTasks: start === 50 ? [{ id: "T-0002", title: "Old related task", available: true, completed: false, archived: false }] : [] });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const detail = await (await route.fetch()).json();
    attempt ??= detail.timeline.records.find((record: { kind: string }) => record.kind === "attempt");
    await route.fulfill({ json: { ...detail, timeline: windowPage(0), movementSummary: { total: 10_000 } } });
  });
  await page.route("**/api/tasks/T-0001/movement-map?*", async (route) => {
    mapReads++;
    const after = Number(new URL(route.request().url()).searchParams.get("after"));
    if (!after) await mapGate;
    await route.fulfill({ json: { available: true, map: { movements: after ? [] : Array.from({ length: 10_000 }, (_, i) => ({ ...content(i).activity, type: "task.moved", details: { fromColumnId: "backlog", toColumnId: "implementation" }, recordId: attempt!.key, sequence: 10_000 - i })), cursor: 10_000, total: 10_000 } } });
  });
  await page.route("**/api/tasks/T-0001/timeline?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const source = params.get("sourceId");
    if (source) targets.push(source);
    if (source === "nested-9999" && holdTarget) { await targetGate; oldTargetReturned = true; }
    const start = Number(source?.split("-")[1] ?? params.get("cursor")?.split(":")[1] ?? 0);
    await route.fulfill({ json: { available: true, page: windowPage(start, source !== null) } });
  });
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/tasks/T-0001");
  await page.locator(".attempt-history > li").last().scrollIntoViewIfNeeded();
  await expect.poll(() => mapReads).toBe(1);
  await page.setViewportSize({ width: 1200, height: 600 });
  await page.setViewportSize({ width: 1200, height: 900 });
  expect(mapReads).toBe(1);
  releaseMap!();
  const map = page.locator('[data-testid="movement-map"]');
  await expect(map.locator(".movement-map-landmark")).toHaveCount(10_000);
  await map.locator('button[data-source-id="nested-9999"]').evaluate((element) => (element as HTMLButtonElement).click());
  await expect.poll(() => targets.includes("nested-9999")).toBe(true);
  await map.locator('button[data-source-id="nested-0"]').evaluate((element) => (element as HTMLButtonElement).click());
  await expect(page.locator("#timeline-source-nested-0")).toBeFocused();
  holdTarget = false; releaseTarget!();
  await expect.poll(() => oldTargetReturned).toBe(true);
  await expect(page.locator("#timeline-source-nested-9999")).toHaveCount(0);
  await expect(page.locator("#timeline-source-nested-0")).toBeFocused();
  await page.getByRole("checkbox", { name: "Visible to agents" }).check();
  await page.getByRole("button", { name: "Load older attempt activity" }).evaluate((element) => (element as HTMLButtonElement).click());
  await expect(page.locator(".attempt-history > li")).toHaveCount(100);
  await expect(page.getByRole("link", { name: "Old related task", exact: true })).toBeVisible();
  // Markers remain present even when the evidence came from a nested page.
  await expect(page.locator("#timeline-source-nested-51 .agent-inspectable-marker")).toHaveCount(1);
  await page.getByRole("checkbox", { name: "Visible to agents" }).uncheck();
  await page.locator(".attempt-history > li").last().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 500));
  await expect(map).toHaveAttribute("data-drag-ready", "true");
  const plot = (await map.locator(".movement-map-plot").boundingBox())!;
  const frame = (await map.locator(".movement-map-viewport").boundingBox())!;
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2 + plot.height, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("#timeline-source-nested-9999")).toBeFocused();
  await expect(page.locator(".attempt-history > li")).toHaveCount(101);
  await expect(page.locator(".timeline > li")).toHaveCount(1);
  const identities = () => page.locator(".attempt-history > li").evaluateAll((elements) => elements.map((element) => element.querySelector("[data-timeline-record]")?.getAttribute("data-timeline-record")));
  expect(await identities()).toEqual([...Array.from({ length: 100 }, (_, i) => `nested-${i}`), "nested-9999"]);
  liveNested = true;
  await expect(page.locator("#timeline-source-nested--1")).toHaveCount(1);
  await expect.poll(identities).toEqual(["nested--1", ...Array.from({ length: 100 }, (_, i) => `nested-${i}`), "nested-9999"]);
});


test("historical window refresh rejects delayed older evidence and current pins update independently", async ({ page }) => {
  let refreshes = 0;
  let releaseFirst: (() => void) | undefined;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let firstReturned = false;
  let pinned = true;
  const record = (index: number, text?: string) => ({ key: `comment-refresh-${index}`, kind: "comment", occurredAt: "2027-01-01", comment: { id: `refresh-${index}`, body: text ?? `Refresh evidence ${index}`, actor: { kind: "user", id: "paul" }, occurredAt: "2027-01-01", pinned: index === 5000 } });
  const windowPage = (start: number, text?: string) => ({ records: Array.from({ length: 50 }, (_, i) => record(start + i, i === 0 ? text : undefined)), total: 10_000, start, olderCursor: null, newerCursor: null, refreshCursor: `refresh:${start}` });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const detail = await (await route.fetch()).json();
    await route.fulfill({ json: { ...detail, timeline: windowPage(0), inspection: { ...detail.inspection, pinnedComments: pinned ? [record(5000).comment] : [] } } });
  });
  await page.route("**/api/tasks/T-0001/comments/refresh-5000/unpin", async (route) => {
    pinned = false;
    await route.fulfill({ json: { accepted: true } });
  });
  await page.route("**/api/tasks/T-0001/timeline?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const source = params.get("sourceId");
    if (source) return route.fulfill({ json: { available: true, page: windowPage(5000) } });
    refreshes++;
    const old = refreshes === 1;
    if (old) await firstGate;
    await route.fulfill({ json: { available: true, page: windowPage(5000, old ? "Stale refresh evidence" : "Newest refreshed evidence") } });
    if (old) firstReturned = true;
  });
  await page.goto("/tasks/T-0001");
  await page.getByRole("region", { name: "Pinned comments" }).getByRole("button", { name: "View in task history" }).click();
  const source = page.locator("#timeline-source-refresh-5000");
  await expect(source).toBeFocused();
  await expect(source).toContainText("Newest refreshed evidence", { timeout: 7000 });
  expect(refreshes).toBeGreaterThanOrEqual(2);
  releaseFirst!();
  await expect.poll(() => firstReturned).toBe(true);
  await expect(source).toContainText("Newest refreshed evidence");
  await expect(source).not.toContainText("Stale refresh evidence");
  await source.getByRole("button", { name: "Unpin comment refresh-5000", exact: true }).click();
  await expect(page.getByRole("region", { name: "Pinned comments" })).toHaveCount(0);
  await expect(source.getByRole("button", { name: "Pin comment refresh-5000", exact: true })).toBeVisible();
});


test("a newest pin activity retains direct navigation to an old unloaded authored comment", async ({ page }) => {
  const targets: string[] = [];
  await page.route("**/api/tasks/T-0001", async (route) => {
    const detail = await (await route.fetch()).json();
    await route.fulfill({ json: { ...detail, task: { ...detail.task, comments: [] }, timeline: { records: [{ key: "activity-old-pin", kind: "activity", occurredAt: "2027-01-01", activity: { id: "old-pin", type: "comment.unpinned", actor: { kind: "user", id: "paul" }, occurredAt: "2027-01-01", details: { commentId: "old-authored-comment" } } }], total: 10_000, start: 0, olderCursor: null, newerCursor: null, refreshCursor: "latest" } } });
  });
  await page.route("**/api/tasks/T-0001/timeline?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("sourceId")) targets.push(params.get("sourceId")!);
    await route.fulfill({ json: { available: true, page: { records: [{ key: "comment-old-authored-comment", kind: "comment", occurredAt: "2020-01-01", comment: { id: "old-authored-comment", body: "Original old authored evidence", actor: { kind: "user", id: "paul" }, occurredAt: "2020-01-01" } }], total: 10_000, start: 9999, olderCursor: null, newerCursor: null, refreshCursor: "old" } } });
  });
  await page.goto("/tasks/T-0001");
  const source = page.locator("#timeline-source-old-pin").getByRole("button", { name: "View in task history" });
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    expect(await contrastRatio(source)).toBeGreaterThanOrEqual(4.5);
    const centers = await source.evaluate((button) => {
      const control = button.getBoundingClientRect(); const icon = button.querySelector("svg")!.getBoundingClientRect();
      return { x: Math.abs(control.x + control.width / 2 - icon.x - icon.width / 2), y: Math.abs(control.y + control.height / 2 - icon.y - icon.height / 2) };
    });
    expect(centers.x).toBeLessThanOrEqual(1); expect(centers.y).toBeLessThanOrEqual(1);
  }
  await source.focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#timeline-source-old-authored-comment")).toBeFocused();
  await expect(page.locator("#timeline-source-old-authored-comment")).toContainText("Original old authored evidence");
  expect(targets).toEqual(["old-authored-comment"]);
});
