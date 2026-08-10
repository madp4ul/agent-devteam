import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type {
  ActivationView,
  AttemptView,
  CollaboratorView,
  ProcessColumnView,
  TaskActivityView,
  TaskCommentView,
} from "../../application/coordination-contract.ts";
import { AttemptTranscriptDialog } from "./AttemptTranscriptDialog.tsx";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { RelativeTime } from "./RelativeTime.tsx";
import { buildTimelineRecords, type AttemptTimelineContent, type TimelineRecord } from "./timeline-model.ts";
import { focusTimelineSource, timelineSourceElementId } from "./timeline-scroll-anchor.ts";

type TimelineAgent = Pick<CollaboratorView, "id" | "name">;
type TimelineColumn = Pick<ProcessColumnView, "id" | "name">;

export function TaskTimeline({
  comments,
  activity,
  activations,
  agents,
  columns,
  transcriptsAvailable = true,
}: {
  comments: TaskCommentView[];
  activity: TaskActivityView[];
  activations: ActivationView[];
  agents: TimelineAgent[];
  columns: TimelineColumn[];
  transcriptsAvailable?: boolean;
}): ReactNode {
  const [transcriptSelection, setTranscriptSelection] = useState<{ attempt: AttemptView; agentName: string }>();
  const [expandedText, setExpandedText] = useState<Set<string>>(() => new Set());
  const records = buildTimelineRecords(comments, activity, activations);
  const context: TimelineContext = { comments, activity, activations, agents, columns };

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
              participants={participantIds(context.agents)}
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
              participants={participantIds(context.agents)}
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
          <TriggerLink record={record} context={context} onSource={onSource} />
          <span>Started <RelativeTime value={attempt.startedAt} /></span>
        </footer>
        {onTranscript === undefined ? null : (
          <div className="attempt-actions">
            <button className="secondary" onClick={() => onTranscript({ attempt, agentName })}>
              View transcript
            </button>
          </div>
        )}
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
  const requestedAgents = [...new Set(context.activations
    .filter((activation) => activation.reason.type === "agent-mention" && activation.reason.sourceEventId === comment.id)
    .map((activation) => nameForAgent(activation.targetAgentId, context.agents)))];
  const requestedUser = /(?:^|[^\w@])@user(?:$|[^A-Za-z0-9_-])/.test(comment.body);
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
        participants={participantIds(context.agents)}
      />
      {requestedAgents.length === 0 && !requestedUser ? null : (
        <p className="comment-consequence">
          Requested {[...requestedAgents, ...(requestedUser ? ["user attention"] : [])].join(", ")}
        </p>
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
  const contents = (
    <>
      <div className="entry-meta">
        <strong>{activityLabel(activity.type)}</strong>
        <RelativeTime value={activity.occurredAt} />
      </div>
      <p>{activityDescription(activity, context.columns)}</p>
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
  participants: Set<string>;
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
        <MentionedText text={text} participants={participants} />
      </p>
      {!expanded && !overflowing ? null : (
        <button className="text-disclosure" aria-controls={id} aria-expanded={expanded} onClick={() => onExpanded(!expanded)}>
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function MentionedText({ text, participants }: { text: string; participants: Set<string> }): ReactNode {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/(?:^|[^\w@])@([A-Za-z0-9][A-Za-z0-9_-]*)/g)) {
    if (match.index === undefined || !participants.has(match[1] ?? "")) continue;
    const mention = `@${match[1]}`;
    const mentionStart = match.index + match[0].lastIndexOf("@");
    if (mentionStart > cursor) parts.push(text.slice(cursor, mentionStart));
    parts.push(<strong className="canonical-mention" key={`${mentionStart}-${mention}`}>{mention}</strong>);
    cursor = mentionStart + mention.length;
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
  if (activity.type === "relationship.created") return "A task relationship was added.";
  if (activity.type === "relationship.satisfied") return "A blocking relationship was satisfied.";
  if (activity.type === "attention.resolved") return `Resolved ${activity.details.reasonType ?? "attention"}.`;
  if (activity.type === "automation.suspended") return "The interrupted activation remains first in line until continued.";
  if (activity.type === "automation.resumed") return "The interrupted activation was continued.";
  if (activity.type === "task.archived") return "Removed from the active board while retaining coordination history.";
  if (activity.type === "task.unarchived") return "Returned to the active board in its retained workflow position.";
  return activityLabel(activity.type);
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

function participantIds(agents: TimelineAgent[]): Set<string> {
  return new Set(["user", ...agents.map((agent) => agent.id)]);
}
