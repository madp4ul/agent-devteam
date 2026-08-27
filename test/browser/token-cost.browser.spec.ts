import assert from "node:assert/strict";

import { expect, setAppearance, test } from "./browser-fixture.ts";
import { tokenCostEvidenceFixture } from "../support/conversation-feature-fixtures.ts";

test("a conversation without reported usage does not present zero as measured usage", async ({ page }) => {
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    await route.fulfill({ response, json: result });
  });
  await page.goto("/tasks/T-0001");
  await expect(page.getByTestId("task-conversations-cost")).toHaveCount(0);
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });

  await expect(dialog).toContainText("I inspected the current task.");
  await expect(dialog.getByRole("region", { name: "Token usage" })).toHaveCount(0);
  await expect(dialog).not.toContainText("0 total tokens");
});

test("a single settled attempt renders its positive conversation and task totals", async ({ page }) => {
  const settledAttempt = tokenCostEvidenceFixture({
    amount: 0.01234,
    categories: [{ category: "input", tokens: 1_234, usdPerMillionTokens: 10 }],
  });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    Object.assign(detail.conversations[0], settledAttempt);
    detail.conversationCost = settledAttempt;
    await route.fulfill({ response, json: detail });
  });
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    Object.assign(result.conversation, settledAttempt);
    await route.fulfill({ response, json: result });
  });

  await page.goto("/tasks/T-0001");
  await expect(page.getByTestId("task-conversations-cost")).toContainText("$0.01");
  await page.getByRole("button", { name: "View conversation" }).click();
  await expect(page.getByTestId("conversation-cost")).toContainText("$0.01");
});

test("conversation aggregates show known lower bounds while running totals stay visibly pending", async ({ page }) => {
  const firstBreakdown = {
    categories: [
      { category: "input", tokens: 400, usdPerMillionTokens: 5 },
      { category: "cachedInput", tokens: 1_800, usdPerMillionTokens: 0.5 },
      { category: "cacheWriteInput", tokens: 200, usdPerMillionTokens: 6.25 },
      { category: "output", tokens: 600, usdPerMillionTokens: 30 },
    ],
    reasoningOutputTokens: 350,
  };
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.conversations[0].costEstimate = { currency: "USD", amount: 0.02215 };
    detail.conversations[0].costBreakdown = firstBreakdown;
    detail.conversations[0].hasUnpricedSettledRuns = true;
    detail.conversations[0].costPending = true;
    detail.conversations.push({
      ...detail.conversations[0],
      id: "browser-conversation-2",
      costEstimate: { currency: "USD", amount: 9 },
      costBreakdown: {
        categories: [
          { category: "input", tokens: 1_000, usdPerMillionTokens: 7 },
          { category: "cachedInput", tokens: 200, usdPerMillionTokens: 0.5 },
          { category: "cacheWriteInput", tokens: 80, usdPerMillionTokens: 6.25 },
          { category: "output", tokens: 200, usdPerMillionTokens: 30 },
        ],
        reasoningOutputTokens: 0,
      },
      hasUnpricedSettledRuns: false,
      costPending: false,
    });
    detail.conversationCost = {
      costEstimate: { currency: "USD", amount: 0.03575 },
      costBreakdown: {
        categories: [
          { category: "input", tokens: 400, usdPerMillionTokens: 5 },
          { category: "cachedInput", tokens: 2_000, usdPerMillionTokens: 0.5 },
          { category: "cacheWriteInput", tokens: 280, usdPerMillionTokens: 6.25 },
          { category: "output", tokens: 800, usdPerMillionTokens: 30 },
          { category: "input", tokens: 1_000, usdPerMillionTokens: 7 },
        ],
        reasoningOutputTokens: 350,
      },
      hasUnpricedSettledRuns: true,
      costPending: true,
    };
    await route.fulfill({ response, json: detail });
  });
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    result.conversation.costEstimate = { currency: "USD", amount: 0.02215 };
    result.conversation.costBreakdown = firstBreakdown;
    result.conversation.hasUnpricedSettledRuns = true;
    result.conversation.costPending = true;
    await route.fulfill({ response, json: result });
  });

  await page.goto("/tasks/T-0001");
  const conversationsPanel = page.getByRole("region", { name: "Conversations" });
  const conversationRow = conversationsPanel.getByRole("button").first();
  const panelCost = conversationsPanel.getByTestId("task-conversations-cost");
  await expect(panelCost).toContainText("≥$0.04");
  await expect(panelCost).not.toContainText("~");
  await expect(panelCost).toHaveClass(/cost-estimate-badge/);
  await expect(panelCost).toHaveRole("status");
  await expect(panelCost).toHaveAccessibleName(/update when the current run finishes/i);
  await panelCost.hover();
  const panelBreakdown = panelCost.getByRole("tooltip", { name: "Token cost breakdown" });
  await expect(panelBreakdown).toBeVisible();
  await expect(panelBreakdown).toContainText("Input");
  await expect(panelBreakdown.locator("li")).toHaveCount(5);
  await expect(panelBreakdown).toContainText("400 × $5.00 / 1M = $0.002");
  await expect(panelBreakdown).toContainText("1,000 × $7.00 / 1M = $0.007");
  await expect(panelBreakdown).toContainText("Cached input");
  await expect(panelBreakdown).toContainText("2,000 × $0.50 / 1M = $0.001");
  await expect(panelBreakdown).toContainText("Cache write input");
  await expect(panelBreakdown).toContainText("280 × $6.25 / 1M = $0.002");
  await expect(panelBreakdown).toContainText("Output");
  await expect(panelBreakdown).toContainText("800 × $30.00 / 1M = $0.024");
  await expect(panelBreakdown).not.toContainText("reasoning tokens");
  await expect(panelBreakdown).toContainText("Known costs only");
  await expect(panelBreakdown).toContainText("Running cost will be added when available");
  await expect(conversationRow).not.toContainText("$");
  await conversationRow.click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const conversationCost = dialog.getByTestId("conversation-cost");
  await expect(dialog.locator(".cost-estimate")).toHaveCount(1);
  await expect(conversationCost).toContainText("≥$0.02");
  await expect(conversationCost).not.toContainText("~");
  await expect(conversationCost).toHaveClass(/cost-estimate-badge/);
  await expect(conversationCost).toHaveRole("status");
  await conversationCost.focus();
  const conversationBreakdown = conversationCost.getByRole("tooltip", { name: "Token cost breakdown" });
  await expect(conversationBreakdown).toBeVisible();
  await expect(conversationBreakdown).toContainText("400 × $5.00 / 1M = $0.002");
  await expect(conversationBreakdown).toContainText("1,800 × $0.50 / 1M = $0.001");
  await expect(conversationBreakdown).toContainText("200 × $6.25 / 1M = $0.001");
  await expect(conversationBreakdown).toContainText("600 × $30.00 / 1M = $0.018");
  const tokenUsage = dialog.getByRole("region", { name: "Token usage" });
  await expect(tokenUsage).toHaveCount(0);
});

test("a first priceable running attempt shows a zero aggregate with a pending spinner", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    delete detail.conversations[0].costEstimate;
    detail.conversations[0].hasUnpricedSettledRuns = false;
    detail.conversations[0].costPending = true;
    detail.conversationCost = {
      costPending: true,
      hasUnpricedSettledRuns: false,
    };
    await route.fulfill({ response, json: detail });
  });
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    delete result.conversation.costEstimate;
    result.conversation.hasUnpricedSettledRuns = false;
    result.conversation.costPending = true;
    await route.fulfill({ response, json: result });
  });

  for (const theme of ["dark", "light"] as const) {
    await page.goto("/tasks/T-0001");
    await setAppearance(page, theme);
    const conversationsPanel = page.getByRole("region", { name: "Conversations" });
    const conversationRow = conversationsPanel.getByRole("button").first();
    const pendingCost = conversationsPanel.getByRole("status", {
      name: /estimated token cost \$0\.00; will update/i,
    });
    await expect(pendingCost).toBeVisible();
    await expect(pendingCost).toContainText("$0.00");
    await expect(pendingCost).not.toContainText("~");
    const spinner = pendingCost.locator(".activity-spinner");
    const amount = pendingCost.locator("span", { hasText: "$0.00" });
    await expect(spinner).not.toHaveCSS(
      "border-top-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(spinner).toHaveCSS("animation-name", "activity-spinner-spin");
    await expect(spinner).toHaveCSS("animation-duration", "3.2s");
    expect((await spinner.boundingBox())!.x).toBeLessThan((await amount.boundingBox())!.x);
    await conversationRow.click();
    const dialog = page.getByRole("dialog", { name: "Agent conversation" });
    await expect(dialog.getByTestId("conversation-cost")).toHaveAccessibleName(
      /estimated token cost \$0\.00; will update/i,
    );
    await expect(dialog.locator(".conversation-run-metrics")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close conversation" }).click();
  }
});

test("conversation context fill is an accessible circular meter beside cost in both themes", async ({ page }) => {
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    result.conversation.costEstimate = { currency: "USD", amount: 0.12 };
    result.conversation.contextWindowUsage = {
      usedTokens: 132_000,
      contextWindowTokens: 258_400,
      usedPercent: 49,
    };
    await route.fulfill({ response, json: result });
  });

  for (const theme of ["dark", "light"] as const) {
    await page.goto("/tasks/T-0001");
    await setAppearance(page, theme);
    await page.getByRole("button", { name: "View conversation" }).click();
    const dialog = page.getByRole("dialog", { name: "Agent conversation" });
    const cost = dialog.getByTestId("conversation-cost");
    const meter = dialog.getByRole("meter", {
      name: "Context window 49% used, 132,000 of 258,400 tokens",
    });
    await expect(meter).toBeVisible();
    await expect(meter).toHaveAttribute("aria-valuenow", "49");
    await expect(meter.locator("svg")).toHaveCount(1);
    await expect(meter.locator("circle")).toHaveCount(2);
    await expect(meter.locator(".context-window-meter-value")).toHaveAttribute("stroke-dasharray", "49 51");
    await expect(meter.locator(".context-window-meter-value")).not.toHaveCSS("stroke", "rgba(0, 0, 0, 0)");
    await meter.focus();
    await expect(meter.getByRole("tooltip", { name: "Context window usage" })).toContainText(
      "132,000 / 258,400 tokens",
    );
    const costBox = await cost.boundingBox();
    const meterBox = await meter.boundingBox();
    assert.ok(costBox && meterBox);
    expect(meterBox.x).toBeGreaterThan(costBox.x);
    expect(Math.abs((meterBox.y + meterBox.height / 2) - (costBox.y + costBox.height / 2))).toBeLessThan(1);
    await dialog.getByRole("button", { name: "Close conversation" }).click();
  }
});
