import type { AgentConversationHistoryEntry } from "../../src/application/conversation-contract.ts";
import type { TaskActivityView } from "../../src/application/task-contract.ts";
import type { UserTaskDetailQueryResult } from "../../src/application/browser-transport-contract.ts";
import { contrastRatio, expect, runningConversationScenario, test } from "./browser-fixture.ts";

for (const theme of ["dark", "light"] as const) {
  test(`resume instructions survive disclosure, refresh and reload in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("coordination-theme", value), theme);
    const instructions = "Recheck the **retained changes**.\n\n" + Array.from({ length: 24 }, (_, index) =>
      `- Instruction ${index + 1}: preserve the interruption evidence.`).join("\n");
    const resumes: TaskActivityView[] = [{
      id: "resume-with-instructions", type: "automation.resumed", actor: { kind: "user", id: "paul" },
      occurredAt: "2026-08-09T12:02:00.000Z",
      details: { activationId: "browser-activation", interruptedAttemptId: "browser-attempt", continuationMessage: instructions },
    }, {
      id: "resume-without-instructions", type: "automation.resumed", actor: { kind: "user", id: "paul" },
      occurredAt: "2026-08-09T12:03:00.000Z",
      details: { activationId: "browser-activation", continuationMessage: "" },
    }];
    await page.route("**/api/tasks/T-0001", async (route) => {
      const response = await route.fetch();
      const detail: UserTaskDetailQueryResult = await response.json();
      if (!detail.available) throw new Error("Expected task detail");
      detail.task.activity.push(...resumes);
      await route.fulfill({ response, json: detail });
    });
    await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
      const result = runningConversationScenario([{ kind: "message", role: "agent", text: "Interrupted work" }]);
      result.conversation.history.push(...resumes.map((activity): AgentConversationHistoryEntry => ({
        kind: "resume", activationId: "browser-activation", activity,
      })), { kind: "item", activationId: "browser-activation", attemptId: "next-attempt",
        item: { kind: "message", role: "agent", text: "Work after resuming" } });
      await route.fulfill({ json: result });
    });
    await page.goto("/tasks/T-0001");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const timelineResume = page.locator("#timeline-source-resume-with-instructions");
    await expect(timelineResume).toContainText("Recheck the retained changes.");
    await expect(timelineResume).not.toContainText("Resume instructions from");
    expect(await contrastRatio(timelineResume)).toBeGreaterThanOrEqual(4.5);
    await expect(timelineResume.locator("strong").filter({ hasText: "retained changes" })).toHaveCount(1);
    const timelineDisclosure = timelineResume.getByRole("button", { name: /Show .* more lines/ });
    await expect(timelineDisclosure).toHaveAttribute("aria-expanded", "false");
    await timelineDisclosure.click();
    await expect(timelineResume.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#timeline-source-resume-without-instructions")).toContainText("Resumed without additional instructions.");
    await page.getByRole("button", { name: "View conversation" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Agent conversation" });
    const conversationResume = dialog.locator('[data-conversation-resume="resume-with-instructions"]');
    await expect(conversationResume).toContainText("Conversation resumed");
    await expect(conversationResume).toContainText("Recheck the retained changes.");
    await expect(conversationResume).not.toContainText("Resume instructions from");
    expect(await contrastRatio(conversationResume)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(conversationResume.getByRole("button", { name: /Show .* more lines/ }))).toBeGreaterThanOrEqual(4.5);
    await conversationResume.getByRole("button", { name: /Show .* more lines/ }).click();
    await expect(conversationResume).toContainText("Instruction 24");
    await expect(conversationResume.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
    const conversationPreviewId = await conversationResume.getByRole("button", { name: "Show less" }).getAttribute("aria-controls");
    expect(conversationPreviewId).not.toBe(await timelineResume.getByRole("button", { name: "Show less" }).getAttribute("aria-controls"));
    expect(await conversationResume.evaluate((element, id) => element.contains(document.getElementById(id!)), conversationPreviewId)).toBe(true);
    await expect(conversationResume.locator("strong").filter({ hasText: "retained changes" })).toHaveCount(1);
    expect(await conversationResume.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    resumes.push({ id: "historical-resume", type: "automation.resumed", actor: { kind: "user", id: "paul" },
      occurredAt: "2026-08-09T12:04:00.000Z", details: { activationId: "browser-activation" } });
    await expect(dialog.locator('[data-conversation-resume="historical-resume"]'))
      .toContainText("Instructions for this historical resume were not retained.", { timeout: 15_000 });
    await expect(conversationResume.getByRole("button", { name: "Show less" })).toBeVisible();
    await dialog.getByRole("button", { name: "Close conversation" }).click();
    await expect(page.locator("#timeline-source-historical-resume"))
      .toContainText("Instructions for this historical resume were not retained.");
    await page.reload();
    await expect(timelineResume).toContainText("Recheck the retained changes.");
    await page.getByRole("button", { name: "View conversation" }).first().click();
    await expect(dialog.locator("[data-conversation-resume]")).toHaveCount(3);
  });
}
