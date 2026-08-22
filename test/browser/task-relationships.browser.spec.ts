import { expect, test } from "./browser-fixture.ts";

test("cross-task links in authored and framework history open a new tab", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.description += "\n\nReview the [related task](/tasks/T-0002).";
    await route.fulfill({ response, json: detail });
  });
  await page.goto("/tasks/T-0001");

  const links = [
    page.getByRole("region", { name: "Description" }).getByRole("link", { name: "related task" }),
    page.getByRole("region", { name: "Relationships" }).getByRole("link", { name: "Drag this task" }),
    page.getByRole("region", { name: "Task timeline" }).getByRole("link", { name: "Drag this task" }),
  ];
  for (const link of links) {
    await expect(link).toHaveAttribute("href", "/tasks/T-0002");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
});

test("relationship history links every direction and reports completed, archived, and unavailable targets", async ({ page }) => {
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.timelineRelationshipTasks = [
      { id: "T-9001", title: "Child target", available: true, completed: false, archived: false },
      { id: "T-9002", title: "Parent target", available: true, completed: true, archived: false },
      { id: "T-9003", title: "Dependency target", available: true, completed: false, archived: true },
      { id: "T-9004", available: false },
    ];
    const relationships = [
      ["parent-child", "source", "T-9001"],
      ["parent-child", "target", "T-9002"],
      ["dependency", "source", "T-9003"],
      ["dependency", "target", "T-9004"],
    ] as const;
    for (const [index, [relationshipType, relationshipRole, relatedTaskId]] of relationships.entries()) {
      for (const [eventIndex, event] of ["created", "removed"].entries()) {
        detail.task.activity.push({
          id: `relationship-${index}-${event}`,
          type: `relationship.${event}`,
          actor: { kind: "user", id: "paul" },
          occurredAt: new Date(Date.parse("2026-08-22T10:00:00.000Z") + index * 60_000 + eventIndex * 1_000).toISOString(),
          details: { relationshipType, relationshipRole, relatedTaskId },
        });
      }
    }
    await route.fulfill({ response, json: detail });
  });

  await page.goto("/tasks/T-0001");
  const timeline = page.getByRole("region", { name: "Task timeline" });
  for (const label of [
    "Child task added", "Child task removed",
    "Parent task added", "Parent task removed",
    "Dependency added", "Dependency removed",
    "Blocking dependency added", "Blocking dependency removed",
  ]) {
    await expect(timeline.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(timeline.getByRole("link", { name: "Child target" })).toHaveCount(2);
  await expect(timeline.getByRole("link", { name: "Parent target" })).toHaveCount(2);
  await expect(timeline.getByRole("link", { name: "Dependency target" })).toHaveCount(2);
  await expect(timeline.getByText("Parent target (completed) was added as the parent task.", { exact: true })).toBeVisible();
  await expect(timeline.getByText("Now depends on Dependency target (archived).", { exact: true })).toBeVisible();
  await expect(timeline.getByText("Now blocks T-9004 (currently unavailable).", { exact: true })).toBeVisible();
  await expect(timeline.getByRole("link", { name: "T-9004" })).toHaveCount(0);
  await expect(timeline.getByText("T-9004", { exact: true }).first()).toBeVisible();
});

test("task relationships are discoverable, searchable, and recoverable", async ({ page, request }) => {
  let prerequisite = await (await request.get("/api/tasks/T-0001")).json() as {
    task: { archived: boolean; columnId: string; revision: number; title: string; description: string };
  };
  if (prerequisite.task.archived) {
    const unarchived = await request.post("/api/tasks/T-0001/unarchive", {
      data: { idempotencyKey: "restore-relationship-prerequisite" },
    });
    expect(unarchived.status()).toBe(200);
    prerequisite = await (await request.get("/api/tasks/T-0001")).json() as typeof prerequisite;
  }
  if (prerequisite.task.title !== "Inspect existing coordination") {
    const renamed = await request.patch("/api/tasks/T-0001", {
      data: {
        title: "Inspect existing coordination",
        description: prerequisite.task.description,
        expectedRevision: prerequisite.task.revision,
        idempotencyKey: "restore-relationship-prerequisite-title",
      },
    });
    expect(renamed.status()).toBe(200);
    prerequisite = await (await request.get("/api/tasks/T-0001")).json() as typeof prerequisite;
  }
  if (prerequisite.task.columnId !== "implementation") {
    const moved = await request.post("/api/tasks/T-0001/move", {
      data: {
        destinationColumnId: "implementation",
        expectedRevision: prerequisite.task.revision,
        idempotencyKey: "position-relationship-prerequisite",
      },
    });
    expect(moved.status()).toBe(200);
  }
  await page.route("**/api/board", async (route) => {
    const response = await route.fetch();
    const body = await response.json() as {
      boards: Array<{ id: string; name: string; columns: Array<{ id: string; name: string; tasks: unknown[] }> }>;
    };
    body.boards.push({
      id: "operations",
      name: "Operations",
      columns: [
        {
          id: "investigation",
          name: "Investigation",
          tasks: [
            {
              id: "T-9001",
              title: "Cross-board investigation",
              boardId: "operations",
              column: { id: "investigation", name: "Investigation" },
              revision: 1,
              blocking: { blocked: false, blockerTaskIds: [] },
              relationships: [],
              unresolvedAttention: [],
              automationSuspended: false,
              run: { status: "idle", queuedActivationCount: 0, activeAttemptId: null },
            },
            ...Array.from({ length: 8 }, (_, index) => ({
              id: `T-91${index.toString().padStart(2, "0")}`,
              title: `Additional investigation ${index + 1}`,
              boardId: "operations",
              column: { id: "investigation", name: "Investigation" },
              revision: 1,
              blocking: { blocked: false, blockerTaskIds: [] },
              relationships: [],
              unresolvedAttention: [],
              automationSuspended: false,
              run: { status: "idle", queuedActivationCount: 0, activeAttemptId: null },
            })),
          ],
        },
        {
          id: "completion",
          name: "Completion",
          tasks: [{
            id: "T-9002",
            title: "Completed prerequisite",
            boardId: "operations",
            column: { id: "completion", name: "Completion" },
            revision: 2,
            blocking: { blocked: false, blockerTaskIds: [] },
            relationships: [],
            unresolvedAttention: [],
            automationSuspended: false,
            run: { status: "idle", queuedActivationCount: 0, activeAttemptId: null },
          }],
        },
      ],
    });
    await route.fulfill({ response, json: body });
  });
  await page.goto("/tasks/T-0002");

  const relationships = page.getByRole("region", { name: "Relationships" });
  await expect(relationships.getByRole("heading", { name: "Blocking tasks" })).toBeVisible();
  await expect(relationships.getByRole("link", { name: "Inspect existing coordination" })).toHaveAttribute("href", "/tasks/T-0001");
  await expect(relationships.getByRole("link", { name: "Inspect existing coordination" })).toHaveAttribute("target", "_blank");
  await expect(relationships).toContainText("T-0001 · Product delivery / Implementation");
  await expect(relationships.getByRole("region", { name: "Blocking tasks" }).getByText("Blocking", { exact: true })).toHaveCount(0);
  const relationshipActions = relationships.getByRole("group", { name: "Add relationship" });
  const finder = relationshipActions.getByRole("combobox", { name: "Depends on" });
  const createChild = relationshipActions.getByRole("button", { name: "Create child task" });
  await expect(finder).toBeVisible();
  await expect(createChild).toBeVisible();
  const [createChildBox, finderBox] = await Promise.all([createChild.boundingBox(), finder.boundingBox()]);
  expect(createChildBox?.x).toBeLessThan(finderBox?.x ?? 0);
  const actionFrames = await relationshipActions.locator(":scope > *").evaluateAll((elements) =>
    elements.map((element) => ({
      borderWidth: getComputedStyle(element).borderWidth,
      backgroundColor: getComputedStyle(element).backgroundColor,
    })),
  );
  expect(actionFrames).toEqual([
    { borderWidth: "0px", backgroundColor: "rgba(0, 0, 0, 0)" },
    { borderWidth: "0px", backgroundColor: "rgba(0, 0, 0, 0)" },
  ]);
  await expect(relationshipActions.getByRole("listbox", { name: "Available dependency tasks" })).not.toBeVisible();
  await expect(page.getByLabel("Starting Git ref (optional)")).not.toBeVisible();
  await relationships.getByRole("button", { name: "Remove blocking dependency with Inspect existing coordination" }).click();
  const finalBlockerPreview = page.getByRole("dialog", { name: "Remove blocking dependency?" });
  await expect(finalBlockerPreview).toContainText("Neither task will be deleted");
  await expect(finalBlockerPreview).toContainText("clear the final blocker");
  await finalBlockerPreview.getByRole("button", { name: "Cancel" }).click();
  await finder.focus();
  const options = page.getByRole("listbox", { name: "Available dependency tasks" });
  await expect(options).toBeVisible();
  expect(await options.evaluate((element) => getComputedStyle(element).position)).toBe("absolute");
  expect(await options.evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  const overlayScroll = await options.evaluate((element) => {
    const overflow = element.scrollHeight > element.clientHeight;
    element.scrollTop = element.scrollHeight;
    return { overflow, scrollTop: element.scrollTop };
  });
  expect(overlayScroll.overflow).toBe(true);
  expect(overlayScroll.scrollTop).toBeGreaterThan(0);
  await finder.fill("Cross-board");
  await expect(options.getByRole("option", { name: /Cross-board investigation/ })).toContainText("T-9001 · Operations / Investigation");
  await finder.fill("Completed prerequisite");
  await expect(options.getByRole("option", { name: /Completed prerequisite/ })).toContainText("Completed · nonblocking");
  await finder.press("Escape");
  await expect(finder).toBeVisible();
  await expect(options).not.toBeVisible();
  await finder.focus();
  await finder.fill("Recover");
  const recoverOption = options.getByRole("option", { name: /Recover a workspace startup failure/ });
  await expect(recoverOption).toContainText("T-0003 · Product delivery / Implementation");
  await recoverOption.click();
  await expect(relationships.getByRole("heading", { name: "Depends on" })).toBeVisible();
  await expect(relationships.getByRole("link", { name: "Recover a workspace startup failure" })).toBeVisible();
  await expect(relationships.getByRole("region", { name: "Depends on" }).getByText("Blocking", { exact: true })).toBeVisible();
  const taskTimeline = page.getByRole("region", { name: "Task timeline" });
  await expect(taskTimeline.getByText("Dependency added", { exact: true })).toBeVisible();
  await expect(taskTimeline.getByText("Now depends on Recover a workspace startup failure.", { exact: true })).toBeVisible();
  await expect(taskTimeline.getByRole("link", { name: "Recover a workspace startup failure" })).toBeVisible();
  await expect(taskTimeline.getByRole("link", { name: "Recover a workspace startup failure" })).toHaveAttribute("target", "_blank");
  await expect(finder).toBeVisible();
  await expect(options).not.toBeVisible();
  await expect(relationships.getByText("Selected: Recover a workspace startup failure")).toHaveCount(0);
  await expect(relationships.getByRole("button", { name: "Add dependency" })).toHaveCount(0);
  await expect(relationships.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  await finder.focus();
  await finder.fill("Recover");
  await expect(options.getByRole("option", { name: /Recover a workspace startup failure/ })).toHaveCount(0);
  await finder.press("Escape");

  await createChild.click();
  const childDialog = page.getByRole("dialog", { name: "Create child task" });
  await expect(childDialog).toContainText("Parent T-0002");
  await expect(childDialog.getByLabel("Starting column")).toHaveValue("backlog");
  await expect(childDialog.getByLabel("Starting column").locator('option[value="completion"]')).toHaveCount(0);
  await childDialog.getByLabel("Outcome-oriented title").fill("Investigate a focused child outcome");
  await childDialog.getByLabel("Complete description").fill("Keep the child isolated from dirty parent files.");
  await expect(childDialog.getByLabel("Starting Git ref (optional)")).not.toBeVisible();
  await childDialog.getByText("Advanced", { exact: true }).click();
  await childDialog.getByLabel("Starting Git ref (optional)").fill("main");
  await childDialog.getByRole("button", { name: "Create child task", exact: true }).click();
  await expect(page.locator(".feedback.status")).toContainText(/Created child T-\d{4}/);
  await expect(relationships.getByRole("heading", { name: "Child tasks" })).toBeVisible();
  await expect(taskTimeline.getByText("Child task added", { exact: true })).toBeVisible();
  await expect(taskTimeline.getByText("Investigate a focused child outcome was added as a child task.", { exact: true })).toBeVisible();
  await expect(taskTimeline.getByRole("link", { name: "Investigate a focused child outcome" })).toHaveAttribute("href", /\/tasks\/T-\d{4}/);
  const childLink = relationships.getByRole("link", { name: "Investigate a focused child outcome" });
  const childHref = await childLink.getAttribute("href");
  expect(childHref).toMatch(/^\/tasks\/T-\d{4}$/);
  const childPopupPromise = page.waitForEvent("popup");
  await childLink.click();
  const childPopup = await childPopupPromise;
  await expect(childPopup).toHaveURL(new RegExp(`${childHref}$`));
  await expect(page).toHaveURL(/\/tasks\/T-0002$/);
  await childPopup.close();
  await page.goto(childHref!);
  const childRelationships = page.getByRole("region", { name: "Relationships" });
  const childTimeline = page.getByRole("region", { name: "Task timeline" });
  await expect(childRelationships.getByRole("heading", { name: "Parent tasks" })).toBeVisible();
  await expect(childRelationships.getByRole("link", { name: "Drag this task" })).toBeVisible();
  await expect(childRelationships.getByText("Blocking", { exact: true })).toHaveCount(0);
  await expect(childTimeline.getByText("Parent task added", { exact: true })).toBeVisible();
  await expect(childTimeline.getByText("Drag this task was added as the parent task.", { exact: true })).toBeVisible();
  const parentLink = childRelationships.getByRole("link", { name: "Drag this task" });
  const parentPopupPromise = page.waitForEvent("popup");
  await parentLink.click();
  const parentPopup = await parentPopupPromise;
  await expect(parentPopup).toHaveURL(/\/tasks\/T-0002$/);
  await parentPopup.close();
  await page.goto("/tasks/T-0002");

  const removeButton = relationships.getByRole("button", { name: "Remove dependency with Recover a workspace startup failure" });
  const removeIcon = removeButton.locator("svg");
  const [buttonBounds, iconBounds] = await Promise.all([removeButton.boundingBox(), removeIcon.boundingBox()]);
  expect(buttonBounds).not.toBeNull();
  expect(iconBounds).not.toBeNull();
  if (buttonBounds !== null && iconBounds !== null) {
    expect(Math.abs((buttonBounds.x + buttonBounds.width / 2) - (iconBounds.x + iconBounds.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs((buttonBounds.y + buttonBounds.height / 2) - (iconBounds.y + iconBounds.height / 2))).toBeLessThanOrEqual(1);
  }

  await removeButton.click();
  const confirmation = page.getByRole("dialog", { name: "Remove dependency?" });
  await expect(confirmation).toContainText("Neither task will be deleted");
  await expect(confirmation).toContainText("remain blocked by other unresolved work");
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(relationships.getByRole("link", { name: "Recover a workspace startup failure" })).toBeVisible();
  let removalAttempts = 0;
  await page.route("**/api/tasks/T-0002/relationships/*", async (route) => {
    if (route.request().method() === "DELETE" && removalAttempts++ === 0) {
      await route.fulfill({ status: 409, json: { accepted: false, reason: "relationship-conflict" } });
      return;
    }
    await route.continue();
  });
  await relationships.getByRole("button", { name: "Remove dependency with Recover a workspace startup failure" }).click();
  await page.getByRole("dialog", { name: "Remove dependency?" }).getByRole("button", { name: "Remove relationship" }).click();
  await expect(page.getByRole("alert")).toContainText("Relationship state was refreshed");
  await expect(relationships.getByRole("link", { name: "Recover a workspace startup failure" })).toBeVisible();
  await relationships.getByRole("button", { name: "Remove dependency with Recover a workspace startup failure" }).click();
  await page.getByRole("dialog", { name: "Remove dependency?" }).getByRole("button", { name: "Remove relationship" }).click();
  await expect(relationships.getByRole("link", { name: "Recover a workspace startup failure" })).toHaveCount(0);
  await expect(taskTimeline.getByText("Dependency removed", { exact: true })).toBeVisible();
  await expect(taskTimeline.getByText("Does not depend on Recover a workspace startup failure anymore.", { exact: true })).toBeVisible();
});
