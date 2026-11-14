import { contrastRatio, expect, setAppearance, test } from "./browser-fixture.ts";
import type { ResourceClaimView, ResourceView } from "../../src/application/resource-contract.ts";

for (const theme of ["dark", "light"] as const) {
  test(`resource catalog create, edit and archive remain readable in ${theme}`, async ({ page }, testInfo) => {
    await page.goto("/");
    await setAppearance(page, theme);
    const row = page.getByRole("region", { name: "Shared resources" });
    const create = row.getByRole("button", { name: "Create resource" });
    const buttonBounds = await create.boundingBox();
    const iconBounds = await create.locator("svg").boundingBox();
    expect(buttonBounds).not.toBeNull(); expect(iconBounds).not.toBeNull();
    expect(Math.abs(buttonBounds!.x + buttonBounds!.width / 2 - iconBounds!.x - iconBounds!.width / 2)).toBeLessThan(1);
    expect(Math.abs(buttonBounds!.y + buttonBounds!.height / 2 - iconBounds!.y - iconBounds!.height / 2)).toBeLessThan(1);
    await create.click();
    await page.getByLabel("Resource title").fill("Native game window");
    await page.getByRole("dialog").getByRole("button", { name: "Create resource", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Native game window", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit resource", exact: true }).click();
    await page.getByLabel("Resource description").fill("Use one game at a time.");
    await page.getByRole("button", { name: "Save resource" }).click();
    await expect(page.getByText("Use one game at a time.", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Back to board" }).click();
    const card = row.getByRole("link", { name: /Native game window/ });
    await expect(card).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`resource-board-${theme}.png`), fullPage: true });
    expect(await contrastRatio(card)).toBeGreaterThanOrEqual(4.5);
    const columnBounds = (await page.locator(".board-column").first().boundingBox())!;
    const rowBounds = (await row.boundingBox())!;
    expect(Math.abs(rowBounds.x - columnBounds.x)).toBeLessThan(1);
    expect(Math.abs(rowBounds.width - columnBounds.width)).toBeLessThan(1);
    await expect(row.getByText("Project-wide · shared access")).toHaveCount(0);
    const surface = card.locator("xpath=ancestor-or-self::*[contains(concat(' ', normalize-space(@class), ' '), ' resource-card ')][1]");
    const before = await surface.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, shadow: getComputedStyle(element).boxShadow }));
    await card.hover();
    await expect.poll(() => surface.evaluate(element => getComputedStyle(element).transform)).toBe("matrix(1, 0, 0, 1, 0, -1)");
    expect(await surface.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(before.background);
    expect(await surface.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe(before.shadow);
    await card.locator(".card-title").hover();
    await expect(card.locator(".card-title")).toHaveCSS("text-decoration-line", "underline");
    expect(await contrastRatio(card)).toBeGreaterThanOrEqual(4.5);
    await expect(row.getByRole("button", { name: /archive|claim|release/i })).toHaveCount(0);
    await card.click();
    const url = page.url();
    await page.getByText("More actions", { exact: true }).click();
    await page.getByRole("button", { name: "Archive resource", exact: true }).click();
    await expect(page.locator(".task-heading")).toContainText("Archived");
    await page.getByRole("link", { name: "Back to board" }).click();
    await expect(row.getByRole("link", { name: /Native game window/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Show archived tasks" }).click();
    await expect(row.getByRole("link", { name: /Native game window/ })).toBeVisible();
    await page.goto(url);
    await expect(page.locator(".task-heading")).toContainText("Archived");
    await expect(page.getByRole("button", { name: "Edit resource" })).toHaveCount(0);
  });
}

for (const theme of ["dark", "light"] as const) {
  test(`resource ownership and waiting are inspectable in ${theme}`, async ({ page }, testInfo) => {
    const owner: ResourceClaimView = { id: "claim-owner", resourceId: "R-0001", resourceTitle: "Native game", taskId: "T-0001", taskTitle: "Owner task", requestingAgentId: "implementer", requestingAgentName: "Implementation Agent", status: "held", requestedAt: "2026-11-10T10:00:00Z", grantedAt: "2026-11-10T10:00:00Z", closedAt: null };
    const waiter: ResourceClaimView = { ...owner, id: "claim-waiter", taskId: "T-0002", taskTitle: "Waiting task", status: "pending", grantedAt: null };
    const resource: ResourceView = { id: "R-0001", title: "Native game", description: "One game window", revision: 1, archived: false, owner, queue: [waiter] };
    await page.route("**/api/resources", route => route.fulfill({ json: { available: true, resources: [resource] } }));
    await page.route("**/api/resources/R-0001", route => route.fulfill({ json: { available: true, resource } }));
    await page.route("**/api/resources/R-0001/archive", route => route.fulfill({ status: 409, json: { accepted: false, reason: "active-claims" } }));
    let claims: ResourceClaimView[] = [waiter];
    await page.route("**/api/tasks/T-0002", async route => {
      const response = await route.fetch();
      const detail = await response.json();
      detail.inspection.resourceClaims = claims;
      detail.task.resourceClaims = claims;
      await route.fulfill({ response, json: detail });
    });
    await page.goto("/");
    await setAppearance(page, theme);
    const card = page.getByRole("region", { name: "Shared resources" }).getByRole("link", { name: /Native game/ });
    await expect(card).toContainText("Held by T-0001");
    await expect(card).toContainText("1 waiting");
    await expect(card.locator(".signal.running")).toHaveText("Held by T-0001");
    expect(await contrastRatio(card.locator(".signal.running"))).toBeGreaterThanOrEqual(4.5);
    await card.click();
    const ownership = page.getByRole("region", { name: "Resource claims" });
    await expect(ownership.getByRole("link", { name: /Owner task/ })).toHaveAttribute("href", "/tasks/T-0001");
    const waiting = ownership.getByRole("link", { name: /Waiting task/ });
    await expect(waiting).toHaveAttribute("href", "/tasks/T-0002");
    expect(await contrastRatio(waiting)).toBeGreaterThanOrEqual(4.5);
    await expect(ownership).toContainText("Implementation Agent");
    await expect(page).toHaveTitle("Native game (R-0001) · Agent Coordination");
    await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
    await page.getByText("0 running", { exact: true }).click();
    await expect(page.getByText("No active runs.", { exact: true })).toBeVisible();
    await page.getByText("0 running", { exact: true }).click();
    await page.getByRole("button", { name: /^Settings/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(ownership.getByRole("heading", { name: "Waiting queue", exact: true })).toBeVisible();
    await expect(ownership.getByText("Waiting on", { exact: true })).toHaveCount(0);
    await expect(ownership.getByText("T-0001 · Requested by Implementation Agent", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(waiting).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`resource-mobile-${theme}.png`), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: testInfo.outputPath(`resource-detail-${theme}.png`), fullPage: true });
    await page.getByText("More actions", { exact: true }).click();
    await page.getByRole("button", { name: "Archive resource", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("still has a holder or pending claims");
    await page.goto("/tasks/T-0002");
    const panel = page.getByRole("region", { name: "Shared resources", exact: true });
    await expect(panel.getByRole("link", { name: /Native game/ })).toHaveAttribute("href", "/resources/R-0001");
    await expect(panel).toContainText("Waiting on");
    await expect(panel).toContainText("R-0001 · Requested by Implementation Agent");
    const badge = panel.locator(".signal");
    const titleBounds = (await panel.getByRole("link", { name: "Native game", exact: true }).boundingBox())!;
    const badgeBounds = (await badge.boundingBox())!;
    expect(badgeBounds.x).toBeGreaterThan(titleBounds.x + titleBounds.width);
    expect(Math.abs(badgeBounds.y - titleBounds.y)).toBeLessThan(5);
    expect(await contrastRatio(badge)).toBeGreaterThanOrEqual(4.5);
    const waitingColor = await badge.evaluate(element => getComputedStyle(element).backgroundColor);
    const headingSize = await panel.locator("h2").evaluate(element => getComputedStyle(element).fontSize);
    expect(headingSize).toBe(await page.locator(".detail-panel h2").first().evaluate(element => getComputedStyle(element).fontSize));
    claims = [{ ...waiter, status: "held", grantedAt: owner.grantedAt }];
    await page.reload();
    await expect(panel).toContainText("Claimed");
    expect(await contrastRatio(badge)).toBeGreaterThanOrEqual(4.5);
    expect(await badge.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(waitingColor);
    await expect(panel.getByRole("button")).toHaveCount(0);
    expect(await contrastRatio(panel.getByRole("link"))).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: testInfo.outputPath(`task-resources-${theme}.png`), fullPage: true });
    claims = [...claims, { ...waiter, id: "second-claim", resourceId: "R-0002", resourceTitle: "Browser session" }];
    await page.reload();
    await expect(panel.getByRole("link")).toHaveCount(2);
    for (const entry of await panel.getByRole("listitem").all()) {
      const title = (await entry.getByRole("link").boundingBox())!;
      const state = (await entry.locator(".signal").boundingBox())!;
      expect(state.x).toBeGreaterThan(title.x + title.width);
      expect(Math.abs(state.y - title.y)).toBeLessThan(5);
    }
    await page.screenshot({ path: testInfo.outputPath(`task-multiple-resources-${theme}.png`), fullPage: true });
    claims = [];
    await page.reload();
    await expect(panel).toHaveCount(0);
  });
}

for (const back of ["in-app", "browser"] as const) {
  test(`resource ${back} return restores board and resource-strip scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 600 });
    const resources = Array.from({ length: 14 }, (_, index) => ({ id: `R-${index}`, title: `Shared device ${index}`, description: "Preview", revision: 1, archived: false, owner: null, queue: [] }));
    await page.route("**/api/resources", route => route.fulfill({ json: { available: true, resources } }));
    await page.route("**/api/resources/R-13", route => route.fulfill({ json: { available: true, resource: resources[13] } }));
    await page.goto("/");
    const row = page.getByRole("region", { name: "Shared resources" });
    const card = row.getByRole("link", { name: /Shared device 13/ });
    await card.scrollIntoViewIfNeeded();
    const strip = row.locator(".resource-cards");
    const horizontal = await strip.evaluate(element => element.scrollLeft);
    const vertical = await page.evaluate(() => window.scrollY);
    expect(horizontal).toBeGreaterThan(100);
    expect(vertical).toBeGreaterThan(0);
    const rowTop = (await row.boundingBox())!.y;
    const boards = await page.getByTestId("board-lane").all();
    for (const board of boards) { const box = (await board.boundingBox())!; expect(box.y + box.height).toBeLessThanOrEqual(rowTop); }
    await card.click();
    await expect(page.getByRole("heading", { name: "Shared device 13", exact: true })).toBeVisible();
    if (back === "browser") await page.goBack();
    else await page.getByRole("link", { name: "Back to board" }).click();
    await expect(card).toBeVisible();
    await expect.poll(() => strip.evaluate(element => element.scrollLeft)).toBe(horizontal);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(vertical);
  });
}


test("resource detail automation controls refresh after resume and pause", async ({ page }) => {
  let state = "paused";
  let resumes = 0;
  let pauses = 0;
  await page.route("**/api/board", async route => {
    const response = await route.fetch();
    const board = await response.json();
    board.automation = { ...board.automation, state };
    await route.fulfill({ response, json: board });
  });
  await page.route("**/api/resources/R-preview", route => route.fulfill({ json: {
    available: true, resource: { id: "R-preview", title: "Preview", description: "", revision: 1, archived: false, owner: null, queue: [] },
  } }));
  await page.route("**/api/automation/resume", route => {
    expect(route.request().method()).toBe("POST"); resumes++; state = "running";
    return route.fulfill({ json: { accepted: true } });
  });
  await page.route("**/api/automation/pause", route => {
    expect(route.request().method()).toBe("POST"); pauses++; state = "paused";
    return route.fulfill({ json: { accepted: true } });
  });
  await page.goto("/resources/R-preview");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  expect(resumes).toBe(1); expect(pauses).toBe(1);
});


for (const theme of ["dark", "light"] as const) {
  test(`task cards distinguish held and pending resources in ${theme}`, async ({ page }) => {
    await page.route("**/api/board", async route => {
      const response = await route.fetch();
      const board = await response.json();
      const column = board.boards[0].columns.find((column: { id: string }) => column.id === "implementation");
      const task = column.tasks.find((task: { id: string }) => task.id === "T-0001");
      task.heldResourceIds = ["R-0001", "R-0002"];
      task.waitingOn = { taskIds: [], resourceIds: ["R-0003"] };
      await route.fulfill({ response, json: board });
    });
    await page.goto("/");
    await setAppearance(page, theme);
    const card = page.locator('[data-task-id="T-0001"]');
    const holding = card.getByText("Holding · R-0001, R-0002", { exact: true });
    await expect(holding).toBeVisible();
    await expect(card.getByText("Waiting on · R-0003", { exact: true })).toBeVisible();
    expect(await contrastRatio(holding)).toBeGreaterThanOrEqual(4.5);
    await expect(page.locator('[data-task-id="T-0002"]')).not.toContainText("Holding");
  });
}
