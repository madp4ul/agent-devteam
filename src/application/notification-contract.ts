/** Durable notification policy and occurrence facts. */
export interface NotificationPolicyView {
  enabled: boolean;
  causes: { userMention: boolean; failedRun: boolean };
  boards: Array<{
    id: string;
    name: string;
    columns: Array<{ id: string; name: string; enabled: boolean }>;
  }>;
}

export interface UpdateNotificationPolicyCommand {
  change:
    | { type: "global"; enabled: boolean }
    | { type: "cause"; cause: "user-mention" | "failed-run"; enabled: boolean }
    | { type: "column"; boardId: string; columnId: string; enabled: boolean };
}

export type UpdateNotificationPolicyResult =
  | { accepted: true; policy: NotificationPolicyView }
  | { accepted: false; reason: "not-found"; policy: NotificationPolicyView };

export interface NotificationOccurrenceView {
  id: string;
  type: "user-mention" | "failed-run" | "column-entry";
  occurredAt: string;
  task: { id: string; title: string; boardId: string; boardName: string };
  destination?: { boardId: string; boardName: string; columnId: string; columnName: string };
  attentionReasonId?: string;
}

export interface NotificationOccurrenceBatch {
  cursor: number;
  occurrences: NotificationOccurrenceView[];
}
