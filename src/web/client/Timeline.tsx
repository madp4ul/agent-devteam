import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type {
  ActivationView,
  AgentInspectableTaskContentView,
  AttemptView,
  CollaboratorView,
  ProcessColumnView,
  TaskAttentionView,
  TaskActivityView,
  TaskCommentView,
  TaskRelationshipView,
  UserTimelineRelatedTaskView,
} from "../../application/browser-transport-contract.ts";
import { findParticipantMentions } from "../../application/participant-mentions.ts";
import { AgentConversationDialog } from "./AgentConversationDialog.tsx";
import { AgentInspectableMarker } from "./AgentInspectableMarker.tsx";
import { MarkUserMentionAddressed } from "./AttentionReasonAction.tsx";
import { CopyMarkdownButton } from "./CopyMarkdownButton.tsx";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { RelativeTime } from "./RelativeTime.tsx";
import { TextPreview } from "./TextPreview.tsx";
import {
  buildTimelineRecords,
  filterTimelineRecordsForAgents,
  type AttemptTimelineContent,
  type TimelineRecord,
} from "./timeline-model.ts";
import {
  captureTimelineViewportAnchor,
  focusTimelineSource,
  restoreTimelineViewportAnchor,
  timelineSourceElementId,
  type TimelineViewportAnchor,
} from "./timeline-scroll-anchor.ts";

type TimelineAgent = Pick<CollaboratorView, "id" | "name">;
type TimelineColumn = Pick<ProcessColumnView, "id" | "name">;
type TimelineTask = UserTimelineRelatedTaskView;
type ConversationSelection = {
  conversationId: string;
  selectedAttemptRunning: boolean;
  selectedAttemptId?: string;
  selectedMessageId?: string;
  pendingActivationId?: string;
};

export function TaskTimeline({
  taskId,
  comments,
  activity,
  activations,
  agents,
  columns,
  tasks,
  unresolvedAttention,
  transcriptsAvailable = true,
  onReplyToAgent,
  onAttentionChanged,
  onAttentionError,
  sourceRequest,
  agentInspectableContent,
}: {
  taskId: string;
  comments: TaskCommentView[];
  activity: TaskActivityView[];
  activations: ActivationView[];
  agents: TimelineAgent[];
  columns: TimelineColumn[];
  tasks: TimelineTask[];
  unresolvedAttention: TaskAttentionView[];
  transcriptsAvailable?: boolean;
  onReplyToAgent?(agentId: string, attentionReasonId?: string): void | Promise<void>;
  onAttentionChanged(): Promise<void>;
  onAttentionError(error: unknown): void;
  sourceRequest?: { sourceId: string; sequence: number };
  agentInspectableContent: AgentInspectableTaskContentView;
}): ReactNode {
  const [conversationSelection, setConversationSelection] = useState<ConversationSelection>();
  const [expandedText, setExpandedText] = useState<Set<string>>(() => new Set());
  const [agentInspectableOnly, setAgentInspectableOnly] = useState(false);
  const pendingFilterAnchor = useRef<TimelineViewportAnchor | null>(null);
  const records = buildTimelineRecords(comments, activity, activations);
  const visibleRecords = agentInspectableOnly
    ? filterTimelineRecordsForAgents(records, agentInspectableContent)
    : records;
  const context: TimelineContext = {
    comments,
    activity,
    activations,
    agents,
    columns,
    tasks,
    unresolvedAttention,
    agentInspectableContent,
    onAttentionChanged,
    onAttentionError,
    ...(onReplyToAgent === undefined ? {} : { onReplyToAgent }),
  };

  const setTextExpanded = (id: string, expanded: boolean): void => {
    setExpandedText((current) => {
      const next = new Set(current);
      if (expanded) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const followSource = (sourceId: string): void => {
    setTextExpanded(`comment-${sourceId}`, true);
    setTextExpanded(`activity-${sourceId}`, true);
    window.setTimeout(() => {
      focusTimelineSource(sourceId);
    });
  };
  useEffect(() => {
    if (sourceRequest !== undefined) followSource(sourceRequest.sourceId);
  }, [sourceRequest?.sequence]);
  useLayoutEffect(() => {
    restoreTimelineViewportAnchor(pendingFilterAnchor.current);
    pendingFilterAnchor.current = null;
  }, [agentInspectableOnly]);

  const setInspectableFilter = (enabled: boolean): void => {
    pendingFilterAnchor.current = captureTimelineViewportAnchor();
    setAgentInspectableOnly(enabled);
  };

  return (
    <>
      <section className="timeline-section" aria-labelledby="timeline-heading">
        <div className="timeline-heading-row">
          <h2 id="timeline-heading" tabIndex={-1}>Task timeline</h2>
          <fieldset className="timeline-filters" aria-label="Filter task timeline">
            <legend>Filter</legend>
            <label className="timeline-filter-option">
              <input
                type="checkbox"
                checked={agentInspectableOnly}
                onChange={(event) => setInspectableFilter(event.currentTarget.checked)}
              />
              <span>Visible to agents</span>
            </label>
          </fieldset>
        </div>
        {records.length === 0 ? <p className="quiet">No task history yet.</p> : visibleRecords.length === 0 ? (
          <p className="quiet timeline-empty">No timeline content matches this filter.</p>
        ) : (
          <ol className="timeline">
            {visibleRecords.map((record) => (
              <TimelineRecordView
                key={record.key}
                record={record}
                context={context}
                expandedText={expandedText}
                onTextExpanded={setTextExpanded}
                onSource={followSource}
                agentInspectableOnly={agentInspectableOnly}
                {...(transcriptsAvailable ? { onConversation: setConversationSelection } : {})}
              />
            ))}
          </ol>
        )}
      </section>
      {conversationSelection === undefined ? null : (
        <AgentConversationDialog
          taskId={taskId}
          conversationId={conversationSelection.conversationId}
          selectedAttemptRunning={conversationSelection.selectedAttemptRunning}
          {...(conversationSelection.selectedAttemptId === undefined
            ? {}
            : { selectedAttemptId: conversationSelection.selectedAttemptId })}
          {...(conversationSelection.selectedMessageId === undefined
            ? {}
            : { selectedMessageId: conversationSelection.selectedMessageId })}
          {...(conversationSelection.pendingActivationId === undefined
            ? {}
            : { selectedPendingActivationId: conversationSelection.pendingActivationId })}
          onClose={() => setConversationSelection(undefined)}
          onCommentSource={followSource}
          agentInspectableContent={agentInspectableContent}
        />
      )}
    </>
  );
}

interface TimelineContext {
  comments: TaskCommentView[];
  activity: TaskActivityView[];
  activations: ActivationView[];
  agents: TimelineAgent[];
  columns: TimelineColumn[];
  tasks: TimelineTask[];
  unresolvedAttention: TaskAttentionView[];
  agentInspectableContent: AgentInspectableTaskContentView;
  onReplyToAgent?: (agentId: string, attentionReasonId?: string) => void | Promise<void>;
  onAttentionChanged(): Promise<void>;
  onAttentionError(error: unknown): void;
}

function TimelineRecordView({
  record,
  context,
  expandedText,
  onTextExpanded,
  onSource,
  onConversation,
  agentInspectableOnly,
}: {
  record: TimelineRecord;
  context: TimelineContext;
  expandedText: Set<string>;
  onTextExpanded(id: string, expanded: boolean): void;
  onSource(sourceId: string): void;
  onConversation?: (selection: ConversationSelection) => void;
  agentInspectableOnly: boolean;
}): ReactNode {
  if (record.kind === "comment") {
    return (
      <li className="timeline-entry comment-entry" data-timeline-record={record.comment.id}>
        <div className="timeline-marker" aria-hidden="true">✎</div>
        <CommentCard
          comment={record.comment}
          context={context}
          expanded={expandedText.has(`comment-${record.comment.id}`)}
          onExpanded={(expanded) => onTextExpanded(`comment-${record.comment.id}`, expanded)}
        />
      </li>
    );
  }
  if (record.kind === "activity") {
    return (
      <li
        className={`timeline-entry event-entry${record.activity.type === "task.moved" ? " movement-entry" : ""}`}
        data-timeline-record={record.activity.id}
      >
        <div className="timeline-marker" aria-hidden="true">{record.activity.type === "task.moved" ? "→" : "◆"}</div>
        <ActivityCard
          activity={record.activity}
          context={context}
          expanded={expandedText.has(`activity-${record.activity.id}`)}
          onExpanded={(expanded) => onTextExpanded(`activity-${record.activity.id}`, expanded)}
          {...(onConversation === undefined ? {} : { onConversation })}
        />
      </li>
    );
  }
  if (record.kind === "startup-failure") {
    const agentName = nameForAgent(record.activation.targetAgentId, context.agents);
    return (
      <li className="timeline-entry attempt-entry failed-attempt" data-timeline-record={record.activation.id}>
        <div className="timeline-marker" aria-hidden="true">!</div>
        <article id={timelineSourceElementId(record.activation.id)} tabIndex={-1}>
          <div className="entry-meta">
            <strong>{agentName} · Startup failed before attempt</strong>
            <RelativeTime value={record.occurredAt} />
          </div>
          <div className="diagnostic">
            <TextPreview
              id={`startup-${record.activation.id}`}
              text={record.failure.diagnostic}
              markdown={false}
              expanded={expandedText.has(`startup-${record.activation.id}`)}
              onExpanded={(expanded) => onTextExpanded(`startup-${record.activation.id}`, expanded)}
            />
          </div>
          <small>Boundary: {record.failure.boundary}. No Codex attempt or thread started.</small>
        </article>
      </li>
    );
  }

  return (
    <AttemptCard
      record={record}
      context={context}
      expandedText={expandedText}
      onTextExpanded={onTextExpanded}
      onSource={onSource}
      agentInspectableOnly={agentInspectableOnly}
      {...(onConversation === undefined ? {} : { onConversation })}
    />
  );
}

function AttemptCard({
  record,
  context,
  expandedText,
  onTextExpanded,
  onSource,
  onConversation,
  agentInspectableOnly,
}: {
  record: Extract<TimelineRecord, { kind: "attempt" }>;
  context: TimelineContext;
  expandedText: Set<string>;
  onTextExpanded(id: string, expanded: boolean): void;
  onSource(sourceId: string): void;
  onConversation?: (selection: ConversationSelection) => void;
  agentInspectableOnly: boolean;
}): ReactNode {
  const { attempt, activation } = record;
  const agentName = nameForAgent(activation.targetAgentId, context.agents);
  const status = attemptStatus(attempt);
  const outcomeTextId = `outcome-${attempt.id}`;
  return (
    <li className={`timeline-entry attempt-entry ${status.className}`} data-timeline-record={attempt.id}>
      <div className="timeline-marker" aria-hidden="true">▶</div>
      <article id={timelineSourceElementId(attempt.id)} tabIndex={-1}>
        <div className="entry-meta attempt-heading">
          <strong className="attempt-agent-name">{agentName}</strong>
          <span className="attempt-timing">
            <span className="attempt-status">{status.label}</span>
            {" · "}<span className="attempt-number">Attempt {record.number}</span>{" · "}
            {attempt.completedAt === null ? (
              <><ElapsedTime startedAt={attempt.startedAt} completedAt={attempt.completedAt} /> elapsed</>
            ) : (
              <><RelativeTime value={attempt.completedAt} />{" · "}<ElapsedTime startedAt={attempt.startedAt} completedAt={attempt.completedAt} /></>
            )}
          </span>
        </div>
        {agentInspectableOnly || attempt.outcome === null ? null : (
          <section className="attempt-outcome" aria-label="Outcome" data-timeline-record={`outcome-${attempt.id}`}>
            <div className="entry-meta authored-heading">
              <h3>Outcome</h3>
              <CopyMarkdownButton source={attempt.outcome.summary} label="Copy outcome Markdown" />
            </div>
            <TextPreview
              id={outcomeTextId}
              text={attempt.outcome.summary}
              expanded={expandedText.has(outcomeTextId)}
              onExpanded={(expanded) => onTextExpanded(outcomeTextId, expanded)}
            />
          </section>
        )}
        {record.content.length === 0 ? null : (
          <ol className="attempt-history" aria-label={`Attempt ${record.number} activity`}>
            {record.content.map((content) => (
              <AttemptContentView
                key={content.kind === "comment" ? `comment-${content.comment.id}` : `activity-${content.activity.id}`}
                content={content}
                context={context}
                expandedText={expandedText}
                onTextExpanded={onTextExpanded}
              />
            ))}
          </ol>
        )}
        <footer className="attempt-footer">
          <div className="attempt-metadata">
            <TriggerLink record={record} context={context} onSource={onSource} />
            <span>Started <RelativeTime value={attempt.startedAt} /></span>
          </div>
          {onConversation === undefined || activation.conversationId === null ? null : (
            <button
              className="secondary"
              onClick={() => onConversation({
                conversationId: activation.conversationId!,
                selectedAttemptRunning: attempt.status === "running",
                selectedAttemptId: attempt.id,
              })}
            >
              View conversation
            </button>
          )}
        </footer>
      </article>
    </li>
  );
}

function AttemptContentView({
  content,
  context,
  expandedText,
  onTextExpanded,
}: {
  content: AttemptTimelineContent;
  context: TimelineContext;
  expandedText: Set<string>;
  onTextExpanded(id: string, expanded: boolean): void;
}): ReactNode {
  if (content.kind === "comment") {
    const textId = `comment-${content.comment.id}`;
    return (
      <li className="attempt-history-item nested-comment">
        <CommentCard
          comment={content.comment}
          context={context}
          nested
          expanded={expandedText.has(textId)}
          onExpanded={(expanded) => onTextExpanded(textId, expanded)}
        />
      </li>
    );
  }
  return (
    <li className={`attempt-history-item nested-activity${content.activity.type === "task.moved" ? " nested-movement" : ""}`}>
      <ActivityCard
        activity={content.activity}
        context={context}
        nested
        expanded={expandedText.has(`activity-${content.activity.id}`)}
        onExpanded={(expanded) => onTextExpanded(`activity-${content.activity.id}`, expanded)}
      />
    </li>
  );
}

function CommentCard({ comment, context, nested = false, expanded, onExpanded }: {
  comment: TaskCommentView;
  context: TimelineContext;
  nested?: boolean;
  expanded: boolean;
  onExpanded(expanded: boolean): void;
}): ReactNode {
  const [replyPending, setReplyPending] = useState(false);
  const author = actorName(comment.actor, context.agents);
  const requestedAgentIds = [...new Set(context.activations
    .filter((activation) => activation.reason.type === "agent-mention" && activation.reason.sourceEventId === comment.id)
    .map((activation) => activation.targetAgentId))];
  const requestedUser = findParticipantMentions(comment.body).some((mention) => mention.participantId === "user");
  const userAttention = context.unresolvedAttention.find(
    (reason) => reason.type === "user-mention" && reason.sourceEventId === comment.id,
  );
  const replyAgent = requestedUser && comment.actor.kind === "agent" &&
    context.agents.some((agent) => agent.id === comment.actor.id)
    ? comment.actor.id
    : undefined;
  const contents = (
    <>
      <div className="entry-meta">
        <strong>{nested ? "Commented" : `${author} commented`}</strong>
        <span className="entry-meta-actions">
          <RelativeTime value={comment.occurredAt} />
          <CopyMarkdownButton source={comment.body} label="Copy comment Markdown" />
          {context.agentInspectableContent.commentIds.includes(comment.id) ? <AgentInspectableMarker /> : null}
        </span>
      </div>
      <TextPreview
        id={`comment-${comment.id}`}
        text={comment.body}
        expanded={expanded}
        onExpanded={onExpanded}
        participants={participantNamesById(context.agents)}
      />
      {requestedAgentIds.length === 0 && !requestedUser ? null : (
        <div className="comment-coordination">
          <p className="comment-consequence">
            <span>Requested{" "}</span>
            {requestedAgentIds.map((agentId, index) => (
              <span key={agentId}>
                {index === 0 ? null : ", "}
                <strong className="participant-highlight agent-mention">{nameForAgent(agentId, context.agents)}</strong>
              </span>
            ))}
            {requestedUser ? (
              <span>
                {requestedAgentIds.length === 0 ? null : ", "}
                <strong className="participant-highlight user-mention">user attention</strong>
              </span>
            ) : null}
          </p>
          <span className="comment-actions">
            {userAttention === undefined ? null : (
              <MarkUserMentionAddressed
                attentionReasonId={userAttention.id}
                onResolved={context.onAttentionChanged}
                onError={context.onAttentionError}
              />
            )}
            {replyAgent === undefined || context.onReplyToAgent === undefined ? null : (
              <button
                className="secondary comment-reply"
                disabled={replyPending}
                onClick={() => {
                  setReplyPending(true);
                  void Promise.resolve(context.onReplyToAgent?.(replyAgent, userAttention?.id))
                    .finally(() => setReplyPending(false));
                }}
              >
                {replyPending ? "Preparing reply…" : `Reply to ${nameForAgent(replyAgent, context.agents)}`}
              </button>
            )}
          </span>
        </div>
      )}
    </>
  );
  return nested ? (
    <section id={timelineSourceElementId(comment.id)} data-timeline-record={comment.id} tabIndex={-1}>{contents}</section>
  ) : (
    <article id={timelineSourceElementId(comment.id)} tabIndex={-1}>{contents}</article>
  );
}

function ActivityCard({ activity, context, nested = false, expanded, onExpanded, onConversation }: {
  activity: TaskActivityView;
  context: TimelineContext;
  nested?: boolean;
  expanded: boolean;
  onExpanded(expanded: boolean): void;
  onConversation?: (selection: ConversationSelection) => void;
}): ReactNode {
  const relationship = relationshipActivityPresentation(activity, context.tasks);
  const conversationId = activity.type === "conversation.continued" ? activity.details.conversationId : undefined;
  const activationId = activity.type === "conversation.continued" ? activity.details.activationId : undefined;
  const messageId = activity.type === "conversation.continued" ? activity.details.messageId : undefined;
  const label = activity.type === "conversation.retired"
    ? `Conversation retired · ${nameForAgent(activity.details.targetAgentId ?? "the agent", context.agents)}`
    : (relationship?.label ?? activityLabel(activity.type));
  const contents = (
    <>
      <div className="entry-meta">
        <strong>{label}</strong>
        <span className="entry-meta-actions">
          <RelativeTime value={activity.occurredAt} />
          {activity.type === "conversation.continued" && activity.details.messageBody !== undefined ? (
            <CopyMarkdownButton source={activity.details.messageBody} label="Copy message Markdown" />
          ) : null}
          {context.agentInspectableContent.activityIds.includes(activity.id) ? <AgentInspectableMarker /> : null}
        </span>
      </div>
      {(activity.type === "conversation.continued" && activity.details.messageBody !== undefined) ||
        (activity.type === "conversation.retired" && activity.details.reason !== undefined) ? (
        <TextPreview
          id={`activity-${activity.id}`}
          text={activity.type === "conversation.retired" ? activity.details.reason! : activity.details.messageBody!}
          expanded={expanded}
          onExpanded={onExpanded}
        />
      ) : (
        <p>{relationship === undefined
          ? activityDescription(activity, context.columns, context.agents)
          : relationshipDescription(relationship)}</p>
      )}
      {nested ? null : (
        <footer className="activity-footer">
          <small>{actorName(activity.actor, context.agents)}</small>
          {onConversation === undefined || conversationId === undefined || activationId === undefined || messageId === undefined ? null : (
            <button
              className="secondary"
              onClick={() => onConversation({
                conversationId,
                selectedAttemptRunning: false,
                selectedMessageId: messageId,
                pendingActivationId: activationId,
              })}
            >
              View conversation
            </button>
          )}
        </footer>
      )}
    </>
  );
  return nested ? (
    <section id={timelineSourceElementId(activity.id)} data-timeline-record={activity.id} tabIndex={-1}>{contents}</section>
  ) : (
    <article id={timelineSourceElementId(activity.id)} tabIndex={-1}>{contents}</article>
  );
}

function TriggerLink({
  record,
  context,
  onSource,
}: {
  record: Extract<TimelineRecord, { kind: "attempt" }>;
  context: TimelineContext;
  onSource(sourceId: string): void;
}): ReactNode {
  if (record.previousAttempt !== null) {
    const previousNumber = record.number - 1;
    return (
      <span>
        Triggered by retry after{" "}
        <a
          href={`#${timelineSourceElementId(record.previousAttempt.id)}`}
          onClick={(event) => {
            event.preventDefault();
            onSource(record.previousAttempt!.id);
          }}
        >
          Attempt {previousNumber} failed
        </a>
      </span>
    );
  }
  const sourceId = record.activation.reason.sourceEventId;
  const comment = context.comments.find((candidate) => candidate.id === sourceId);
  if (comment !== undefined) {
    return <SourceLink sourceId={sourceId} label={`${actorName(comment.actor, context.agents)} commenting`} onSource={onSource} />;
  }
  const activity = context.activity.find((candidate) => candidate.id === sourceId);
  if (activity !== undefined) {
    return <SourceLink sourceId={sourceId} label={triggerDescription(activity, context)} onSource={onSource} />;
  }
  const conversationContinuation = context.activity.find((candidate) =>
    candidate.type === "conversation.continued" && candidate.details.messageId === sourceId,
  );
  if (conversationContinuation !== undefined) {
    return <SourceLink
      sourceId={conversationContinuation.id}
      label="the conversation continuation"
      onSource={onSource}
    />;
  }
  return <span>Triggered by {reasonLabel(record.activation.reason.type)}</span>;
}

function SourceLink({ sourceId, label, onSource }: {
  sourceId: string;
  label: string;
  onSource(sourceId: string): void;
}): ReactNode {
  return (
    <span>
      Triggered by{" "}
      <a
        href={`#${timelineSourceElementId(sourceId)}`}
        onClick={(event) => {
          event.preventDefault();
          onSource(sourceId);
        }}
      >{label}</a>
    </span>
  );
}

function attemptStatus(attempt: AttemptView): { label: string; className: string } {
  if (attempt.outcome?.status === "permission-blocked") return { label: "Permission blocked", className: "failed-attempt" };
  if (attempt.outcome?.status === "user-interrupted") return { label: "Interrupted", className: "interrupted-attempt" };
  if (attempt.outcome?.status === "failed" || attempt.status === "failed") return { label: "Failed", className: "failed-attempt" };
  if (attempt.completedAt !== null) return { label: "Completed", className: "completed-attempt" };
  return { label: "Running", className: "running-attempt" };
}

function triggerDescription(activity: TaskActivityView, context: TimelineContext): string {
  const actor = actorName(activity.actor, context.agents);
  if (activity.type === "task.moved") {
    return `${actor} moving the task to ${columnName(activity.details.toColumnId, context.columns)}`;
  }
  if (activity.type === "task.created") {
    return `task creation in ${columnName(activity.details.columnId, context.columns)}`;
  }
  if (activity.type === "relationship.satisfied") return "the final blocker being cleared";
  return `${actor} ${activityLabel(activity.type).toLocaleLowerCase()}`;
}

function activityLabel(type: TaskActivityView["type"]): string {
  return {
    "task.created": "Task created",
    "task.edited": "Task edited",
    "task.moved": "Task moved",
    "relationship.created": "Relationship created",
    "relationship.removed": "Relationship removed",
    "relationship.satisfied": "Relationship satisfied",
    "attention.created": "Attention requested",
    "attention.resolved": "Attention resolved",
    "activation.created": "Activation queued",
    "activation.dismissed": "Activation dismissed",
    "attempt.started": "Attempt started",
    "attempt.completed": "Attempt completed",
    "automation.suspended": "Task automation suspended",
    "automation.resumed": "Task automation continued",
    "conversation.continued": "Conversation continued",
    "conversation.retired": "Conversation retired",
    "task.archived": "Task archived",
    "task.unarchived": "Task unarchived",
  }[type];
}

function activityDescription(activity: TaskActivityView, columns: TimelineColumn[], agents: TimelineAgent[]): string {
  if (activity.type === "task.moved") {
    return `${columnName(activity.details.fromColumnId, columns)} → ${columnName(activity.details.toColumnId, columns)}`;
  }
  if (activity.type === "task.created") return `Created in ${columnName(activity.details.columnId, columns)}.`;
  if (activity.type === "task.edited") return "Title or description updated.";
  if (activity.type === "attention.resolved") return `Resolved ${activity.details.reasonType ?? "attention"}.`;
  if (activity.type === "activation.dismissed") {
    return activity.details.clearedSuspension === "true"
      ? "The interrupted activation will not continue; task automation may advance."
      : "The selected activation will not run.";
  }
  if (activity.type === "automation.suspended") return "The interrupted activation remains first in line until continued.";
  if (activity.type === "automation.resumed") return "The interrupted activation was continued.";
  if (activity.type === "task.archived") return "Removed from the active board while retaining coordination history.";
  if (activity.type === "task.unarchived") return "Returned to the active board in its retained workflow position.";
  if (activity.type === "conversation.retired") {
    return `Retired ${nameForAgent(activity.details.targetAgentId ?? "the agent", agents)}'s current conversation.`;
  }
  return activityLabel(activity.type);
}

type RelationshipActivityEvent = "created" | "removed" | "satisfied";
type RelationshipActivityRole = "source" | "target";
type RelationshipPresentationText = { label: string; prefix: string; suffix: string };
type RelationshipPresentation = RelationshipPresentationText & {
  taskId?: string;
  taskName: string;
  available: boolean;
  completed: boolean;
  archived: boolean;
};
type DirectionalRelationshipKey = `${TaskRelationshipView["type"]}:${RelationshipActivityRole}:${RelationshipActivityEvent}`;

const directionalRelationshipPresentations = {
  "dependency:source:created": { label: "Dependency added", prefix: "Now depends on ", suffix: "." },
  "dependency:source:removed": { label: "Dependency removed", prefix: "Does not depend on ", suffix: " anymore." },
  "dependency:source:satisfied": { label: "Dependency satisfied", prefix: "", suffix: " completed, satisfying this dependency." },
  "dependency:target:created": { label: "Blocking dependency added", prefix: "Now blocks ", suffix: "." },
  "dependency:target:removed": { label: "Blocking dependency removed", prefix: "No longer blocks ", suffix: "." },
  "dependency:target:satisfied": { label: "Blocking dependency satisfied", prefix: "Completed and stopped blocking ", suffix: "." },
  "parent-child:source:created": { label: "Child task added", prefix: "", suffix: " was added as a child task." },
  "parent-child:source:removed": { label: "Child task removed", prefix: "", suffix: " is no longer a child task." },
  "parent-child:source:satisfied": { label: "Child task completed", prefix: "", suffix: " completed, satisfying this child relationship." },
  "parent-child:target:created": { label: "Parent task added", prefix: "", suffix: " was added as the parent task." },
  "parent-child:target:removed": { label: "Parent task removed", prefix: "", suffix: " is no longer the parent task." },
  "parent-child:target:satisfied": { label: "Parent task unblocked", prefix: "Completed and stopped blocking ", suffix: "." },
} satisfies Record<DirectionalRelationshipKey, RelationshipPresentationText>;

function relationshipActivityPresentation(
  activity: TaskActivityView,
  tasks: TimelineTask[],
): RelationshipPresentation | undefined {
  if (
    activity.type !== "relationship.created" &&
    activity.type !== "relationship.removed" &&
    activity.type !== "relationship.satisfied"
  ) return undefined;

  const relatedTaskId = activity.details.relatedTaskId;
  const relatedTask = tasks.find((task) => task.id === relatedTaskId);
  const taskName = relatedTask?.available === true ? relatedTask.title : relatedTaskId ?? "the related task";
  const relationshipType = activity.details.relationshipType;
  const role = activity.details.relationshipRole;
  if (relationshipType !== "dependency" && relationshipType !== "parent-child") return undefined;
  const event = activity.type.slice("relationship.".length) as RelationshipActivityEvent;
  if (role !== "source" && role !== "target") return undefined;
  return {
    ...directionalRelationshipPresentations[`${relationshipType}:${role}:${event}`],
    ...(relatedTaskId === undefined ? {} : { taskId: relatedTaskId }),
    taskName,
    available: relatedTask?.available === true,
    completed: relatedTask?.available === true && relatedTask.completed,
    archived: relatedTask?.available === true && relatedTask.archived,
  };
}

function relationshipDescription(presentation: RelationshipPresentation): ReactNode {
  return (
    <>
      {presentation.prefix}
      {presentation.taskId === undefined || !presentation.available ? (
        <strong className="relationship-task-name">{presentation.taskName}</strong>
      ) : (
        <a
          className="relationship-task-name"
          href={`/tasks/${encodeURIComponent(presentation.taskId)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {presentation.taskName}
        </a>
      )}
      {!presentation.available && presentation.taskId !== undefined ? " (currently unavailable)" : null}
      {presentation.completed ? " (completed)" : null}
      {presentation.archived ? " (archived)" : null}
      {presentation.suffix}
    </>
  );
}

function reasonLabel(reason: ActivationView["reason"]["type"]): string {
  return {
    "agent-mention": "an agent mention",
    "column-entry": "entering a watched column",
    "blockers-cleared": "the final blocker being cleared",
    "user-follow-up": "a user follow-up",
  }[reason];
}

function actorName(actor: TaskCommentView["actor"] | TaskActivityView["actor"], agents: TimelineAgent[]): string {
  if (actor.kind === "user") return "You";
  if (actor.kind === "framework") return "Coordination framework";
  return nameForAgent(actor.id, agents);
}

function nameForAgent(agentId: string, agents: TimelineAgent[]): string {
  return agents.find((agent) => agent.id === agentId)?.name ?? agentId;
}

function columnName(columnId: string | undefined, columns: TimelineColumn[]): string {
  if (columnId === undefined) return "the selected column";
  return columns.find((column) => column.id === columnId)?.name ?? columnId;
}

function participantNamesById(agents: TimelineAgent[]): Map<string, string> {
  return new Map([["user", "User"], ...agents.map((agent) => [agent.id, agent.name] as const)]);
}
