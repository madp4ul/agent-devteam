import { expect, test as base } from "@playwright/test";

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
      continuation: { available: true },
      messages: [],
      runs: [{
        activationId: "browser-activation",
        attempt: {
          id: "browser-attempt",
          status: "running",
          workspacePath: "C:/workspace",
          startedAt: "2026-08-09T12:00:00.000Z",
          completedAt: null,
          outcome: null,
          threadId: "thread-browser-123",
          model: null,
          reasoningEffort: null,
        },
        transcript: { available: true, items },
      }],
    },
  };
}
