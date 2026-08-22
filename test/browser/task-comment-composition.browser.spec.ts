import { expect, test } from "./browser-fixture.ts";

test("the comment composer does not cover the hit area of the first timeline relationship link", async ({ page }) => {
  const parentTitle = "Parent task with a timeline link that wraps across more than one visual line";
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.timelineRelationshipTasks.push({
      id: "T-9005",
      title: parentTitle,
      available: true,
      completed: false,
      archived: false,
    });
    detail.task.activity.push({
      id: "composer-overlap-parent",
      type: "relationship.created",
      actor: { kind: "user", id: "paul" },
      occurredAt: "2027-08-22T10:00:00.000Z",
      details: {
        relationshipType: "parent-child",
        relationshipRole: "target",
        relatedTaskId: "T-9005",
      },
    });
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const link = page.locator("#timeline-source-composer-overlap-parent").getByRole("link", { name: parentTitle });
  await link.scrollIntoViewIfNeeded();
  const hitResults = await link.evaluate((element) => [...element.getClientRects()].flatMap((rect) =>
    [0.2, 0.8].map((verticalPosition) =>
      document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height * verticalPosition)?.closest("a") === element,
    ),
  ));
  expect(hitResults.length).toBeGreaterThanOrEqual(2);
  expect(hitResults.every(Boolean)).toBe(true);
});

test("an open task reconciles external timeline changes without disturbing a focused draft", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    reads += 1;
    if (reads === 2) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    if (reads >= 3) {
      detail.task.comments.push({
        id: "external-live-comment",
        body: "An agent added this while the task page remained open. @implementer",
        actor: { kind: "agent", id: "implementer" },
        occurredAt: "2026-08-09T12:00:00.000Z",
      });
      detail.task.activity.push({
        id: "external-live-activation-event",
        type: "activation.created",
        actor: { kind: "framework", id: "coordination" },
        occurredAt: "2026-08-09T12:00:00.001Z",
        details: {
          activationId: "external-live-activation",
          targetAgentId: "implementer",
        },
      });
      detail.task.activations.push({
        id: "external-live-activation",
        targetAgentId: "implementer",
        status: "queued",
        reason: { type: "agent-mention", sourceEventId: "external-live-comment" },
        attempts: [],
        startupFailure: null,
        recovery: null,
        model: null,
        reasoningEffort: null,
        stale: false,
      });
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const draft = page.getByRole("textbox", { name: "Comment" });
  await draft.fill("Keep this unfinished user draft.");
  await draft.focus();
  const liveComment = page.locator(".comment-entry").filter({ hasText: "An agent added this while the task page remained open." });
  await expect(liveComment).toBeVisible();
  await expect(liveComment.locator(".canonical-mention")).toHaveText("@implementer");
  await expect(liveComment).toContainText("Requested Implementation Agent");
  await page.waitForTimeout(750);
  await expect(liveComment).toBeVisible();
  await expect(liveComment).toContainText("Requested Implementation Agent");
  await expect(draft).toHaveValue("Keep this unfinished user draft.");
  await expect(draft).toBeFocused();
});


test("comment participants are discoverable and insert canonical mentions without submitting", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  const comment = page.getByRole("region", { name: "Add comment" });
  const draft = comment.getByRole("textbox", { name: "Comment" });

  await draft.fill("Please ask @imp");
  const suggestions = comment.getByRole("listbox", { name: "Mention participants" });
  await expect(suggestions).toBeVisible();
  const implementer = suggestions.getByRole("option", { name: /Implementation Agent.*Builds verified changes/ });
  await expect(implementer).toHaveAttribute("aria-selected", "true");
  await expect(draft).toHaveAttribute("aria-activedescendant", "mention-participant-implementer");
  await implementer.click();
  await expect(draft).toHaveValue("Please ask @implementer ");
  await expect(suggestions).toHaveCount(0);

  await draft.pressSequentially("and notify @");
  await draft.press("ArrowDown");
  await expect(suggestions.getByRole("option", { name: /User.*person overseeing the process/i }))
    .toHaveAttribute("aria-selected", "true");
  await draft.press("Enter");
  await expect(draft).toHaveValue("Please ask @implementer and notify @user ");
  await expect(page.locator(".comment-entry").filter({
    hasText: "Please ask @implementer and notify @user",
  })).toHaveCount(0);

  await comment.getByRole("button", { name: "Post" }).click();
  const submitted = page.locator(".comment-entry").filter({ hasText: "Please ask" });
  await expect(submitted.locator(".canonical-mention")).toHaveCount(2);
  await expect(submitted.locator(".canonical-mention").first()).toHaveAttribute("title", "Implementation Agent");
  await expect(submitted).toContainText("Requested Implementation Agent, user attention");
  const agentMention = submitted.locator(".canonical-mention.agent-mention");
  const userMention = submitted.locator(".canonical-mention.user-mention");
  const agentConsequence = submitted.locator(".comment-consequence .agent-mention");
  const userConsequence = submitted.locator(".comment-consequence .user-mention");
  await expect(agentMention).toHaveCount(1);
  await expect(userMention).toHaveCount(1);
  await expect(agentConsequence).toHaveText("Implementation Agent");
  await expect(userConsequence).toHaveText("user attention");
  const [agentMentionColor, userMentionColor, agentConsequenceColor, userConsequenceColor] = await Promise.all([
    agentMention.evaluate((element) => getComputedStyle(element).backgroundColor),
    userMention.evaluate((element) => getComputedStyle(element).backgroundColor),
    agentConsequence.evaluate((element) => getComputedStyle(element).backgroundColor),
    userConsequence.evaluate((element) => getComputedStyle(element).backgroundColor),
  ]);
  expect(agentMentionColor).not.toBe(userMentionColor);
  expect(agentConsequenceColor).toBe(agentMentionColor);
  expect(userConsequenceColor).toBe(userMentionColor);
});


test("comment composer stays beside a long timeline without covering its final entry", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.description = Array.from(
      { length: 28 },
      (_, index) => `Description paragraph ${index + 1} keeps the composer below the initial viewport.`,
    ).join("\n\n");
    for (let index = 0; index < 18; index += 1) {
      detail.task.comments.push({
        id: `sticky-comment-${index}`,
        body: index === 17
          ? "Final timeline reply source asks @user for a decision."
          : `Timeline reply source ${index + 1} remains readable while composing.`,
        actor: { kind: "agent", id: "implementer" },
        occurredAt: `2026-08-16T12:${String(index).padStart(2, "0")}:00.000Z`,
      });
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const composer = page.getByRole("region", { name: "Add comment" });
  const draft = composer.getByRole("textbox", { name: "Comment" });
  const initialComposerBounds = await composer.boundingBox();
  const initialTimelineBounds = await page.getByRole("region", { name: "Task timeline" }).boundingBox();
  const initialTimelineHeadingBounds = await page.getByRole("heading", { name: "Task timeline" }).boundingBox();
  const activityBounds = await page.locator('[data-task-section="activity"]').boundingBox();
  expect(initialComposerBounds).not.toBeNull();
  expect(initialTimelineBounds).not.toBeNull();
  expect(initialTimelineHeadingBounds).not.toBeNull();
  expect(activityBounds).not.toBeNull();
  expect(initialComposerBounds!.y).toBeGreaterThan(800);
  await expect(composer).toHaveCSS("position", "relative");
  expect(initialTimelineBounds!.y - (activityBounds!.y + activityBounds!.height)).toBeGreaterThanOrEqual(8);
  expect(initialTimelineBounds!.y - (activityBounds!.y + activityBounds!.height)).toBeLessThanOrEqual(24);
  expect(Math.abs(initialComposerBounds!.y - initialTimelineBounds!.y)).toBeLessThanOrEqual(1);
  expect(initialTimelineHeadingBounds!.y - initialTimelineBounds!.y).toBeLessThanOrEqual(40);
  const [initialPostBounds, initialDraftBounds] = await Promise.all([
    composer.getByRole("button", { name: "Post" }).boundingBox(),
    draft.boundingBox(),
  ]);
  expect(initialPostBounds).not.toBeNull();
  expect(initialDraftBounds).not.toBeNull();
  expect(initialPostBounds!.width).toBeLessThan(initialComposerBounds!.width / 2);
  expect(initialDraftBounds!.x + initialDraftBounds!.width - initialPostBounds!.x - initialPostBounds!.width)
    .toBeLessThanOrEqual(24);

  await composer.evaluate((element) => element.scrollIntoView({ block: "end" }));
  await page.evaluate(() => window.scrollBy(0, 900));
  const stickyComposerBounds = await composer.boundingBox();
  expect(stickyComposerBounds).not.toBeNull();
  expect(stickyComposerBounds!.y + stickyComposerBounds!.height).toBeLessThanOrEqual(800);
  expect(stickyComposerBounds!.y + stickyComposerBounds!.height).toBeGreaterThanOrEqual(790);
  await expect(composer).toHaveCSS("position", "fixed");

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const finalEntry = page.locator("#timeline-source-sticky-comment-17");
  const [finalEntryBounds, finalComposerBounds] = await Promise.all([
    finalEntry.boundingBox(),
    composer.boundingBox(),
  ]);
  expect(finalEntryBounds).not.toBeNull();
  expect(finalComposerBounds).not.toBeNull();
  expect(finalEntryBounds!.y + finalEntryBounds!.height).toBeLessThanOrEqual(finalComposerBounds!.y - 8);
  const bottomTimelineBounds = await page.getByRole("region", { name: "Task timeline" }).boundingBox();
  expect(bottomTimelineBounds).not.toBeNull();
  expect(finalComposerBounds!.y - (bottomTimelineBounds!.y + bottomTimelineBounds!.height)).toBeGreaterThanOrEqual(12);
  const finalReplyBounds = await finalEntry.getByRole("button", { name: "Reply to Implementation Agent" }).boundingBox();
  expect(finalReplyBounds).not.toBeNull();
  expect(finalReplyBounds!.y + finalReplyBounds!.height).toBeLessThanOrEqual(finalComposerBounds!.y - 8);

  await draft.fill(Array.from({ length: 6 }, (_, index) => `Intermediate draft line ${index + 1}`).join("\n"));
  await page.locator('[data-task-section="timeline"]').evaluate((element) => {
    window.scrollTo(0, element.getBoundingClientRect().bottom + window.scrollY - window.innerHeight);
  });
  const [intermediateEntryBounds, intermediateComposerBounds] = await Promise.all([
    finalEntry.boundingBox(),
    composer.boundingBox(),
  ]);
  expect(intermediateEntryBounds).not.toBeNull();
  expect(intermediateComposerBounds).not.toBeNull();
  expect(intermediateEntryBounds!.y + intermediateEntryBounds!.height)
    .toBeLessThanOrEqual(intermediateComposerBounds!.y - 8);
  await draft.fill("");

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(composer).toHaveCSS("position", "relative");
  const restoredComposerBounds = await composer.boundingBox();
  expect(restoredComposerBounds).not.toBeNull();
  expect(restoredComposerBounds!.y).toBeGreaterThan(800);

  await page.setViewportSize({ width: 420, height: 700 });
  await page.locator(".comment-timeline-flow").evaluate((element) => {
    (element as HTMLElement).style.setProperty("--comment-safe-area-inset-bottom", "24px");
    window.dispatchEvent(new Event("resize"));
  });
  await expect.poll(() => composer.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).paddingBottom)
  )).toBeGreaterThanOrEqual(44);
  await expect.poll(async () => {
    const [declaredHeight, measuredHeight] = await Promise.all([
      page.locator(".comment-timeline-flow").evaluate((element) =>
        Number.parseFloat((element as HTMLElement).style.getPropertyValue("--comment-composer-height"))
      ),
      composer.evaluate((element) => element.getBoundingClientRect().height),
    ]);
    return Math.abs(declaredHeight - measuredHeight);
  }).toBeLessThanOrEqual(1);
  await composer.evaluate((element) => element.scrollIntoView({ block: "end" }));
  await page.evaluate(() => window.scrollBy(0, 600));
  await expect(composer).toHaveCSS("position", "fixed");
  const narrowStickyBounds = await composer.boundingBox();
  expect(narrowStickyBounds).not.toBeNull();
  expect(narrowStickyBounds!.x).toBeGreaterThanOrEqual(0);
  expect(narrowStickyBounds!.x + narrowStickyBounds!.width).toBeLessThanOrEqual(420);
  expect(narrowStickyBounds!.y + narrowStickyBounds!.height).toBeGreaterThanOrEqual(690);
  expect(narrowStickyBounds!.y + narrowStickyBounds!.height).toBeLessThanOrEqual(700);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(420);

  const composerBeforeSuggestions = await composer.boundingBox();
  await draft.fill("Ask @");
  const suggestions = composer.getByRole("listbox", { name: "Mention participants" });
  const [suggestionBounds, expandedComposerBounds, postBounds] = await Promise.all([
    suggestions.boundingBox(),
    composer.boundingBox(),
    composer.getByRole("button", { name: "Post" }).boundingBox(),
  ]);
  expect(suggestionBounds).not.toBeNull();
  expect(expandedComposerBounds).not.toBeNull();
  expect(postBounds).not.toBeNull();
  expect(composerBeforeSuggestions).not.toBeNull();
  expect(Math.abs(expandedComposerBounds!.y - composerBeforeSuggestions!.y)).toBeLessThanOrEqual(1);
  expect(suggestionBounds!.y).toBeGreaterThanOrEqual(0);
  expect(suggestionBounds!.y + suggestionBounds!.height).toBeLessThanOrEqual(expandedComposerBounds!.y - 8);
  expect(postBounds!.y + postBounds!.height).toBeLessThanOrEqual(700);
  await draft.press("Escape");

  await draft.fill(Array.from({ length: 30 }, (_, index) => `Capped draft line ${index + 1}`).join("\n"));

  await page.locator('[data-task-section="timeline"]').evaluate((element) => {
    window.scrollTo(0, element.getBoundingClientRect().bottom + window.scrollY - window.innerHeight);
  });
  const [narrowFinalEntryBounds, narrowFinalComposerBounds] = await Promise.all([
    finalEntry.boundingBox(),
    composer.boundingBox(),
  ]);
  expect(narrowFinalEntryBounds).not.toBeNull();
  expect(narrowFinalComposerBounds).not.toBeNull();
  expect(narrowFinalEntryBounds!.y + narrowFinalEntryBounds!.height)
    .toBeLessThanOrEqual(narrowFinalComposerBounds!.y - 8);
  const narrowFinalReplyBounds = await finalEntry
    .getByRole("button", { name: "Reply to Implementation Agent" }).boundingBox();
  expect(narrowFinalReplyBounds).not.toBeNull();
  expect(narrowFinalReplyBounds!.y + narrowFinalReplyBounds!.height)
    .toBeLessThanOrEqual(narrowFinalComposerBounds!.y - 8);
});


test("comment textarea grows with its draft, stops before crowding out context, and shrinks again", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/tasks/T-0001");
  const composer = page.getByRole("region", { name: "Add comment" });
  const draft = page.getByRole("textbox", { name: "Comment" });
  const initialBounds = await draft.boundingBox();
  expect(initialBounds).not.toBeNull();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(composer).toHaveCSS("position", "fixed");
  const [bottomComposerBounds, bottomDraftBounds] = await Promise.all([
    composer.boundingBox(),
    draft.boundingBox(),
  ]);
  expect(bottomComposerBounds).not.toBeNull();
  expect(bottomDraftBounds).not.toBeNull();
  expect.soft(bottomComposerBounds!.y + bottomComposerBounds!.height).toBeGreaterThanOrEqual(790);

  const postBounds = await composer.getByRole("button", { name: "Post" }).boundingBox();
  expect(postBounds).not.toBeNull();
  expect.soft(postBounds!.y).toBeGreaterThanOrEqual(bottomDraftBounds!.y);
  expect.soft(postBounds!.y + postBounds!.height).toBeLessThanOrEqual(bottomDraftBounds!.y + bottomDraftBounds!.height);

  await page.evaluate(() => {
    const samples: Array<{ declared: number; measured: number }> = [];
    (window as unknown as { commentComposerHeightSamples: typeof samples }).commentComposerHeightSamples = samples;
    window.addEventListener("input", (event) => {
      if (!(event.target instanceof HTMLTextAreaElement) || event.target.getAttribute("aria-label") !== "Comment") return;
      const panel = event.target.closest<HTMLElement>(".comment-panel");
      const flow = event.target.closest<HTMLElement>(".comment-timeline-flow");
      if (panel === null || flow === null) return;
      samples.push({
        declared: Number.parseFloat(flow.style.getPropertyValue("--comment-composer-height")),
        measured: panel.getBoundingClientRect().height,
      });
    });
  });
  await draft.fill("");
  await draft.pressSequentially("One\nTwo\nThree\nFour\nFive\nSix");
  const synchronousHeightSamples = await page.evaluate(() =>
    (window as unknown as {
      commentComposerHeightSamples: Array<{ declared: number; measured: number }>;
    }).commentComposerHeightSamples
  );
  expect(synchronousHeightSamples.length).toBeGreaterThan(0);
  expect.soft(Math.max(...synchronousHeightSamples.map(({ declared, measured }) => Math.abs(declared - measured))))
    .toBeLessThanOrEqual(1);

  await draft.fill(Array.from({ length: 6 }, (_, index) => `Draft line ${index + 1}`).join("\n"));
  const expandedBounds = await draft.boundingBox();
  expect(expandedBounds).not.toBeNull();
  expect(expandedBounds!.height).toBeGreaterThan(initialBounds!.height);

  await draft.fill(Array.from({ length: 30 }, (_, index) => `Long draft line ${index + 1}`).join("\n"));
  const cappedBounds = await draft.boundingBox();
  expect(cappedBounds).not.toBeNull();
  expect(cappedBounds!.height).toBeLessThanOrEqual(800 * .34 + 1);
  expect(await draft.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(draft).toHaveCSS("overflow-y", "auto");
  await expect(draft).toHaveCSS("resize", "none");

  await draft.focus();
  await draft.press("ControlOrMeta+A");
  await draft.press("Backspace");
  await draft.pressSequentially("Short again.");
  const restoredBounds = await draft.boundingBox();
  expect(restoredBounds).not.toBeNull();
  expect(Math.abs(restoredBounds!.height - initialBounds!.height)).toBeLessThanOrEqual(1);
  await expect(draft).toHaveCSS("overflow-y", "hidden");
});


test("comment failure and retry preserve timeline context while success clears and shrinks the draft", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  let postingAttempts = 0;
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.description = "Long submission context. ".repeat(500);
    for (let index = 0; index < 14; index += 1) {
      detail.task.comments.push({
        id: `submission-context-${index}`,
        body: `Submission context ${index + 1} stays visible through retry.`,
        actor: { kind: "agent", id: "implementer" },
        occurredAt: `2026-08-18T12:${String(index).padStart(2, "0")}:00.000Z`,
      });
    }
    await route.fulfill({ response, json: detail });
  });
  await page.route("**/api/tasks/T-0001/comments", async (route) => {
    postingAttempts += 1;
    if (postingAttempts === 1) {
      await route.fulfill({ status: 500, json: { message: "Temporary comment failure." } });
    } else {
      await route.continue();
    }
  });

  await page.goto("/tasks/T-0001");
  const draft = page.getByRole("textbox", { name: "Comment" });
  const post = page.getByRole("button", { name: "Post" });
  const body = Array.from({ length: 6 }, (_, index) => `Decision line ${index + 1}`).join("\n");
  await draft.fill(body);
  const expandedBounds = await draft.boundingBox();
  expect(expandedBounds).not.toBeNull();
  await page.locator("#timeline-source-submission-context-10")
    .evaluate((element) => element.scrollIntoView({ block: "center" }));
  const source = page.locator("#timeline-source-submission-context-10");
  await draft.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(9, 16));

  const sourceBeforeFailure = await source.boundingBox();
  await post.click();
  await expect(page.getByRole("alert")).toContainText("Request failed with status 500");
  await expect(draft).toHaveValue(body);
  await expect(draft).toBeFocused();
  expect(await draft.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    return [textarea.selectionStart, textarea.selectionEnd];
  })).toEqual([9, 16]);
  expect(Math.abs((await source.boundingBox())!.y - sourceBeforeFailure!.y)).toBeLessThanOrEqual(1);
  expect((await draft.boundingBox())!.height).toBe(expandedBounds!.height);

  const sourceBeforeSuccess = await source.boundingBox();
  await post.click();
  await expect(draft).toHaveValue("");
  await expect(draft).toBeFocused();
  expect(Math.abs((await source.boundingBox())!.y - sourceBeforeSuccess!.y)).toBeLessThanOrEqual(1);
  expect((await draft.boundingBox())!.height).toBeLessThan(expandedBounds!.height);
});


test("mention discovery supports dismissal and ignores email-like and inline-code text", async ({ page }) => {
  await page.goto("/tasks/T-0001");
  const comment = page.getByRole("region", { name: "Add comment" });
  const draft = comment.getByRole("textbox", { name: "Comment" });
  const suggestions = comment.getByRole("listbox", { name: "Mention participants" });

  await draft.fill("paul@imp");
  await expect(suggestions).toHaveCount(0);
  await draft.fill("Use `@imp` as an example");
  await expect(suggestions).toHaveCount(0);
  await draft.fill("Use ``@imp`` as an example");
  await expect(suggestions).toHaveCount(0);
  await draft.fill("Ask @imp");
  await expect(suggestions).toBeVisible();
  await draft.press("Escape");
  await expect(suggestions).toHaveCount(0);
  await expect(draft).toHaveValue("Ask @imp");
});


test("reply to an agent mention preserves the draft, avoids duplicates, and focuses the composer", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.comments.push({
      id: "agent-requested-user",
      body: "I need a decision from @user before continuing.",
      actor: { kind: "agent", id: "implementer" },
      occurredAt: "2026-08-09T12:30:00.000Z",
    });
    detail.task.comments.push({
      id: "removed-agent-requested-user",
      body: "A removed participant wrote @user and @removed.",
      actor: { kind: "agent", id: "removed" },
      occurredAt: "2026-08-09T12:31:00.000Z",
    });
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const draft = page.getByRole("textbox", { name: "Comment" });
  await draft.fill("Here is the decision.");
  const request = page.locator(".comment-entry").filter({ hasText: "I need a decision" });
  const reply = request.getByRole("button", { name: "Reply to Implementation Agent" });
  const consequence = request.locator(".comment-consequence");
  const [consequenceBox, replyBox] = await Promise.all([consequence.boundingBox(), reply.boundingBox()]);
  expect(consequenceBox).not.toBeNull();
  expect(replyBox).not.toBeNull();
  expect(Math.abs((consequenceBox!.y + consequenceBox!.height / 2) - (replyBox!.y + replyBox!.height / 2)))
    .toBeLessThanOrEqual(2);
  expect(replyBox!.x).toBeGreaterThan(consequenceBox!.x + consequenceBox!.width);
  await reply.click();
  await expect(draft).toHaveValue("Here is the decision. @implementer ");
  await expect(draft).toBeFocused();
  await reply.click();
  await expect(draft).toHaveValue("Here is the decision. @implementer ");
  const removed = page.locator(".comment-entry").filter({ hasText: "A removed participant" });
  await expect(removed.locator(".canonical-mention")).toHaveCount(1);
  await expect(removed.getByRole("button", { name: /Reply to/ })).toHaveCount(0);
});


test("replying to several timeline comments preserves the viewport and draft selection", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.description = "Long reply context. ".repeat(500);
    for (let index = 0; index < 14; index += 1) {
      detail.task.comments.push({
        id: `multi-reply-comment-${index}`,
        body: index >= 12
          ? `Reply source ${index + 1} asks @user for a decision.`
          : `Timeline context ${index + 1}.`,
        actor: { kind: "agent", id: "implementer" },
        occurredAt: `2026-08-17T12:${String(index).padStart(2, "0")}:00.000Z`,
      });
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const draft = page.getByRole("textbox", { name: "Comment" });
  await draft.fill("Keep this selected phrase in the longer response.");
  await draft.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(10, 18));

  for (const index of [12, 13]) {
    const source = page.locator(`#timeline-source-multi-reply-comment-${index}`);
    await source.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const scrollBeforeReply = await page.evaluate(() => window.scrollY);
    await source.getByRole("button", { name: "Reply to Implementation Agent" }).click();
    await expect(draft).toBeFocused();
    expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollBeforeReply)).toBeLessThanOrEqual(1);
    expect(await draft.evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      return [textarea.selectionStart, textarea.selectionEnd];
    })).toEqual([10, 18]);
  }

  await expect(draft).toHaveValue("Keep this selected phrase in the longer response. @implementer ");
});


test("reply preserves trailing draft whitespace and is absent without an active composer", async ({ page }) => {
  let archived = false;
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.comments.push({
      id: "whitespace-request",
      body: "Please answer @user.",
      actor: { kind: "agent", id: "implementer" },
      occurredAt: "2026-08-09T12:32:00.000Z",
    });
    if (archived) detail.task.archived = true;
    await route.fulfill({ response, json: detail });
  });
  await page.goto("/tasks/T-0001");
  const draft = page.getByRole("textbox", { name: "Comment" });
  await draft.fill("First line\n\n");
  await page.locator("#timeline-source-whitespace-request")
    .getByRole("button", { name: "Reply to Implementation Agent" }).click();
  await expect(draft).toHaveValue("First line\n\n@implementer ");

  archived = true;
  await page.reload();
  await expect(page.getByRole("region", { name: "Add comment" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reply to Implementation Agent" })).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});
