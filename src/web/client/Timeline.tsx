import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type {
  ActivationView,
  AttemptView,
  CollaboratorView,
  ProcessColumnView,
  TaskActivityView,
  TaskCommentView,
  TaskRelationshipView,
} from "../../application/coordination-contract.ts";
import { findParticipantMentions } from "../../application/participant-mentions.ts";
import { AttemptTranscriptDialog } from "./AttemptTranscriptDialog.tsx";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { RelativeTime } from "./RelativeTime.tsx";
import { buildTimelineRecords, type AttemptTimelineContent, type TimelineRecord } from "./timeline-model.ts";
import { focusTimelineSource, timelineSourceElementId } from "./timeline-scroll-anchor.ts";

type TimelineAgent = Pick<CollaboratorView, "id" | "name">;
type TimelineColumn = Pick<ProcessColumnView, "id" | "name">;
type TimelineTask = { id: string; title: string };

export function TaskTimeline({
  comments,
  activity,
  activations,
  agents,
  columns,
  tasks,
  transcriptsAvailable = true,
  onReplyToAgent,
}: {
  comments: TaskCommentView[];
  activity: TaskActivityView[];
  activations: ActivationView[];
  agents: TimelineAgent[];
  columns: TimelineColumn[];
  tasks: TimelineTask[];
  transcriptsAvailable?: boolean;
  onReplyToAgent?(agentId: string): void;
}): ReactNode {
  const [transcriptSelection, setTranscriptSelection] = useState<{ attempt: AttemptView; agentName: string }>();
  const [expandedText, setExpandedText] = useState<Set<string>>(() => new Set());
  const records = buildTimelineRecords(comments, activity, activations);
  const context: TimelineContext = {
    comments,
    activity,
    activations,
    agents,
    columns,
    tasks,
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
    window.setTimeout(() => {
      focusTimelineSource(sourceId);
    });
  };

  return (
    <>
      <section className="timeline-section" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading">Task timeline</h2>
        {records.length === 0 ? <p className="quiet">No task history yet.</p> : (
          <ol className="timeline">
            {records.map((record) => (
              <TimelineRecordView
                key={record.key}
                record={record}
                context={context}
                expandedText={expandedText}
                onTextExpanded={setTextExpanded}
                onSource={followSource}
                {...(transcriptsAvailable ? { onTranscript: setTranscriptSelection } : {})}
              />
            ))}
          </ol>
        )}
      </section>
      {transcriptSelection === undefined ? null : (
        <AttemptTranscriptDialog
          attempt={transcriptSelection.attempt}
          agentName={transcriptSelection.agentName}
          onClose={() => setTranscriptSelection(undefined)}
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
  onReplyToAgent?: (agentId: string) => void;
}

function TimelineRecordView({
  record,
  context,
  expandedText,
  onTextExpanded,
  onSource,
  onTranscript,
}: {
  record: TimelineRecord;
  context: TimelineContext;
  expandedText: Set<string>;
  onTextExpanded(id: string, expanded: boolean): void;
  onSource(sourceId: string): void;
  onTranscript?: (selection: { attempt: AttemptView; agentName: string }) => void;
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
        <ActivityCard activity={record.activity} context={context} />
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
      {...(onTranscript === undefined ? {} : { onTranscript })}
    />
  );
}

function AttemptCard({
  record,
  context,
  expandedText,
  onTextExpanded,
  onSource,
  onTranscript,
}: {
  record: Extract<TimelineRecord, { kind: "attempt" }>;
  context: TimelineContext;
  expandedText: Set<string>;
  onTextExpanded(id: string, expanded: boolean): void;
  onSource(sourceId: string): void;
  onTranscript?: (selection: { attempt: AttemptView; agentName: string }) => void;
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
        {attempt.outcome === null ? null : (
          <section className="attempt-outcome" aria-label="Outcome" data-timeline-record={`outcome-${attempt.id}`}>
            <h3>Outcome</h3>
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
          {onTranscript === undefined ? null : (
            <button className="secondary" onClick={() => onTranscript({ attempt, agentName })}>
              View transcript
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
      <ActivityCard activity={content.activity} context={context} nested />
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
  const author = actorName(comment.actor, context.agents);
  const requestedAgentIds = [...new Set(context.activations
    .filter((activation) => activation.reason.type === "agent-mention" && activation.reason.sourceEventId === comment.id)
    .map((activation) => activation.targetAgentId))];
  const requestedUser = findParticipantMentions(comment.body).some((mention) => mention.participantId === "user");
  const replyAgent = requestedUser && comment.actor.kind === "agent" &&
    context.agents.some((agent) => agent.id === comment.actor.id)
    ? comment.actor.id
    : undefined;
  const contents = (
    <>
      <div className="entry-meta">
        <strong>{nested ? "Commented" : `${author} commented`}</strong>
        <RelativeTime value={comment.occurredAt} />
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
          {replyAgent === undefined || context.onReplyToAgent === undefined ? null : (
            <button className="secondary comment-reply" onClick={() => context.onReplyToAgent?.(replyAgent)}>
              Reply to {nameForAgent(replyAgent, context.agents)}
            </button>
          )}
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

function ActivityCard({ activity, context, nested = false }: {
  activity: TaskActivityView;
  context: TimelineContext;
  nested?: boolean;
}): ReactNode {
  const relationship = relationshipActivityPresentation(activity, context.tasks);
  const contents = (
    <>
      <div className="entry-meta">
        <strong>{relationship?.label ?? activityLabel(activity.type)}</strong>
        <RelativeTime value={activity.occurredAt} />
      </div>
      <p>{relationship === undefined
        ? activityDescription(activity, context.columns)
        : relationshipDescription(relationship)}</p>
      {nested ? null : <small>{actorName(activity.actor, context.agents)}</small>}
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

function TextPreview({ id, text, expanded, onExpanded, participants }: {
  id: string;
  text: string;
  expanded: boolean;
  onExpanded(expanded: boolean): void;
  participants?: Map<string, string>;
}): ReactNode {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || expanded) return;
    const measure = (): void => setOverflowing(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, text]);
  return (
    <div className="authored-text">
      <p id={id} ref={ref} className={`authored-prose${expanded ? " expanded" : ""}`}>
        {participants === undefined ? text : <MentionedText text={text} participants={participants} />}
      </p>
      {!expanded && !overflowing ? null : (
        <button className="text-disclosure" aria-controls={id} aria-expanded={expanded} onClick={() => onExpanded(!expanded)}>
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function MentionedText({ text, participants }: { text: string; participants: Map<string, string> }): ReactNode {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of findParticipantMentions(text)) {
    const participantName = participants.get(match.participantId);
    if (participantName === undefined) continue;
    const mention = text.slice(match.start, match.end);
    if (match.start > cursor) parts.push(text.slice(cursor, match.start));
    parts.push(
      <strong
        className={`canonical-mention ${match.participantId === "user" ? "user-mention" : "agent-mention"}`}
        key={`${match.start}-${mention}`}
        title={participantName}
        aria-label={`${mention}, ${participantName}`}
      >{mention}</strong>,
    );
    cursor = match.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
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
    "attempt.started": "Attempt started",
    "attempt.completed": "Attempt completed",
    "automation.suspended": "Task automation suspended",
    "automation.resumed": "Task automation continued",
    "task.archived": "Task archived",
    "task.unarchived": "Task unarchived",
  }[type];
}

function activityDescription(activity: TaskActivityView, columns: TimelineColumn[]): string {
  if (activity.type === "task.moved") {
    return `${columnName(activity.details.fromColumnId, columns)} → ${columnName(activity.details.toColumnId, columns)}`;
  }
  if (activity.type === "task.created") return `Created in ${columnName(activity.details.columnId, columns)}.`;
  if (activity.type === "task.edited") return "Title or description updated.";
  if (activity.type === "attention.resolved") return `Resolved ${activity.details.reasonType ?? "attention"}.`;
  if (activity.type === "automation.suspended") return "The interrupted activation remains first in line until continued.";
  if (activity.type === "automation.resumed") return "The interrupted activation was continued.";
  if (activity.type === "task.archived") return "Removed from the active board while retaining coordination history.";
  if (activity.type === "task.unarchived") return "Returned to the active board in its retained workflow position.";
  return activityLabel(activity.type);
}

type RelationshipActivityEvent = "created" | "removed" | "satisfied";
type RelationshipActivityRole = "source" | "target";
type RelationshipPresentationText = { label: string; prefix: string; suffix: string };
type RelationshipPresentation = RelationshipPresentationText & { taskName: string };
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
  const taskName = relatedTask?.title ?? relatedTaskId ?? "the related task";
  const relationshipType = activity.details.relationshipType;
  const role = activity.details.relationshipRole;
  if (relationshipType !== "dependency" && relationshipType !== "parent-child") return undefined;
  const event = activity.type.slice("relationship.".length) as RelationshipActivityEvent;
  if (role !== "source" && role !== "target") return undefined;
  return {
    ...directionalRelationshipPresentations[`${relationshipType}:${role}:${event}`],
    taskName,
  };
}

function relationshipDescription(presentation: RelationshipPresentation): ReactNode {
  return (
    <>
      {presentation.prefix}
      <strong className="relationship-task-name">{presentation.taskName}</strong>
      {presentation.suffix}
    </>
  );
}

function reasonLabel(reason: ActivationView["reason"]["type"]): string {
  return {
    "agent-mention": "an agent mention",
    "column-entry": "entering a watched column",
    "blockers-cleared": "the final blocker being cleared",
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
