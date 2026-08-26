import type { Page } from "@playwright/test";

import {
  contrastRatio,
  expect,
  runningConversationScenario,
  setAppearance,
  test,
} from "./browser-fixture.ts";
import { conversationUploadFixture } from "../support/conversation-feature-fixtures.ts";

async function installAttachmentFollowUpScenario(page: Page) {
  let submission: { body: string; attachmentIds: string[] } | undefined;
  const upload = conversationUploadFixture({
    id: "upload-screen",
    fileName: "screen.png",
    mediaType: "image/png",
    sizeBytes: 4,
  });
  await page.route("**/api/tasks/T-0001/conversations/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.endsWith("/uploads")) {
      await route.fulfill({ status: 201, json: { accepted: true, upload } });
      return;
    }
    if (request.method() === "DELETE") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (request.method() === "POST") {
      submission = request.postDataJSON() as { body: string; attachmentIds: string[] };
      await route.fulfill({
        status: 200,
        json: {
          accepted: true,
          activationId: "attachment-follow-up",
          message: {
            id: "attachment-message",
            conversationId: upload.conversationId,
            body: submission.body,
            actor: { kind: "user", id: "local-user" },
            occurredAt: "2026-08-09T12:06:00.000Z",
            attachments: [upload],
          },
        },
      });
      return;
    }
    const result = runningConversationScenario([]);
    if (submission !== undefined) {
      (result.conversation as Record<string, any>).history.push({
        kind: "message",
        activationId: "attachment-follow-up",
        status: "queued",
        attemptIds: [],
        message: {
          id: "attachment-message",
          conversationId: upload.conversationId,
          body: submission.body,
          actor: { kind: "user", id: "local-user" },
          occurredAt: "2026-08-09T12:06:00.000Z",
          attachments: [upload],
        },
      });
    }
    await route.fulfill({ status: 200, json: result });
  });
  return { readSubmission: () => submission };
}

async function openAttachmentComposer(page: Page) {
  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  return page.getByRole("dialog", { name: "Agent conversation" });
}

test("window drops suppress browser navigation and reject folders at the foreground composer", async ({ page }) => {
  await installAttachmentFollowUpScenario(page);
  await page.goto("/tasks/T-0001");
  expect(await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["safe"], "ignored.png", { type: "image/png" }));
    const event = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);

  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await expect(dialog.getByRole("button", { name: "Attach files" })).toBeVisible();
  await page.evaluate(() => {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { files: [], items: [{ webkitGetAsEntry: () => ({ isDirectory: true }) }] },
    });
    window.dispatchEvent(event);
  });
  await expect(dialog.getByRole("alert")).toContainText("Folders cannot be attached");
  await expect(dialog.getByRole("list", { name: "Files for this follow-up" })).toHaveCount(0);
});

test("a dropped file renders a private, accessible attachment selection", async ({ page }) => {
  await installAttachmentFollowUpScenario(page);
  const dialog = await openAttachmentComposer(page);
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["safe"], "screen.png", { type: "image/png" }));
    window.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  const chip = dialog.getByRole("list", { name: "Files for this follow-up" }).getByRole("listitem");
  await expect(chip).toContainText("screen.png");
  await expect(chip).not.toContainText(/fakepath|\\|\//);
  for (const button of [
    dialog.getByRole("button", { name: "Attach files" }),
    chip.getByRole("button", { name: "Remove screen.png" }),
  ]) {
    const centers = await button.evaluate((element) => {
      const buttonBox = element.getBoundingClientRect();
      const iconBox = element.querySelector("svg")!.getBoundingClientRect();
      return {
        x: Math.abs(buttonBox.x + buttonBox.width / 2 - (iconBox.x + iconBox.width / 2)),
        y: Math.abs(buttonBox.y + buttonBox.height / 2 - (iconBox.y + iconBox.height / 2)),
      };
    });
    expect(centers.x).toBeLessThanOrEqual(1);
    expect(centers.y).toBeLessThanOrEqual(1);
  }
});

test("an attachment-only follow-up submits the upload and renders its download", async ({ page }) => {
  const scenario = await installAttachmentFollowUpScenario(page);
  const dialog = await openAttachmentComposer(page);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "screen.png",
    mimeType: "image/png",
    buffer: Buffer.from("safe"),
  });
  await expect(dialog.getByText("Uploaded", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Send follow-up" }).click();
  expect(scenario.readSubmission()).toMatchObject({ body: "", attachmentIds: ["upload-screen"] });
  const download = dialog.getByRole("link", { name: "screen.png" });
  await expect(download).toHaveAttribute("download", "screen.png");
  await expect(download).toHaveAttribute("href", /\/attachments\/upload-screen$/);
});

test("an attachment upload reports progress and can be retried after transfer failure", async ({ page }) => {
  await page.addInitScript(() => {
    let attempt = 0;
    class ControlledUploadRequest extends EventTarget {
      readonly upload = new EventTarget();
      status = 0;
      responseText = "";

      open(): void {}
      setRequestHeader(): void {}
      send(): void {
        attempt += 1;
        const currentAttempt = attempt;
        window.setTimeout(() => {
          this.upload.dispatchEvent(new ProgressEvent("progress", {
            lengthComputable: true,
            loaded: 2,
            total: 4,
          }));
        }, 25);
        window.setTimeout(() => {
          this.status = currentAttempt === 1 ? 500 : 201;
          this.responseText = currentAttempt === 1
            ? JSON.stringify({ error: "temporary upload failure" })
            : JSON.stringify({
              accepted: true,
              upload: {
                id: "retried-upload",
                conversationId: "browser-conversation",
                fileName: "retry.txt",
                mediaType: "text/plain",
                sizeBytes: 4,
              },
            });
          this.dispatchEvent(new Event("load"));
        }, currentAttempt === 1 ? 500 : 150);
      }
      abort(): void {
        this.dispatchEvent(new Event("abort"));
      }
    }
    Object.defineProperty(window, "XMLHttpRequest", { value: ControlledUploadRequest });
  });
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    await route.fulfill({ status: 200, json: runningConversationScenario([]) });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "retry.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("retry evidence"),
  });
  const progress = dialog.getByRole("progressbar", { name: "Uploading retry.txt" });
  await expect(progress).toBeVisible();
  await expect.poll(async () => Number(await progress.getAttribute("value"))).toBe(0.5);
  await expect(dialog.getByRole("alert")).toContainText("Upload failed");
  const retry = dialog.getByRole("button", { name: "Retry retry.txt" });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(dialog.getByText("Uploaded", { exact: true })).toBeVisible();
  await expect(retry).toHaveCount(0);
});

test("leaving an open conversation discards its pending uploaded follow-up files", async ({ page }) => {
  const removedUploads: string[] = [];
  await page.route("**/api/tasks/T-0001/conversations/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.endsWith("/uploads")) {
      await route.fulfill({
        status: 201,
        json: {
          accepted: true,
          upload: {
            id: "pending-before-navigation",
            conversationId: "browser-conversation",
            fileName: "draft.txt",
            mediaType: "text/plain",
            sizeBytes: 5,
          },
        },
      });
      return;
    }
    if (request.method() === "DELETE") {
      removedUploads.push(url.pathname);
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({ status: 200, json: runningConversationScenario([]) });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "draft.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("draft"),
  });
  await expect(dialog.getByText("Uploaded", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(dialog).toHaveCount(0);

  await expect.poll(() => removedUploads).toEqual([
    "/api/tasks/T-0001/conversations/browser-conversation/uploads/pending-before-navigation",
  ]);
});

test("a conversation follow-up retains its draft on failure and refreshes in place after retry", async ({ page }) => {
  let submitted = false;
  let followUpReads = 0;
  const submissions: Array<{ body: string; idempotencyKey: string }> = [];
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    if (route.request().method() === "POST") {
      submissions.push(route.request().postDataJSON() as { body: string; idempotencyKey: string });
      if (submissions.length === 1) {
        await route.fulfill({ status: 500, json: { error: "temporary failure" } });
        return;
      }
      submitted = true;
      await route.fulfill({
        status: 200,
        json: {
          accepted: true,
          activationId: "browser-follow-up-activation",
          message: {
            id: "browser-follow-up-message",
            conversationId: "browser-conversation",
            body: submissions.at(-1)?.body,
            actor: { kind: "user", id: "local-user" },
            occurredAt: "2026-08-09T12:06:00.000Z",
          },
        },
      });
      return;
    }
    const result = runningConversationScenario([]);
    if (submitted) {
      followUpReads += 1;
      const message = {
        id: "browser-follow-up-message",
        conversationId: "browser-conversation",
        body: "Please check this edge case.\nIt affects retries.",
        actor: { kind: "user", id: "local-user" },
        occurredAt: "2026-08-09T12:06:00.000Z",
      };
      (result.conversation as Record<string, any>).history.push({
        kind: "message",
        activationId: "browser-follow-up-activation",
        status: followUpReads > 1 ? "completed" : "queued",
        attemptIds: followUpReads > 1 ? ["browser-follow-up-attempt"] : [],
        message,
      });
      if (followUpReads > 1) {
        (result.conversation as { originatingActivation: { status: string } }).originatingActivation.status = "completed";
        const history = (result.conversation as Record<string, any>).history;
        history.find((entry: any) => entry.kind === "activation").status = "completed";
        history.push({
          kind: "item",
          activationId: "browser-follow-up-activation",
          attemptId: "browser-follow-up-attempt",
          item: { id: "browser-follow-up-answer", kind: "message", role: "agent", text: "The edge case is covered." },
        });
      }
    }
    await route.fulfill({ status: 200, json: result });
  });

  await page.goto("/tasks/T-0001");
  await page.getByRole("button", { name: "View conversation" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent conversation" });
  const composer = dialog.getByRole("textbox", { name: "Follow-up message" });
  await composer.fill("Please check this edge case.\nIt affects retries.");
  await dialog.getByRole("button", { name: "Send follow-up" }).click();
  await expect(dialog.getByRole("alert")).toContainText("500");
  await expect(composer).toHaveValue("Please check this edge case.\nIt affects retries.");
  await dialog.getByRole("button", { name: "Send follow-up" }).click();
  await expect(composer).toHaveValue("");
  await expect(dialog).toContainText("Please check this edge case.");
  const queuedTurn = dialog.getByRole("status", { name: "Follow-up queued" });
  await expect(queuedTurn).toContainText("Waiting for Implementation Agent to finish the current activation.");
  const queuedMessage = dialog.locator("[data-conversation-message='browser-follow-up-message']");
  await expect(queuedMessage).toHaveCSS("border-right-width", "1px");
  const [messageBox, queuedBox] = await Promise.all([queuedMessage.boundingBox(), queuedTurn.boundingBox()]);
  expect(messageBox).not.toBeNull();
  expect(queuedBox).not.toBeNull();
  expect(queuedBox!.y).toBeGreaterThanOrEqual(messageBox!.y + messageBox!.height);
  await expect(dialog).toContainText("The edge case is covered.");
  await expect(queuedTurn).toHaveCount(0);
  await expect(dialog.locator(".conversation-run")).toHaveCount(0);
  expect(submissions).toHaveLength(2);
  expect(submissions[1]?.idempotencyKey).toBe(submissions[0]?.idempotencyKey);
});

test("conversation follow-up composer remains readable and operable in both appearances", async ({ page }) => {
  await page.route("**/api/tasks/T-0001/conversations/*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const result = await response.json();
    const message = {
      id: "appearance-queued-message",
      conversationId: result.conversation.id,
      body: "Please verify this queued turn.",
      actor: { kind: "user", id: "local-user" },
      occurredAt: "2026-08-15T12:00:00.000Z",
    };
    result.conversation.history.push({
      kind: "message",
      activationId: "appearance-queued-activation",
      status: "queued",
      attemptIds: [],
      message,
    });
    await route.fulfill({ response, json: result });
  });
  for (const theme of ["dark", "light"] as const) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/tasks/T-0001");
    await setAppearance(page, theme);
    await page.getByRole("button", { name: "View conversation" }).click();
    const dialog = page.getByRole("dialog", { name: "Agent conversation" });
    const composer = dialog.getByRole("textbox", { name: "Follow-up message" });
    await composer.fill("Check the appearance boundary.");
    const send = dialog.getByRole("button", { name: "Send follow-up" });
    const userMessage = dialog.locator(".user-message");
    const queuedTurn = dialog.getByRole("status", { name: "Follow-up queued" });
    const fileName = `appearance-${theme}.txt`;
    await dialog.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from("appearance evidence"),
    });
    const uploadChip = dialog.getByRole("list", { name: "Files for this follow-up" }).getByRole("listitem");
    await expect(uploadChip).toContainText(fileName);

    expect(await contrastRatio(composer)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(send)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(userMessage)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(queuedTurn)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(uploadChip.locator(".conversation-upload-name"))).toBeGreaterThanOrEqual(4.5);
    await expect(uploadChip).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(userMessage).toHaveCSS("border-right-width", "1px");
    await expect(dialog.locator(".conversation-run")).toHaveCount(0);
    await expect(dialog.locator(".conversation-composer")).toHaveCSS("position", "sticky");
    const [composerBox, sendBox] = await Promise.all([composer.boundingBox(), send.boundingBox()]);
    expect(composerBox).not.toBeNull();
    expect(sendBox).not.toBeNull();
    expect(sendBox!.x + sendBox!.width).toBeLessThanOrEqual(composerBox!.x + composerBox!.width);
    expect(sendBox!.y + sendBox!.height).toBeLessThanOrEqual(composerBox!.y + composerBox!.height);
    const transcriptPadding = await dialog.locator(".transcript-content").evaluate((element) =>
      parseFloat(getComputedStyle(element).paddingRight)
    );
    expect(transcriptPadding).toBeGreaterThanOrEqual(8);
    const scrollbarClearance = await dialog.locator(".transcript-content").evaluate((element) => {
      const content = element.getBoundingClientRect();
      const rightmost = Math.max(...[...element.querySelectorAll<HTMLElement>(".conversation-stream > *, .conversation-composer")]
        .map((child) => child.getBoundingClientRect().right));
      return content.left + element.clientWidth - rightmost;
    });
    expect(scrollbarClearance).toBeGreaterThanOrEqual(8);
    await page.setViewportSize({ width: 420, height: 760 });
    const narrowComposer = await dialog.locator(".conversation-composer").boundingBox();
    const narrowDialog = await dialog.boundingBox();
    expect(narrowComposer).not.toBeNull();
    expect(narrowDialog).not.toBeNull();
    expect(narrowComposer!.x).toBeGreaterThanOrEqual(narrowDialog!.x);
    expect(narrowComposer!.x + narrowComposer!.width).toBeLessThanOrEqual(
      narrowDialog!.x + narrowDialog!.width,
    );
    await composer.focus();
    await expect(composer).toBeFocused();
    await expect(composer).toHaveCSS("outline-style", "solid");
    await expect(composer).toHaveCSS("outline-offset", "-3px");
    await uploadChip.getByRole("button", { name: `Remove ${fileName}` }).click();
    await dialog.getByRole("button", { name: "Close conversation" }).click();
  }
});
