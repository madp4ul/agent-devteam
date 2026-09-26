import { contrastRatio, expect, setAppearance, test } from "./browser-fixture.ts";

test("task position summarizes durable movement without making the summary interactive", async ({ page }) => {
  await page.goto("/tasks/T-0001");

  const position = page.getByRole("region", { name: "Task position" });
  await expect(position.getByText("Moved once", { exact: true })).toBeVisible();
  await expect(position.getByRole("button", { name: /Moved once/i })).toHaveCount(0);
  await expect(position.getByRole("link", { name: /Moved once/i })).toHaveCount(0);
});

test("scrolling reveals a fixed-scale movement map while conversations remain bottom anchored", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.description = "Long position context. ".repeat(900);
    const moves = [
      ["map-move-1", "implementation", "backlog", "agent", "implementer", "2026-08-09T13:01:00.000Z"],
      ["map-move-2", "backlog", "completion", "user", "local-user", "2026-08-09T13:02:00.000Z"],
      ["map-move-3", "completion", "implementation", "agent", "implementer", "2026-08-09T13:03:00.000Z"],
      ["map-move-4", "implementation", "backlog", "user", "local-user", "2026-08-09T13:04:00.000Z"],
    ];
    for (const [id, fromColumnId, toColumnId, kind, actorId, occurredAt] of moves) {
      detail.task.activity.push({
        id,
        type: "task.moved",
        actor: { kind, id: actorId },
        occurredAt,
        details: { fromColumnId, toColumnId },
      });
    }
    await route.fulfill({ response, json: detail });
  });
  await page.goto("/tasks/T-0001");

  const position = page.getByRole("region", { name: "Task position" });
  const map = position.getByTestId("movement-map");
  const plot = map.locator(".movement-map-plot");
  const stickyControls = page.locator(".detail-sticky-controls");
  const conversations = page.getByRole("region", { name: "Conversations" });
  await expect(position.getByText("Moved 5 times", { exact: true })).toBeVisible();
  expect((await map.boundingBox())?.height ?? 0).toBeLessThanOrEqual(1);

  const revealGeometry = await page.getByRole("region", { name: "Task timeline" }).evaluate(async (timeline) => {
    const map = document.querySelector<HTMLElement>('[data-testid="movement-map"]')!;
    const conversations = document.querySelector<HTMLElement>('[data-task-section="conversations"]')!;
    const start = window.scrollY;
    const target = start + timeline.getBoundingClientRect().top - window.innerHeight / 2;
    let minimumGap = Number.POSITIVE_INFINITY;
    let maximumTransientBottomJump = 0;
    let sampled = 0;
    let previousMapHeight = 0;
    for (let step = 1; step <= 48; step += 1) {
      const afterScroll = new Promise<number>((resolve) => {
        window.addEventListener("scroll", () => resolve(conversations.getBoundingClientRect().bottom), { once: true });
      });
      window.scrollTo(0, start + (target - start) * step / 48);
      const immediateConversationBottom = await afterScroll;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const mapBounds = map.getBoundingClientRect();
      const settledConversationBottom = conversations.getBoundingClientRect().bottom;
      if (previousMapHeight > 0 && mapBounds.height > previousMapHeight) {
        maximumTransientBottomJump = Math.max(
          maximumTransientBottomJump,
          Math.abs(settledConversationBottom - immediateConversationBottom),
        );
      }
      previousMapHeight = mapBounds.height;
      if (mapBounds.height <= 0) continue;
      sampled += 1;
      minimumGap = Math.min(minimumGap, conversations.getBoundingClientRect().top - mapBounds.bottom);
    }
    return { maximumTransientBottomJump, minimumGap, sampled };
  });
  expect(revealGeometry.sampled).toBeGreaterThan(2);
  expect(revealGeometry.minimumGap).toBeGreaterThanOrEqual(0);
  expect(revealGeometry.maximumTransientBottomJump).toBeLessThanOrEqual(1);

  await expect.poll(async () => (await map.boundingBox())?.height ?? 0).toBeGreaterThan(80);
  await expect(stickyControls).toHaveCSS("position", "fixed");
  const dockedConversationBounds = await conversations.boundingBox();
  expect(dockedConversationBounds).not.toBeNull();
  expect(Math.abs(700 - 16 - (dockedConversationBounds!.y + dockedConversationBounds!.height))).toBeLessThanOrEqual(1);
  await expect(position).toHaveCSS("overflow", "hidden");
  await expect(map.locator(".movement-map-lane")).toHaveCount(3);
  await expect(map.locator(".movement-map-legend-item")).toHaveText(["B", "I", "C"]);
  await expect(map.locator(".movement-map-legend-item").first()).not.toHaveAttribute("title");
  const firstLegendItem = map.locator(".movement-map-legend-item").first();
  await expect(firstLegendItem.locator("svg text")).toHaveAttribute("dominant-baseline", "central");
  const legendGlyphOffset = await firstLegendItem.evaluate((item) => {
    const glyph = item.querySelector("text")!;
    const itemBounds = item.getBoundingClientRect();
    const glyphBounds = glyph.getBoundingClientRect();
    return {
      x: Math.abs(itemBounds.x + itemBounds.width / 2 - (glyphBounds.x + glyphBounds.width / 2)),
      y: Math.abs(itemBounds.y + itemBounds.height / 2 - (glyphBounds.y + glyphBounds.height / 2)),
    };
  });
  expect(legendGlyphOffset.x).toBeLessThanOrEqual(1);
  expect(legendGlyphOffset.y).toBeLessThanOrEqual(1);
  await firstLegendItem.hover();
  const legendTooltip = page.getByRole("tooltip", { name: "Backlog" });
  expect(await legendTooltip.evaluate((tooltip) => tooltip.parentElement === document.body)).toBe(true);
  await expect(legendTooltip).toBeVisible();
  const [legendItemBounds, legendTooltipBounds] = await Promise.all([
    firstLegendItem.boundingBox(),
    legendTooltip.boundingBox(),
  ]);
  expect(legendItemBounds).not.toBeNull();
  expect(legendTooltipBounds).not.toBeNull();
  expect(legendTooltipBounds!.y + legendTooltipBounds!.height).toBeLessThan(legendItemBounds!.y);
  await expect(firstLegendItem).not.toHaveCSS("cursor", "text");
  await expect(firstLegendItem).toHaveCSS("user-select", "none");
  await expect(map.locator(".movement-map-column-rail")).toHaveCount(3);
  await expect(map.getByRole("button", { name: /^Moved from / })).toHaveCount(5);
  const [plotBeforeInteraction, stripBeforeInteraction] = await Promise.all([
    plot.boundingBox(),
    map.locator(".movement-map-strip").boundingBox(),
  ]);
  expect(plotBeforeInteraction).not.toBeNull();
  expect(stripBeforeInteraction).not.toBeNull();
  expect(Math.abs(stripBeforeInteraction!.y - plotBeforeInteraction!.y)).toBeLessThanOrEqual(1);
  for (const theme of ["dark", "light"] as const) {
    await setAppearance(page, theme);
    await firstLegendItem.hover();
    await expect(legendTooltip).toBeVisible();
    expect(await contrastRatio(legendTooltip)).toBeGreaterThanOrEqual(4.5);
    const laneVisuals = await map.locator(".movement-map-lane").evaluateAll((lanes) => lanes.map((lane) => ({
      background: getComputedStyle(lane).backgroundColor,
      border: getComputedStyle(lane).borderRightWidth,
    })));
    const landmarkFills = await map.locator(".movement-map-landmark").evaluateAll((landmarks) =>
      landmarks.map((landmark) => getComputedStyle(landmark).backgroundColor)
    );
    expect(new Set(laneVisuals.map(({ background }) => background))).toEqual(new Set(["rgba(0, 0, 0, 0)"]));
    expect(new Set(laneVisuals.map(({ border }) => border))).toEqual(new Set(["0px"]));
    expect(new Set(landmarkFills)).toEqual(new Set(["rgba(0, 0, 0, 0)"]));
    await expect(map.locator(".movement-map-viewport")).not.toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
    await expect(map.locator(".movement-map-viewport")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const firstLandmark = map.locator(".movement-map-landmark").first();
    await firstLandmark.hover();
    expect(await backgroundAlpha(firstLandmark)).toBeLessThanOrEqual(.1);
    await page.mouse.move(0, 0);
    await firstLandmark.focus();
    expect(await backgroundAlpha(firstLandmark)).toBeLessThanOrEqual(.1);
  }
  const drawingZIndex = await map.locator(".movement-map-drawing").evaluate((element) =>
    Number.parseInt(getComputedStyle(element).zIndex, 10) || 0
  );
  const landmarkZIndex = await map.locator(".movement-map-landmark").first().evaluate((element) =>
    Number.parseInt(getComputedStyle(element).zIndex, 10) || 0
  );
  expect(drawingZIndex).toBeGreaterThan(landmarkZIndex);
  await expect(map.locator(".movement-map-actor.user")).toHaveCount(0);
  await expect(map.locator(".movement-map-user-actor")).toHaveCount(0);
  expect(await map.locator(".movement-map-transition.user").count()).toBeGreaterThan(0);
  const transitionStrokes = await map.locator(".movement-map-transition").evaluateAll((transitions) =>
    transitions.map((transition) => ({
      actor: transition.classList.contains("user") ? "user" : "agent",
      stroke: getComputedStyle(transition).stroke,
    }))
  );
  expect(new Set(transitionStrokes.map(({ stroke }) => stroke)).size).toBeGreaterThan(1);
  expect(await map.locator(".movement-map-residency").count()).toBeGreaterThan(0);
  const [residencyStroke, movementStroke] = await Promise.all([
    map.locator(".movement-map-residency").first().evaluate((line) => getComputedStyle(line).stroke),
    map.locator(".movement-map-transition.agent").first().evaluate((line) => getComputedStyle(line).stroke),
  ]);
  expect(residencyStroke).not.toBe(movementStroke);
  const railAndResidencyPositions = await map.locator(".movement-map-plot").evaluate((plot) => {
    const rails = new Map([...plot.querySelectorAll<SVGLineElement>(".movement-map-column-rail")]
      .map((line) => [line.dataset.columnId, line.getAttribute("x1")]));
    return [...plot.querySelectorAll<SVGLineElement>(".movement-map-residency")].map((line) => ({
      railX: rails.get(line.dataset.columnId),
      residencyX: line.getAttribute("x1"),
    }));
  });
  expect(railAndResidencyPositions.every(({ railX, residencyX }) => railX === residencyX)).toBe(true);
  const userArrowColors = await map.locator(".movement-map-strip").evaluate((strip) => ({
    arrowhead: getComputedStyle(strip.querySelector(".movement-map-arrowhead.user")!).backgroundColor,
    transition: getComputedStyle(strip.querySelector(".movement-map-transition.user")!).stroke,
  }));
  expect(userArrowColors.arrowhead).toBe(userArrowColors.transition);
  const agentMarker = await map.locator(".movement-map-actor.agent").first().boundingBox();
  expect(agentMarker).not.toBeNull();
  expect(agentMarker!.width).toBeGreaterThanOrEqual(12);
  await expect(map.locator(".movement-map-actor.agent").first()).toHaveCSS("stroke", "none");
  const conversationBounds = await conversations.boundingBox();
  expect(conversationBounds).not.toBeNull();
  expect(conversationBounds!.y + conversationBounds!.height).toBeLessThanOrEqual(688);

  const viewportFrame = map.locator(".movement-map-viewport");
  await expect(viewportFrame).toHaveCSS("pointer-events", "none");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(map).toHaveAttribute("data-drag-ready", "true");
  const frameBounds = await viewportFrame.boundingBox();
  expect(frameBounds).not.toBeNull();
  const scrollBeforeDrag = await page.evaluate(() => window.scrollY);
  await page.mouse.move(
    frameBounds!.x + frameBounds!.width / 2,
    frameBounds!.y + frameBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    frameBounds!.x + frameBounds!.width / 2,
    frameBounds!.y + frameBounds!.height / 2 - 24,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(scrollBeforeDrag);

  const mapBounds = await map.boundingBox();
  expect(mapBounds).not.toBeNull();
  const scrollBeforeWheel = await page.evaluate(() => window.scrollY);
  await page.mouse.move(mapBounds!.x + mapBounds!.width / 2, mapBounds!.y + mapBounds!.height / 2);
  await page.mouse.wheel(0, 80);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBeforeWheel);

  const overlappingLandmark = await map.locator(".movement-map-landmark").evaluateAll((landmarks, frame) => {
    const frameBounds = frame as { top: number; bottom: number };
    const landmark = landmarks.find((candidate) => {
      const bounds = candidate.getBoundingClientRect();
      const center = bounds.top + bounds.height / 2;
      return center >= frameBounds.top && center <= frameBounds.bottom;
    });
    if (!(landmark instanceof HTMLButtonElement)) return null;
    const bounds = landmark.getBoundingClientRect();
    return {
      sourceId: landmark.dataset.sourceId ?? null,
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    };
  }, { top: frameBounds!.y, bottom: frameBounds!.y + frameBounds!.height });
  expect(overlappingLandmark?.sourceId).not.toBeNull();
  await page.mouse.click(overlappingLandmark!.x, overlappingLandmark!.y);
  await expect(page.locator(`#timeline-source-${overlappingLandmark!.sourceId}`)).toBeFocused();
  const currentFrameBounds = await viewportFrame.boundingBox();
  expect(currentFrameBounds).not.toBeNull();
  const outsideLandmark = await map.locator(".movement-map-landmark").evaluateAll((landmarks, frame) => {
    const frameBounds = frame as { top: number; bottom: number };
    const landmark = landmarks.find((candidate) => {
      const bounds = candidate.getBoundingClientRect();
      const center = bounds.top + bounds.height / 2;
      return center < frameBounds.top || center > frameBounds.bottom;
    });
    if (!(landmark instanceof HTMLButtonElement)) return null;
    const bounds = landmark.getBoundingClientRect();
    return {
      sourceId: landmark.dataset.sourceId ?? null,
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    };
  }, { top: currentFrameBounds!.y, bottom: currentFrameBounds!.y + currentFrameBounds!.height });
  expect(outsideLandmark?.sourceId).not.toBeNull();
  await page.evaluate(() => {
    (window as typeof window & { movementNavigationScrolls?: number[] }).movementNavigationScrolls = [];
    window.addEventListener("scroll", () => {
      (window as typeof window & { movementNavigationScrolls?: number[] }).movementNavigationScrolls?.push(performance.now());
    });
  });
  await page.mouse.click(outsideLandmark!.x, outsideLandmark!.y);
  await expect(page.locator(`#timeline-source-${outsideLandmark!.sourceId}`)).toBeFocused();
  await page.waitForTimeout(600);
  const navigationScrolls = await page.evaluate(() =>
    (window as typeof window & { movementNavigationScrolls?: number[] }).movementNavigationScrolls ?? []
  );
  expect(navigationScrolls.length).toBeGreaterThan(2);
  expect(navigationScrolls.at(-1)! - navigationScrolls[0]!).toBeGreaterThanOrEqual(350);
});

test("a long movement map scrubs the viewport without runaway scrolling or text selection", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.description = "Long panning context. ".repeat(900);
    for (let index = 0; index < 18; index += 1) {
      const fromColumnId = index % 2 === 0 ? "implementation" : "backlog";
      const toColumnId = index % 2 === 0 ? "backlog" : "implementation";
      detail.task.activity.push({
        id: `long-map-move-${index}`,
        type: "task.moved",
        actor: { kind: "agent", id: "implementer" },
        occurredAt: `2026-08-09T13:${String(index).padStart(2, "0")}:00.000Z`,
        details: { fromColumnId, toColumnId },
      });
    }
    await route.fulfill({ response, json: detail });
  });
  await page.goto("/tasks/T-0001");
  const map = page.getByTestId("movement-map");
  await page.getByRole("region", { name: "Task timeline" }).evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  await expect.poll(async () => (await map.boundingBox())?.height ?? 0).toBeGreaterThan(80);
  const expandedHeight = (await map.boundingBox())!.height;
  const partialState = await map.evaluate(async (element, fullHeight) => {
    let lowerScrollY = 0;
    let upperScrollY = window.scrollY;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const candidate = (lowerScrollY + upperScrollY) / 2;
      window.scrollTo(0, candidate);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const height = element.getBoundingClientRect().height;
      if (height < fullHeight / 2) lowerScrollY = candidate;
      else upperScrollY = candidate;
    }
    window.scrollTo(0, upperScrollY);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return { height: element.getBoundingClientRect().height, scrollY: window.scrollY };
  }, expandedHeight);
  expect(partialState.height).toBeGreaterThan(30);
  expect(partialState.height).toBeLessThan(expandedHeight - 8);
  await expect(map.locator(".movement-map-strip")).toHaveCSS("will-change", "auto");
  const partialPlotBounds = await map.locator(".movement-map-plot").boundingBox();
  expect(partialPlotBounds).not.toBeNull();
  const partialDragX = partialPlotBounds!.x + partialPlotBounds!.width - 4;
  await page.mouse.move(
    partialDragX,
    partialPlotBounds!.y + partialPlotBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    partialDragX,
    partialPlotBounds!.y + partialPlotBounds!.height / 2 + 28,
    { steps: 4 },
  );
  await page.mouse.up();
  expect(await page.evaluate(() => window.scrollY)).toBe(partialState.scrollY);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(map).toHaveAttribute("data-drag-ready", "true");
  await expect(map.locator(".movement-map-strip")).toHaveCSS("will-change", "transform");
  const [fullMapBounds, upperLimitFrame] = await Promise.all([
    map.boundingBox(),
    map.locator(".movement-map-viewport").boundingBox(),
  ]);
  expect(fullMapBounds).not.toBeNull();
  expect(upperLimitFrame).not.toBeNull();
  await page.mouse.move(
    upperLimitFrame!.x + upperLimitFrame!.width / 2,
    upperLimitFrame!.y + upperLimitFrame!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    upperLimitFrame!.x + upperLimitFrame!.width / 2,
    upperLimitFrame!.y - 1_000,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(map).toHaveAttribute("data-drag-ready", "true");
  expect((await map.boundingBox())!.height).toBeGreaterThanOrEqual(fullMapBounds!.height - 1);

  const [mapBounds, stripBounds, frameBounds] = await Promise.all([
    map.boundingBox(),
    map.locator(".movement-map-strip").boundingBox(),
    map.locator(".movement-map-viewport").boundingBox(),
  ]);
  expect(mapBounds).not.toBeNull();
  expect(stripBounds).not.toBeNull();
  expect(frameBounds).not.toBeNull();
  expect(stripBounds!.height).toBeGreaterThan(mapBounds!.height);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  const startX = frameBounds!.x + frameBounds!.width / 2;
  const startY = frameBounds!.y + frameBounds!.height / 2;
  const scrollBeforeCenteredDrag = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => {
    const trackedWindow = window as typeof window & { movementDragScrollCommands?: number[] };
    trackedWindow.movementDragScrollCommands = [];
    const originalScrollBy = window.scrollBy.bind(window);
    const originalScrollTo = window.scrollTo.bind(window);
    window.scrollBy = ((...args: unknown[]) => {
      trackedWindow.movementDragScrollCommands?.push(performance.now());
      Reflect.apply(originalScrollBy, window, args);
    }) as typeof window.scrollBy;
    window.scrollTo = ((...args: unknown[]) => {
      trackedWindow.movementDragScrollCommands?.push(performance.now());
      Reflect.apply(originalScrollTo, window, args);
    }) as typeof window.scrollTo;
  });
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 28, { steps: 20 });
  const settledScroll = await page.evaluate(() => window.scrollY);
  expect(settledScroll).toBeGreaterThan(scrollBeforeCenteredDrag);
  const dragScrollCommands = await page.evaluate(() =>
    (window as typeof window & { movementDragScrollCommands?: number[] }).movementDragScrollCommands ?? []
  );
  expect(dragScrollCommands.length).toBeGreaterThan(0);
  expect(dragScrollCommands.slice(1).every((time, index) =>
    time - dragScrollCommands[index]! >= 8
  )).toBe(true);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.scrollY)).toBe(settledScroll);
  await page.mouse.move(mapBounds!.x - 40, mapBounds!.y - 40, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");
  await page.evaluate(() => window.scrollBy(0, 1_000));
  await expect(map).toHaveAttribute("data-drag-ready", "true");

  const [nextMapBounds, nextPlotBounds, nextFrameBounds] = await Promise.all([
    map.boundingBox(),
    map.locator(".movement-map-plot").boundingBox(),
    map.locator(".movement-map-viewport").boundingBox(),
  ]);
  expect(nextMapBounds).not.toBeNull();
  expect(nextPlotBounds).not.toBeNull();
  expect(nextFrameBounds).not.toBeNull();
  const roomAbove = nextFrameBounds!.y - nextPlotBounds!.y;
  const outsideY = roomAbove >= 12
    ? nextPlotBounds!.y + 6
    : nextPlotBounds!.y + nextPlotBounds!.height - 6;
  const outsideDelta = outsideY < nextFrameBounds!.y + nextFrameBounds!.height / 2 ? 24 : -24;
  const scrollBeforeOutsideDrag = await page.evaluate(() => window.scrollY);
  await expect(map).toHaveAttribute("data-drag-ready", "true");
  const commandsBeforeOutsideDrag = await page.evaluate(() =>
    (window as typeof window & { movementDragScrollCommands?: number[] }).movementDragScrollCommands?.length ?? 0
  );
  const outsideX = nextPlotBounds!.x + nextPlotBounds!.width - 4;
  expect(await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return target instanceof Element ? target.className : null;
  }, { x: outsideX, y: outsideY })).toContain("movement-map");
  await page.mouse.move(outsideX, outsideY);
  await page.mouse.down();
  await page.mouse.move(outsideX, outsideY + outsideDelta, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() =>
    (window as typeof window & { movementDragScrollCommands?: number[] }).movementDragScrollCommands?.length ?? 0
  )).toBeGreaterThan(commandsBeforeOutsideDrag);
  await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(scrollBeforeOutsideDrag);

  const indicator = map.locator(".movement-map-overview-indicator");
  const indicatorRange = map.locator(".movement-map-overview-range");
  await expect(indicator).toBeVisible();
  await expect(indicator).toHaveCSS("pointer-events", "none");
  await expect(indicator).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(indicatorRange).toHaveCSS("border-top-width", "0px");
  await expect(indicatorRange).toHaveCSS("border-right-width", "0px");
  await expect(indicatorRange).toHaveCSS("border-bottom-width", "0px");
  await expect(indicatorRange).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const [laneBounds, currentStripBounds, indicatorBounds] = await Promise.all([
    map.locator(".movement-map-lanes").boundingBox(),
    map.locator(".movement-map-strip").boundingBox(),
    indicator.boundingBox(),
  ]);
  expect(laneBounds).not.toBeNull();
  expect(currentStripBounds).not.toBeNull();
  expect(indicatorBounds).not.toBeNull();
  expect(laneBounds!.x + laneBounds!.width).toBeLessThanOrEqual(indicatorBounds!.x);
  expect(currentStripBounds!.x + currentStripBounds!.width).toBeLessThanOrEqual(indicatorBounds!.x);
  const initialThumbBounds = await indicatorRange.boundingBox();
  expect(initialThumbBounds).not.toBeNull();
  expect(initialThumbBounds!.height).toBeLessThan(mapBounds!.height);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => {
    const [nextMap, nextFrame] = await Promise.all([
      map.boundingBox(),
      map.locator(".movement-map-viewport").boundingBox(),
    ]);
    if (nextMap === null || nextFrame === null) return Number.POSITIVE_INFINITY;
    return nextFrame.y + nextFrame.height - (nextMap.y + nextMap.height);
  }).toBeLessThanOrEqual(0.5);
  const bottomThumbBounds = await indicatorRange.boundingBox();
  const bottomScrollbarBounds = await indicator.boundingBox();
  expect(bottomThumbBounds).not.toBeNull();
  expect(bottomScrollbarBounds).not.toBeNull();
  expect(Math.abs(
    bottomThumbBounds!.y + bottomThumbBounds!.height -
      (bottomScrollbarBounds!.y + bottomScrollbarBounds!.height),
  )).toBeLessThanOrEqual(1);
});

async function backgroundAlpha(locator: import("@playwright/test").Locator): Promise<number> {
  return locator.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Canvas 2D context is unavailable");
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data[3]! / 255;
  });
}

test("task movement offers the next board column beside the destination selector", async ({ page }) => {
  await page.goto("/tasks/T-0001");

  const movement = page.getByRole("region", { name: "Task position" });
  const selector = movement.getByRole("combobox", { name: "Move task" });
  const shortcut = movement.getByRole("button", { name: "Move to Completion" });
  const inspectableMarker = movement.getByRole("button", { name: "Agent-inspectable information" });
  await expect(selector).toHaveValue("implementation");
  await expect(shortcut).toBeVisible();
  await expect(shortcut).toHaveText("Next");
  await expect(shortcut).toHaveAttribute("title", "Move to Completion");

  const [selectorBounds, shortcutBounds, markerBounds] = await Promise.all([
    selector.boundingBox(),
    shortcut.boundingBox(),
    inspectableMarker.boundingBox(),
  ]);
  expect(selectorBounds).not.toBeNull();
  expect(shortcutBounds).not.toBeNull();
  expect(markerBounds).not.toBeNull();
  expect(shortcutBounds!.x).toBeGreaterThanOrEqual(selectorBounds!.x + selectorBounds!.width);
  expect(Math.abs(
    markerBounds!.x + markerBounds!.width -
      (shortcutBounds!.x + shortcutBounds!.width),
  )).toBeLessThanOrEqual(2);
  expect(Math.abs(
    selectorBounds!.y + selectorBounds!.height / 2 -
      (shortcutBounds!.y + shortcutBounds!.height / 2),
  )).toBeLessThanOrEqual(2);

  let releaseMove!: () => void;
  const moveReleased = new Promise<void>((resolve) => { releaseMove = resolve; });
  await page.route("**/api/tasks/T-0001/move", async (route) => {
    await moveReleased;
    await route.continue();
  });
  await shortcut.click();
  await expect(selector).toBeDisabled();
  await expect(shortcut).toBeDisabled();
  releaseMove();
  await expect(page.getByRole("status")).toContainText("Moved T-0001 to Completion");
  await expect(selector).toHaveValue("completion");
  await expect(movement.getByRole("button", { name: "No next column" })).toBeVisible();
  await expect(movement.getByRole("button", { name: "No next column" })).toBeDisabled();
  await expect(movement.getByRole("button", { name: "No next column" })).toHaveText("Next");
});

test("the next-column shortcut reports an authoritative stale-view conflict", async ({ page, request }) => {
  await page.goto("/tasks/T-0002");
  await expect(page.getByRole("button", { name: "Move to Implementation" })).toBeVisible();

  const current = await (await request.get("/api/tasks/T-0002")).json() as {
    task: { revision: number };
  };
  const moved = await request.post("/api/tasks/T-0002/move", {
    data: {
      destinationColumnId: "implementation",
      expectedRevision: current.task.revision,
      idempotencyKey: "concurrent-next-column-move",
    },
  });
  expect(moved.status()).toBe(200);

  await page.getByRole("button", { name: "Move to Implementation" }).click();
  await expect(page.getByRole("alert")).toContainText(/changed since this page loaded/i);
  await expect(page.getByRole("combobox", { name: "Move task" })).toHaveValue("implementation");
});

test("movement stays immediately above conversations while long task content scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.route("**/api/tasks/T-0001", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.description = "Long movement context. ".repeat(700);
    await route.fulfill({ response, json: detail });
  });
  await page.goto("/tasks/T-0001");

  const stickyControls = page.locator(".detail-sticky-controls-slot");
  const movement = page.getByRole("region", { name: "Task position" });
  const selector = movement.getByRole("combobox", { name: "Move task" });
  const conversations = page.getByRole("region", { name: "Conversations" });
  await page.getByRole("region", { name: "Task timeline" }).evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });

  await expect(stickyControls).toHaveCSS("position", "sticky");
  const [topbarBounds, movementBounds, conversationBounds] = await Promise.all([
    page.locator(".detail-topbar").boundingBox(),
    movement.boundingBox(),
    conversations.boundingBox(),
  ]);
  expect(topbarBounds).not.toBeNull();
  expect(movementBounds).not.toBeNull();
  expect(conversationBounds).not.toBeNull();
  expect(movementBounds!.y).toBeGreaterThanOrEqual(topbarBounds!.y + topbarBounds!.height);
  expect(conversationBounds!.y).toBeGreaterThanOrEqual(movementBounds!.y + movementBounds!.height);
  expect(conversationBounds!.y + conversationBounds!.height).toBeLessThanOrEqual(688);

  for (const theme of ["dark", "light"] as const) {
    await setAppearance(page, theme);
    const shortcut = movement.getByRole("button", { name: "Move to Completion" });
    await expect(shortcut).toBeVisible();
    expect(await contrastRatio(shortcut)).toBeGreaterThanOrEqual(4.5);
  }

  await page.setViewportSize({ width: 1100, height: 500 });
  await expect(stickyControls).toHaveCSS("position", "static");
  await conversations.getByRole("button", { name: /Implementation Agent/ }).scrollIntoViewIfNeeded();
  await expect(conversations.getByRole("button", { name: /Implementation Agent/ })).toBeVisible();

  await page.setViewportSize({ width: 700, height: 500 });
  await expect(stickyControls).toHaveCSS("position", "static");
  await movement.getByRole("button", { name: "Move to Completion" }).scrollIntoViewIfNeeded();
  const narrowShortcut = movement.getByRole("button", { name: "Move to Completion" });
  await expect(narrowShortcut).toBeVisible();
  const [narrowSelectorBounds, narrowShortcutBounds] = await Promise.all([
    selector.boundingBox(),
    narrowShortcut.boundingBox(),
  ]);
  expect(narrowSelectorBounds).not.toBeNull();
  expect(narrowShortcutBounds).not.toBeNull();
  expect(narrowShortcutBounds!.x).toBeGreaterThanOrEqual(
    narrowSelectorBounds!.x + narrowSelectorBounds!.width,
  );
  await conversations.getByRole("button", { name: /Implementation Agent/ }).scrollIntoViewIfNeeded();
  await expect(conversations.getByRole("button", { name: /Implementation Agent/ })).toBeVisible();
});

test("unmapped tasks keep explicit destinations without guessing a next column", async ({ page }) => {
  await page.route("**/api/tasks/T-0002", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.task.columnId = "retired-column";
    await route.fulfill({ response, json: detail });
  });
  await page.goto("/tasks/T-0002");

  const movement = page.getByRole("region", { name: "Task position" });
  const selector = movement.getByRole("combobox", { name: "Move task" });
  await expect(selector).toHaveValue("retired-column");
  await expect(selector.locator("option")).toHaveText([
    "Unmapped: retired-column",
    "Backlog",
    "Implementation",
    "Completion",
  ]);
  await expect(movement.getByRole("button", { name: /^Move to / })).toHaveCount(0);
  await expect(movement.getByRole("button", { name: "No next column" })).toBeVisible();
  await expect(movement.getByRole("button", { name: "No next column" })).toBeDisabled();
});
