import type { Locator, Page } from "@playwright/test";

import type {
  AgentConversationHistoryEntry,
  AgentConversationMessageView,
} from "../../src/application/conversation-contract.ts";
import { expect, runningConversationScenario, test } from "./browser-fixture.ts";

function longConversation(): ReturnType<typeof runningConversationScenario> {
  return runningConversationScenario(Array.from({ length: 18 }, (_, index) => ({
    id: `conversation-following-${index}`,
    kind: "message",
    role: "agent",
    text: `Earlier conversation response ${index + 1}. `.repeat(8),
  })));
}

const followUpBody = "Keep this new follow-up visible.";

function followUpMessage(): AgentConversationMessageView {
  return {
    id: "bottom-follow-up-message",
    conversationId: "browser-conversation",
    body: followUpBody,
    actor: { kind: "user", id: "local-user" },
    occurredAt: "2026-08-26T08:00:00.000Z",
    attachments: [],
  };
}

function authoredFollowUp(
  status: "queued" | "running" = "queued",
): Extract<AgentConversationHistoryEntry, { kind: "message" }> {
  return {
    kind: "message",
    activationId: "bottom-follow-up-activation",
    status,
    attemptIds: status === "running" ? ["bottom-follow-up-attempt"] : [],
    message: followUpMessage(),
  };
}

async function installAcceptedFollowUp(page: Page, options: {
  submissionGate?: Promise<void>;
  authoritativeAfterReads?: number;
  appendDelayedAnswer?: boolean;
} = {}): Promise<() => number> {
  let submitted = false;
  let readsAfterSubmission = 0;
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    if (route.request().method() === "POST") {
      await options.submissionGate;
      submitted = true;
      await route.fulfill({
        status: 200,
        json: {
          accepted: true,
          activationId: "bottom-follow-up-activation",
          message: followUpMessage(),
        },
      });
      return;
    }
    const result = longConversation();
    if (submitted) readsAfterSubmission += 1;
    if (readsAfterSubmission >= (options.authoritativeAfterReads ?? 1)) {
      const history = result.conversation.history;
      history.push(authoredFollowUp(options.appendDelayedAnswer === true ? "running" : "queued"));
      if (options.appendDelayedAnswer === true) history.push({
        kind: "item",
        activationId: "bottom-follow-up-activation",
        attemptId: "bottom-follow-up-attempt",
        item: {
          id: "delayed-authoritative-answer",
          kind: "message",
          role: "agent",
          text: "This delayed authoritative response is now visible. ".repeat(12),
        },
      });
    }
    await route.fulfill({ status: 200, json: result });
  });
  return () => readsAfterSubmission;
}

async function bottomDistance(page: Page): Promise<number> {
  return page.getByRole("dialog", { name: "Agent conversation" }).locator(".transcript-content")
    .evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop);
}

async function startSubmissionFromDistance(page: Page, distance: number): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const viewport = dialog.locator(".transcript-content");
  await dialog.getByRole("textbox", { name: "Follow-up message" }).fill(followUpBody);
  await viewport.evaluate((element, requestedDistance) => {
    element.scrollTop = element.scrollHeight - element.clientHeight - requestedDistance;
  }, distance);
  await dialog.getByRole("button", { name: "Send follow-up" }).click({ force: true });
  return viewport;
}

async function submitFromDistance(page: Page, distance: number): Promise<Locator> {
  const viewport = await startSubmissionFromDistance(page, distance);
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(dialog.locator("[data-conversation-message='bottom-follow-up-message']")).toBeVisible();
  return viewport;
}

test("a bottom-anchored conversation keeps an accepted follow-up visible", async ({ page }) => {
  await installAcceptedFollowUp(page);
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const viewport = await submitFromDistance(page, 0);
  await expect.poll(() => viewport.evaluate((element) =>
    element.scrollHeight - element.clientHeight - element.scrollTop,
  )).toBeLessThanOrEqual(1);
});

test("a near-bottom conversation uses the follow tolerance", async ({ page }) => {
  await installAcceptedFollowUp(page);
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();

  await submitFromDistance(page, 24);

  await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(1);
});

test("a conversation follow-up preserves an earlier reading position", async ({ page }) => {
  await installAcceptedFollowUp(page);
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const viewport = page.getByRole("dialog", { name: "Agent conversation" }).locator(".transcript-content");
  const position = await viewport.evaluate((element) => {
    element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight - 400);
    return element.scrollTop;
  });

  await submitFromDistance(page, 400);

  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeCloseTo(position, 0);
  expect(await bottomDistance(page)).toBeGreaterThan(300);
});

test("a delayed authoritative append keeps a followed conversation at the bottom", async ({ page }) => {
  await installAcceptedFollowUp(page, {
    authoritativeAfterReads: 2,
    appendDelayedAnswer: true,
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  await submitFromDistance(page, 0);

  await expect(page.getByRole("dialog", { name: "Agent conversation" })).toContainText(
    "This delayed authoritative response is now visible.",
  );
  await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(1);
});

test("user scrolling after submission cancels bottom following before the response arrives", async ({ page }) => {
  let releaseSubmission!: () => void;
  const submissionReleased = new Promise<void>((resolve) => { releaseSubmission = resolve; });
  await installAcceptedFollowUp(page, { submissionGate: submissionReleased });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const viewport = dialog.locator(".transcript-content");
  await startSubmissionFromDistance(page, 0);
  await expect(dialog.getByRole("button", { name: "Sending…" })).toBeVisible();
  const userPosition = await viewport.evaluate((element) => {
    element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -300 }));
    element.scrollTop -= 300;
    return element.scrollTop;
  });
  releaseSubmission();

  await expect(dialog.locator("[data-conversation-message='bottom-follow-up-message']")).toBeVisible();
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeCloseTo(userPosition, 0);
  expect(await bottomDistance(page)).toBeGreaterThan(200);
});

test("layout growth keeps a followed conversation bottom-anchored", async ({ page }) => {
  await installAcceptedFollowUp(page);
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const viewport = await submitFromDistance(page, 0);
  await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(1);

  await viewport.locator("[data-conversation-message='bottom-follow-up-message']").evaluate((element) => {
    (element as HTMLElement).style.minHeight = "360px";
  });

  await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(1);
});

test("non-scroll interaction does not cancel bottom following", async ({ page }) => {
  await installAcceptedFollowUp(page);
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const viewport = await submitFromDistance(page, 0);
  const message = viewport.locator("[data-conversation-message='bottom-follow-up-message']");
  const messageBox = await message.boundingBox();
  expect(messageBox).not.toBeNull();
  await message.dispatchEvent("pointerdown", {
    clientX: messageBox!.x + messageBox!.width / 2,
    clientY: messageBox!.y + messageBox!.height / 2,
  });
  const composer = dialog.getByRole("textbox", { name: "Follow-up message" });
  await composer.focus();
  await composer.fill("Draft another request without submitting it.");
  await composer.press("Home");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  await message.evaluate((element) => {
    (element as HTMLElement).style.minHeight = "360px";
  });

  await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(1);
});

test("user scrolling wins over an already pending layout follow", async ({ page }) => {
  await installAcceptedFollowUp(page);
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const viewport = await submitFromDistance(page, 0);
  await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(1);

  const userPosition = await viewport.evaluate(async (element) => {
    const message = element.querySelector<HTMLElement>("[data-conversation-message='bottom-follow-up-message']");
    if (message === null) throw new Error("Expected the authored follow-up.");
    message.style.minHeight = "360px";
    await Promise.resolve();
    element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -300 }));
    element.scrollTop -= 300;
    return element.scrollTop;
  });

  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeCloseTo(userPosition, 0);
  expect(await bottomDistance(page)).toBeGreaterThan(200);
});

test("user scrolling wins when a polling refresh commits before scroll measurement", async ({ page }) => {
  const readsAfterSubmission = await installAcceptedFollowUp(page);
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const viewport = await submitFromDistance(page, 0);
  await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(1);
  const readsBeforeScroll = readsAfterSubmission();
  await page.evaluate(() => {
    const browserWindow = window as typeof window & {
      restoreHeldAnimationFrames?: () => void;
    };
    const originalRequest = window.requestAnimationFrame.bind(window);
    const originalCancel = window.cancelAnimationFrame.bind(window);
    let nextId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = (callback): number => {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id): void => {
      if (!callbacks.delete(id)) originalCancel(id);
    };
    browserWindow.restoreHeldAnimationFrames = () => {
      window.requestAnimationFrame = originalRequest;
      window.cancelAnimationFrame = originalCancel;
      const held = [...callbacks.values()];
      callbacks.clear();
      for (const callback of held) callback(performance.now());
      delete browserWindow.restoreHeldAnimationFrames;
    };
  });
  const userPosition = await viewport.evaluate((element) => {
    element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -300 }));
    element.scrollTop -= 300;
    return element.scrollTop;
  });

  await expect.poll(() => readsAfterSubmission()).toBeGreaterThan(readsBeforeScroll);
  expect(await viewport.evaluate((element) => element.scrollTop)).toBeCloseTo(userPosition, 0);
  await page.evaluate(() => {
    (window as typeof window & { restoreHeldAnimationFrames?: () => void }).restoreHeldAnimationFrames?.();
  });
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeCloseTo(userPosition, 0);
  expect(await bottomDistance(page)).toBeGreaterThan(200);
});
