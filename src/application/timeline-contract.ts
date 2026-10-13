import type { ActivationView } from "./automation-contract.ts";
import type { ActivationStartupFailureView, AttemptView } from "./runtime-contract.ts";
import type { TaskActivityView, TaskCommentView } from "./task-contract.ts";

export type AttemptTimelineContent = (
  | { kind: "comment"; occurredAt: string; comment: TaskCommentView }
  | { kind: "activity"; occurredAt: string; activity: TaskActivityView }) & { sequence?: number };

export type TimelineRecord = (
  | { key: string; kind: "comment"; occurredAt: string; comment: TaskCommentView }
  | { key: string; kind: "activity"; occurredAt: string; activity: TaskActivityView }
  | {
      key: string;
      kind: "attempt";
      occurredAt: string;
      activation: ActivationView;
      attempt: AttemptView;
      number: number;
      previousAttempt: AttemptView | null;
      content: AttemptTimelineContent[];
      contentPage?: { olderCursor: string | null; total: number; sourceId?: string };
    }
  | {
      key: string;
      kind: "startup-failure";
      occurredAt: string;
      failure: ActivationStartupFailureView;
      activation: ActivationView;
    }) & { sequence?: number };

export interface TimelineQuery { pageSize?: number; cursor?: string; sourceId?: string; refresh?: boolean }
export interface TimelinePage {
  records: TimelineRecord[];
  olderCursor: string | null;
  newerCursor: string | null;
  refreshCursor: string;
  total: number;
  start: number;
  relatedTasks?: import("./user-task-detail-contract.ts").UserTimelineRelatedTaskView[];
  inspectableSources?: { commentIds: string[]; activityIds: string[] };
}
export interface TaskMovementMetadata extends TaskActivityView {
  type: "task.moved";
  recordId: string;
  sequence: number;
}
export interface MovementMapPage { movements: TaskMovementMetadata[]; cursor: number; total: number }
export type TimelineQueryResult = { available: true; page: TimelinePage } | { available: false; reason: "not-found" | "invalid-page" };
export type MovementMapQueryResult = { available: true; map: MovementMapPage } | { available: false; reason: "not-found" | "invalid-page" };
