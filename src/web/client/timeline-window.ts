import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TimelinePage, TimelineRecord, AttemptTimelineContent } from "../../application/timeline-contract.ts";
import { readTaskTimeline } from "./api.ts";
import { captureTimelineViewportAnchor, restoreTimelineViewportAnchor, timelineSourceScrollIsActive, type TimelineViewportAnchor } from "./timeline-scroll-anchor.ts";
import { captureTextSelectionWithin, restoreCapturedTextSelection, type CapturedTextSelection } from "./text-selection.ts";
import { errorMessage } from "./feedback.ts";

export function useTimelineWindow(taskId: string, initial: TimelinePage | undefined) {
  const [page, setPage] = useState(initial);
  const pageRef = useRef(page); pageRef.current = page;
  const positions = useRef(new Map(initial?.records.map((record, index) => [record.key, initial.start + index])));
  const neighbors = useRef(new Map(initial?.records.slice(0, -1).map((record, index) => [record.key, initial.records[index + 1]!.key])));
  const focusPage = useRef<TimelinePage | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const anchor = useRef<TimelineViewportAnchor | null>(null);
  const selection = useRef<CapturedTextSelection | null>(null);
  const retry = useRef<() => void>(() => {});
  const sourceQueue = useRef<{ id: string; done(): void } | undefined>(undefined);
  const navigating = useRef(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; generation.current++; }, []);

  const apply = useCallback((incoming: TimelinePage, nested = false) => {
    const current = pageRef.current;
    const ranks = positions.current;
    if (!nested) {
      const added = incoming.total - (current?.total ?? incoming.total);
      if (added > 0) for (const [key, position] of ranks) ranks.set(key, position + added);
      const shared = incoming.records.findIndex((record) => ranks.has(record.key));
      const offset = incoming.start === 0 ? 0 : shared < 0 ? Math.max(0, (current?.total ?? incoming.total) - incoming.total)
        : ranks.get(incoming.records[shared]!.key)! - (incoming.start + shared);
      incoming.records.forEach((record, index) => ranks.set(record.key, incoming.start + index + offset));
      incoming.records.slice(0, -1).forEach((record, index) => neighbors.current.set(record.key, incoming.records[index + 1]!.key));
    }
    const records = new Map(current?.records.map((record) => [record.key, record]));
    for (const record of incoming.records) records.set(record.key, mergeRecord(records.get(record.key), record, nested));
    const ordered = [...records.values()].sort((left, right) => left.sequence !== undefined && right.sequence !== undefined
      ? right.occurredAt.localeCompare(left.occurredAt) || right.sequence - left.sequence
      : (ranks.get(left.key) ?? 0) - (ranks.get(right.key) ?? 0));
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1]!; const next = ordered[index]!;
      if ((ranks.get(next.key) ?? 0) - (ranks.get(previous.key) ?? 0) === 1) neighbors.current.set(previous.key, next.key);
    }
    const firstRank = ranks.get(ordered[0]?.key ?? "") ?? incoming.start;
    const next = mergeWindowMetadata(current, {
      ...incoming, records: ordered,
      start: firstRank,
      total: nested ? current?.total ?? incoming.total : Math.max(current?.total ?? 0, incoming.total),
      olderCursor: nested || incoming.records.at(-1)?.key !== ordered.at(-1)?.key ? current?.olderCursor ?? null : incoming.olderCursor,
      newerCursor: nested || incoming.records[0]?.key !== ordered[0]?.key ? current?.newerCursor ?? null : incoming.newerCursor,
      refreshCursor: nested ? current?.refreshCursor ?? incoming.refreshCursor : incoming.refreshCursor,
    });
    anchor.current = timelineSourceScrollIsActive() ? null : captureTimelineViewportAnchor("sticky-header");
    selection.current = captureTextSelectionWithin(document.querySelector(".timeline-section"), document.querySelector(".transcript-content"));
    // Publish synchronously to the ref so a second response cannot replace retained records before React commits.
    pageRef.current = next;
    setPage(next);
  }, []);

  useLayoutEffect(() => {
    restoreTimelineViewportAnchor(anchor.current); anchor.current = null;
    restoreCapturedTextSelection(selection.current); selection.current = null;
  }, [page]);

  useLayoutEffect(() => {
    if (!initial || busy.current || navigating.current) return;
    apply(initial);
    const focused = focusPage.current;
    if (!focused || focused.start === 0) return;
    const token = ++generation.current;
    // Refresh only the directly inspected page. Retained immutable pages do not become an unbounded polling payload.
    void readTaskTimeline(taskId, { cursor: focused.refreshCursor, refresh: true, pageSize: Math.min(150, focused.records.length || 50) }).then((next) => {
      if (mounted.current && token === generation.current && !busy.current && !navigating.current) { focusPage.current = next; apply(next); }
    }).catch((cause) => { if (mounted.current && token === generation.current) setError(errorMessage(cause)); });
  }, [initial, taskId, apply]);

  const fetchPage = useCallback(async (query: Parameters<typeof readTaskTimeline>[1], repeat: () => void) => {
    if (busy.current || navigating.current) return;
    const token = ++generation.current;
    busy.current = true; setLoading(true); retry.current = repeat;
    try {
      const next = await readTaskTimeline(taskId, query);
      if (!mounted.current || token !== generation.current) return;
      focusPage.current = next; apply(next); setError(undefined);
    } catch (cause) { if (mounted.current && token === generation.current) setError(errorMessage(cause)); }
    finally { busy.current = false; if (mounted.current && token === generation.current) setLoading(false); }
  }, [taskId, apply]);
  const load = useCallback(async (direction: "older" | "newer") => {
    const cursor = direction === "older" ? pageRef.current?.olderCursor : pageRef.current?.newerCursor;
    if (cursor) await fetchPage({ cursor }, () => { void load(direction); });
  }, [fetchPage]);
  const fillGap = useCallback(async (sourceId: string) => {
    await fetchPage({ sourceId }, () => { void fillGap(sourceId); });
  }, [fetchPage]);

  const source = useCallback((id: string): Promise<void> => new Promise((done) => {
    generation.current++;
    sourceQueue.current?.done(); sourceQueue.current = { id, done };
    const drain = async (): Promise<void> => {
      if (navigating.current) return;
      navigating.current = true; setLoading(true);
      while (mounted.current && sourceQueue.current) {
        const target = sourceQueue.current; sourceQueue.current = undefined;
        const token = generation.current;
        retry.current = () => { void source(target.id); };
        try {
          const next = await readTaskTimeline(taskId, { sourceId: target.id });
          if (mounted.current && token === generation.current) { focusPage.current = next; apply(next); setError(undefined); }
        } catch (cause) { if (mounted.current && token === generation.current) setError(errorMessage(cause)); }
        target.done();
      }
      navigating.current = false;
      if (mounted.current) setLoading(false);
    };
    void drain();
  }), [taskId, apply]);

  const content = async (record: Extract<TimelineRecord, { kind: "attempt" }>): Promise<void> => {
    const cursor = record.contentPage?.olderCursor;
    if (!cursor || busy.current || navigating.current) return;
    const token = ++generation.current;
    busy.current = true; setLoading(true); retry.current = () => { void content(record); };
    try {
      const next = await readTaskTimeline(taskId, { cursor });
      if (mounted.current && token === generation.current) { apply(next, true); setError(undefined); }
    } catch (cause) { if (mounted.current && token === generation.current) setError(errorMessage(cause)); }
    finally { busy.current = false; if (mounted.current && token === generation.current) setLoading(false); }
  };
  const cancelSource = (): void => {
    generation.current++;
    sourceQueue.current?.done(); sourceQueue.current = undefined;
    setLoading(false);
  };
  const gaps = new Map<string, { count: number; sourceId: string }>();
  const records = page?.records ?? [];
  for (let index = 1; index < records.length; index++) {
    const previous = records[index - 1]!; const current = records[index]!;
    const count = (positions.current.get(current.key) ?? 0) - (positions.current.get(previous.key) ?? 0) - 1;
    if (count > 0 && neighbors.current.get(previous.key) !== current.key) gaps.set(current.key, { count: Math.max(1, count), sourceId: recordSource(previous) });
  }
  const gapBefore = (key: string) => gaps.get(key);
  return { page, loading, error, load, source, cancelSource, content, gapBefore, fillGap, retry: () => retry.current() };
}

function recordSource(record: TimelineRecord): string {
  return record.kind === "attempt" ? record.attempt.id : record.kind === "startup-failure" ? record.activation.id : record.kind === "comment" ? record.comment.id : record.activity.id;
}
function mergeRecord(current: TimelineRecord | undefined, incoming: TimelineRecord, advanceContentCursor: boolean): TimelineRecord {
  if (current?.kind !== "attempt" || incoming.kind !== "attempt") return incoming;
  const id = (entry: AttemptTimelineContent) => entry.kind === "comment" ? entry.comment.id : entry.activity.id;
  const content = new Map(current.content.map((entry) => [id(entry), entry]));
  for (const entry of incoming.content) content.set(id(entry), entry);
  return { ...incoming, content: [...content.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || (b.sequence ?? 0) - (a.sequence ?? 0)),
    ...(incoming.contentPage === undefined ? {} : { contentPage: { ...incoming.contentPage,
      olderCursor: advanceContentCursor || current.contentPage === undefined ? incoming.contentPage.olderCursor : current.contentPage.olderCursor,
      ...(current.contentPage?.sourceId === undefined ? {} : { sourceId: current.contentPage.sourceId }) } }) };
}

function mergeWindowMetadata(current: TimelinePage | undefined, next: TimelinePage): TimelinePage {
  const comments = next.records.flatMap((record) => record.kind === "comment" ? [record.comment.id] : record.kind === "attempt" ? record.content.flatMap((entry) => entry.kind === "comment" ? [entry.comment.id] : []) : []);
  const activity = next.records.flatMap((record) => record.kind === "activity" ? [record.activity] : record.kind === "attempt" ? record.content.flatMap((entry) => entry.kind === "activity" ? [entry.activity] : []) : []);
  const relatedIds = new Set(activity.flatMap((entry) => entry.details.relatedTaskId ? [entry.details.relatedTaskId] : []));
  const references = new Map([...(current?.relatedTasks ?? []), ...(next.relatedTasks ?? [])].map((task) => [task.id, task]));
  const allowedComments = new Set([...(current?.inspectableSources?.commentIds ?? []), ...(next.inspectableSources?.commentIds ?? [])]);
  const allowedActivity = new Set([...(current?.inspectableSources?.activityIds ?? []), ...(next.inspectableSources?.activityIds ?? [])]);
  return { ...next,
    ...(next.relatedTasks === undefined && current?.relatedTasks === undefined ? {} : { relatedTasks: [...references.values()].filter(({ id }) => relatedIds.has(id)) }),
    ...(next.inspectableSources === undefined && current?.inspectableSources === undefined ? {} : { inspectableSources: { commentIds: comments.filter((id) => allowedComments.has(id)), activityIds: activity.map(({ id }) => id).filter((id) => allowedActivity.has(id)) } }),
  };
}
