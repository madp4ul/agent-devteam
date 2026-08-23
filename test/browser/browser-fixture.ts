import { expect, test as base, type Locator, type Page, type Route } from "@playwright/test";

import { startBrowserFixture } from "./fixture-server.ts";

export { expect };

type BrowserFixtures = {
  browserScenario: void;
  desktopNotificationConsent: "declined" | "unset";
  desktopNotificationSetup: void;
};

export const test = base.extend<BrowserFixtures>({
  desktopNotificationConsent: ["declined", { option: true }],
  browserScenario: [async ({}, use) => {
    const close = await startBrowserFixture();
    try {
      await use();
    } finally {
      await close();
    }
  }, { auto: true }],
  desktopNotificationSetup: [async ({ desktopNotificationConsent, page }, use) => {
    if (desktopNotificationConsent === "declined") {
      await page.addInitScript(() => localStorage.setItem(
        "coordination.desktop-notifications.consent",
        "declined",
      ));
    }
    await use();
  }, { auto: true }],
});

export function cleanWorkspaceGitScenario(): object {
  return {
    available: true,
    state: {
      head: { kind: "branch", name: "main", shortHash: "0123456" },
      history: { kind: "progress", commitsSinceTaskStart: 0 },
      changes: {
        additions: 0,
        deletions: 0,
        stagedFiles: 0,
        unstagedFiles: 0,
        untrackedFiles: 0,
      },
    },
  };
}

export function runningConversationScenario(items: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    available: true,
    conversation: {
      id: "browser-conversation",
      taskId: "T-0001",
      originatingActivationId: "browser-activation",
      originatingActivation: {
        id: "browser-activation",
        conversationId: "browser-conversation",
        targetAgentId: "implementer",
        status: "running",
        reason: { type: "column-entry", sourceEventId: "browser-move" },
        attempts: [],
        startupFailure: null,
        recovery: null,
        model: null,
        reasoningEffort: null,
        stale: false,
        dismissal: null,
      },
      owningAgent: {
        id: "implementer",
        name: "Implementation Agent",
        historicalName: "Implementation Agent",
        present: true,
      },
      currentThreadId: "thread-browser-123",
      createdAt: "2026-08-09T12:00:00.000Z",
      latestActivityAt: "2026-08-09T12:05:00.000Z",
      retirement: null,
      replacesConversationId: null,
      replacementReason: null,
      retirementAvailability: { available: false, reason: "activation-work-pending" },
      continuation: { available: true },
      history: [
        {
          kind: "activation",
          activationId: "browser-activation",
          status: "running",
          attemptIds: ["browser-attempt"],
          occurredAt: "2026-08-09T12:00:00.000Z",
          reason: { type: "column-entry", sourceEventId: "browser-move" },
          source: {
            kind: "activity",
            activity: {
              id: "browser-move",
              type: "task.moved",
              actor: { kind: "user", id: "paul" },
              occurredAt: "2026-08-09T12:00:00.000Z",
              details: { toColumnId: "implementation" },
            },
          },
        },
        ...items.map((item) => ({ kind: "item", activationId: "browser-activation", attemptId: "browser-attempt", item })),
      ],
    },
  };
}

export async function fulfillConversationTranscript(
  route: Route,
  items: Array<Record<string, unknown>>,
  options: { append?: boolean } = {},
): Promise<void> {
  const response = await route.fetch();
  const result = await response.json();
  const history = result.conversation.history as Array<Record<string, any>>;
  const additions = items.map((item) => ({
    kind: "item",
    activationId: "browser-activation",
    attemptId: "browser-attempt",
    item,
  }));
  result.conversation.history = options.append
    ? [...history, ...additions]
    : [...history.filter((entry) => entry.kind !== "item"), ...additions];
  await route.fulfill({ response, json: result });
}

export async function openAppearance(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: /Settings/ }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: "Appearance" }).click();
  return dialog.getByRole("combobox", { name: "Appearance" });
}

export async function setAppearance(page: Page, theme: "light" | "dark"): Promise<void> {
  await (await openAppearance(page)).selectOption(theme);
  await page.keyboard.press("Escape");
}

export async function selectRenderedText(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return selection?.toString() ?? "";
  });
}

export async function clearTextSelection(page: Page): Promise<void> {
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
}

export async function selectedText(page: Page): Promise<string> {
  return page.evaluate(() => window.getSelection()?.toString() ?? "");
}

export async function contrastRatio(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const parse = (color: string): [number, number, number] => {
      const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (channels?.length !== 3) throw new Error(`Unsupported computed color: ${color}`);
      return channels as [number, number, number];
    };
    const luminance = (color: string): number => {
      const channels = parse(color).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
    };
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor === "rgba(0, 0, 0, 0)"
      ? getComputedStyle(element.parentElement ?? document.documentElement).backgroundColor
      : style.backgroundColor);
    const lighter = Math.max(foreground, background);
    const darker = Math.min(foreground, background);
    return (lighter + 0.05) / (darker + 0.05);
  });
}
