import type { TaskActivityView, TaskCommentView } from "./task-contract.ts";
import type { ProcessDiagnostic } from "./process-contract.ts";

export interface TaskHistoryRecord {
  id: string;
  type: "comment" | TaskActivityView["type"];
  at: string;
  author: { kind: "user" | "agent" | "framework"; id: string; originTask?: { id: string; title: string } };
  body?: string;
  details?: Record<string, string>;
}
export interface HistoryCounts { words: number; records: number; comments: number }
export interface HistoryCoverage { total: HistoryCounts; included: HistoryCounts; omitted: HistoryCounts }
export function historyCoverage(total: HistoryCounts, included: HistoryCounts): HistoryCoverage {
  return { total, included, omitted: { words: total.words - included.words,
    records: total.records - included.records, comments: total.comments - included.comments } };
}
export interface TaskHistoryPage {
  records: TaskHistoryRecord[];
  returned: HistoryCounts;
  remaining: HistoryCounts;
  total: HistoryCounts;
  nextCursor: string | null;
  projection: "history" | "activation-updates";
  checkpointReached?: true;
  continuation?: "older-history";
  boundary?: string;
}
export interface TaskHistoryQuery { taskId: string; targetWords?: number; cursor?: string }
export type TaskHistoryQueryResult =
  | { available: true; history: TaskHistoryPage }
  | { available: false; reason: "not-found" | "invalid-cursor" | "invalid-target-words" }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };
export interface HistoryCheckpoint { comments: number; activity: number }

export function commentHistoryRecord(comment: TaskCommentView, taskId: string): TaskHistoryRecord {
  return { id: comment.id, type: "comment", at: comment.occurredAt,
    author: { ...comment.actor, ...(comment.originTask && comment.originTask.id !== taskId
      ? { originTask: comment.originTask } : {}) }, body: comment.body };
}
/** Count readable values, not JSON punctuation or opaque identifiers/cursors. */
export function historyCounts(records: readonly TaskHistoryRecord[]): HistoryCounts {
  return records.reduce((counts, record) => ({
    words: counts.words + [record.type, record.at, record.author.kind, record.author.id,
      record.author.originTask?.title, record.body, ...Object.values(record.details ?? {})]
      .filter((value): value is string => typeof value === "string")
      .reduce((words, value) => words + (value.match(/\S+/gu)?.length ?? 0), 0),
    records: counts.records + 1, comments: counts.comments + (record.type === "comment" ? 1 : 0),
  }), { words: 0, records: 0, comments: 0 });
}
