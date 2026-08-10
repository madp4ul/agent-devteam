import type {
  ActivationStartupFailureView,
  ActivationView,
  AttemptView,
  TaskActivityView,
  TaskCommentView,
} from "../../application/coordination-contract.ts";

export type AttemptTimelineContent =
  | { kind: "comment"; occurredAt: string; comment: TaskCommentView }
  | { kind: "activity"; occurredAt: string; activity: TaskActivityView };

export type TimelineRecord =
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
    }
  | {
      key: string;
      kind: "startup-failure";
      occurredAt: string;
      failure: ActivationStartupFailureView;
      activation: ActivationView;
    };

const foldedActivityTypes = new Set<TaskActivityView["type"]>([
  "activation.created",
  "attempt.started",
  "attempt.completed",
  "attention.created",
]);

export function buildTimelineRecords(
  comments: TaskCommentView[],
  activity: TaskActivityView[],
  activations: ActivationView[],
): TimelineRecord[] {
  const groupedCommentIds = new Set(
    comments.flatMap((comment) => comment.attemptId === undefined ? [] : [comment.id]),
  );
  const groupedActivityIds = new Set(
    activity.flatMap((entry) => entry.details.attemptId === undefined ? [] : [entry.id]),
  );
  const attempts = activations.flatMap((activation) =>
    activation.attempts.map((attempt, index): TimelineRecord => ({
      key: `attempt-${attempt.id}`,
      kind: "attempt",
      occurredAt: attempt.startedAt,
      activation,
      attempt,
      number: index + 1,
      previousAttempt: activation.attempts[index - 1] ?? null,
      content: [
        ...comments.flatMap((comment): AttemptTimelineContent[] =>
          comment.attemptId === attempt.id
            ? [{ kind: "comment", occurredAt: comment.occurredAt, comment }]
            : [],
        ),
        ...activity.flatMap((entry): AttemptTimelineContent[] =>
          entry.details.attemptId === attempt.id && !foldedActivityTypes.has(entry.type)
            ? [{ kind: "activity", occurredAt: entry.occurredAt, activity: entry }]
            : [],
        ),
      ].sort(newestFirst),
    })),
  );
  const startupFailures = activations.flatMap((activation): TimelineRecord[] =>
    activation.startupFailure === null
      ? []
      : [{
          key: `startup-failure-${activation.id}`,
          kind: "startup-failure",
          occurredAt: activation.startupFailure.occurredAt,
          failure: activation.startupFailure,
          activation,
        }],
  );

  return [
    ...comments.flatMap((comment): TimelineRecord[] =>
      groupedCommentIds.has(comment.id)
        ? []
        : [{ key: `comment-${comment.id}`, kind: "comment", occurredAt: comment.occurredAt, comment }],
    ),
    ...activity.flatMap((entry): TimelineRecord[] =>
      groupedActivityIds.has(entry.id) || foldedActivityTypes.has(entry.type)
        ? []
        : [{ key: `activity-${entry.id}`, kind: "activity", occurredAt: entry.occurredAt, activity: entry }],
    ),
    ...attempts,
    ...startupFailures,
  ].sort(newestFirst);
}

function newestFirst(left: { occurredAt: string }, right: { occurredAt: string }): number {
  return right.occurredAt.localeCompare(left.occurredAt);
}
