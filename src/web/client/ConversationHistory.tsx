import { useLayoutEffect, useRef, type ReactNode } from "react";

import type { AgentConversationView } from "../../application/browser-transport-contract.ts";
import type { AttemptTranscriptItem, CoordinationTaskIdentity } from "../../application/runtime-contract.ts";
import { ActivityStatusMark, isExceptionalActivityStatus } from "./ActivityStatusMark.tsx";
import { CopyMarkdownButton } from "./CopyMarkdownButton.tsx";
import { MarkdownContent } from "./MarkdownContent.tsx";

export function ConversationHistory({
  conversation,
  selectedAttemptId,
  selectedMessageId,
  onCommentSource,
}: {
  conversation: AgentConversationView;
  selectedAttemptId?: string;
  selectedMessageId?: string;
  onCommentSource?(commentId: string): void;
}): ReactNode {
  const selectedContextRef = useRef<HTMLElement>(null);
  const selectedContextPositioned = useRef(false);

  useLayoutEffect(() => {
    if (
      (selectedAttemptId === undefined && selectedMessageId === undefined) ||
      selectedContextPositioned.current ||
      selectedContextRef.current === null
    ) return;
    const target = selectedContextRef.current;
    selectedContextPositioned.current = true;
    const animationFrame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start" });
      target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [conversation, selectedAttemptId, selectedMessageId]);

  const selectedCause = selectedAttemptId === undefined
    ? undefined
    : conversation.history.find((entry) =>
        (entry.kind === "activation" || entry.kind === "message") && entry.attemptIds.includes(selectedAttemptId)
      );
  const selectedActivationId = selectedCause?.kind === "activation" || selectedCause?.kind === "message"
    ? selectedCause.activationId
    : undefined;
  const causes = conversation.history.filter((entry) => entry.kind === "activation" || entry.kind === "message");
  const active = causes.some(({ status }) => status === "running");
  const queued = causes.some(({ status }) => status === "queued");
  if (conversation.history.length === 0) {
    return <p className="unavailable">This conversation has not started a run yet.</p>;
  }

  return (
    <div className="conversation-stream">
      {conversation.history.map((entry, index) => entry.kind === "continuity-loss" ? (
        <section key={`continuity-${entry.occurredAt}`} className="conversation-system-note warning" role="note">
          <p className="eyebrow">Replacement context</p>
          <p>{entry.reason}</p>
        </section>
      ) : entry.kind === "retirement" ? (
        <section key={`retirement-${entry.retirement.occurredAt}`} className="conversation-system-note" role="note">
          <p className="eyebrow">Conversation retired</p>
          <p>{entry.retirement.reason}</p>
          <small>{entry.retirement.actor.id}</small>
        </section>
      ) : entry.kind === "message" ? (
        <article
          key={`message-${entry.message.id}`}
          className="conversation-message user-message"
          data-conversation-message={entry.message.id}
          tabIndex={-1}
          ref={entry.message.id === selectedMessageId || entry.activationId === selectedActivationId ? selectedContextRef : undefined}
        >
          <header className="conversation-message-heading">
            <CopyMarkdownButton source={entry.message.body} label="Copy your message Markdown" />
          </header>
          <MarkdownContent source={entry.message.body} />
        </article>
      ) : entry.kind === "activation" ? (
        <article
          key={`activation-${entry.activationId}`}
          className="conversation-message activation-message"
          data-conversation-activation={entry.activationId}
          tabIndex={-1}
          ref={entry.activationId === selectedActivationId ? selectedContextRef : undefined}
        >
          <p className="eyebrow">Activation</p>
          <p><strong>{activationReasonLabel(entry.reason.type)}</strong></p>
          {entry.source.kind === "comment" ? <MarkdownContent source={entry.source.comment.body} /> : null}
        </article>
      ) : (
        (() => {
          const item = entry.item;
          const key = item.id ?? `${entry.attemptId}-${index}`;
          return item.kind === "message" ? (
            <article key={key} className="transcript-item message">
              <header className="conversation-message-heading">
                <CopyMarkdownButton source={item.text} label="Copy Codex message Markdown" />
              </header>
              <MarkdownContent source={item.text} />
            </article>
          ) : item.kind === "command" ? (
            <TranscriptToolDisclosure
              key={key}
              articleClassName="transcript-command"
              exceptional={isExceptionalActivityStatus(item.status)}
              detailsClassName="command-details"
              titleClassName="command-title"
              evidenceClassName="command-evidence"
              title="Command"
              status={item.status}
              statusSubject="Command"
              statusClassName="command-status"
              evidence={[
                { label: "Invocation", value: item.command },
                ...(item.output === undefined ? [] : [{ label: "Output", value: item.output }]),
              ]}
            />
          ) : item.kind === "coordination" && item.presentation.kind === "coordination-comment" && item.presentation.body !== undefined ? (
            <CoordinationComment
              key={key}
              id={key}
              item={item}
              body={item.presentation.body}
              {...(onCommentSource === undefined ? {} : { onCommentSource })}
            />
          ) : item.kind === "coordination" ? (
            <CoordinationActivity
              key={key}
              item={item}
            />
          ) : item.kind === "mcp" ? (
            <TranscriptToolDisclosure
              key={key}
              articleClassName="transcript-mcp"
              exceptional={isExceptionalActivityStatus(item.status)}
              detailsClassName="mcp-details"
              titleClassName="mcp-title"
              evidenceClassName="mcp-evidence"
              title={`${humanizeIdentifier(item.server)} · ${humanizeIdentifier(item.tool)}`}
              status={item.status}
              statusSubject="MCP call"
              statusClassName="mcp-status"
              evidence={[
                { label: "Server identifier", value: item.server },
                { label: "Tool identifier", value: item.tool },
                ...(item.rawStatus === undefined ? [] : [{ label: "Raw status", value: item.rawStatus }]),
                ...(item.arguments === undefined ? [] : [{ label: "Arguments", value: structuredLiteral(item.arguments) }]),
                ...(item.result === undefined ? [] : [{ label: "Result", value: structuredLiteral(item.result) }]),
                ...(item.error === undefined ? [] : [{ label: "Failure", value: structuredLiteral(item.error) }]),
              ]}
              {...(item.summary === undefined ? {} : { summary: item.summary })}
            />
          ) : (
            <article key={key} className={`transcript-item ${item.kind} ${item.kind === "tool" && isExceptionalActivityStatus(item.status) ? "exceptional" : ""}`}>
              <p className="eyebrow">{item.kind === "tool" ? `Tool · ${item.name}` : "Diagnostic"}</p>
              {item.kind === "diagnostic" ? (
                <p>{item.text}</p>
              ) : (
                <>
                  <p><strong>{item.summary}</strong> · {item.status}</p>
                  {item.output === undefined ? null : (
                    <details className="tool-output">
                      <summary>View tool output</summary>
                      <pre>{item.output}</pre>
                    </details>
                  )}
                </>
              )}
            </article>
          );
        })()
      ))}
      {active || queued ? (
        <p className="conversation-live-state" role="status" aria-label={queued ? "Follow-up queued" : "Agent working"}>
          {queued
            ? active
              ? `Waiting for ${conversation.owningAgent.name} to finish the current activation.`
              : `Waiting for ${conversation.owningAgent.name}'s next activation to start.`
            : `${conversation.owningAgent.name} is working…`}
        </p>
      ) : null}
    </div>
  );
}

function CoordinationComment({
  id,
  item,
  body,
  onCommentSource,
}: {
  id: string;
  item: CoordinationTranscriptItem;
  body: string;
  onCommentSource?(commentId: string): void;
}): ReactNode {
  const commentId = item.presentation?.kind === "coordination-comment"
    ? item.presentation.commentId
    : undefined;
  const exceptional = coordinationExceptionalPresentation(item);
  return (
    <article className={`transcript-coordination coordination-comment ${exceptional === undefined ? "" : "exceptional"}`} aria-label="Comment added">
      <header className="coordination-activity-heading">
        <strong>Comment added</strong>
        <span className="coordination-activity-actions">
          {commentId === undefined || onCommentSource === undefined ? null : (
            <button type="button" className="secondary quiet-action" onClick={() => onCommentSource(commentId)}>
              View in task history
            </button>
          )}
          <CopyMarkdownButton source={body} label="Copy comment Markdown" />
          <ActivityStatusMark status={item.status} subject="Coordination action" className="coordination-status" />
        </span>
      </header>
      <div id={`coordination-comment-${id}`} className="authored-text conversation-authored-text">
        <MarkdownContent source={body} />
      </div>
      {exceptional === undefined ? null : (
        <p className="coordination-activity-exception">
          <span>{exceptional.label}</span>
          <strong>{exceptional.text}</strong>
        </p>
      )}
    </article>
  );
}

type CoordinationTranscriptItem = Extract<AttemptTranscriptItem, { kind: "coordination" }>;

function CoordinationActivity({ item }: { item: CoordinationTranscriptItem }): ReactNode {
  const presentation = coordinationActivityPresentation(item);
  return (
    <article className={`transcript-coordination coordination-activity ${presentation.exceptional === undefined ? "" : "exceptional"}`} aria-label={presentation.accessibleLabel}>
      <header className="coordination-activity-heading">
        <span className="coordination-activity-title">{presentation.action}</span>
        <ActivityStatusMark status={item.status} subject="Coordination action" className="coordination-status" />
      </header>
      {presentation.facts.length === 0 ? null : (
        <dl className="coordination-activity-facts">
          {presentation.facts.map((fact, index) => (
            <div key={`${fact.label}-${index}`} className="coordination-activity-fact">
              <dt>{fact.label}</dt>
              <dd>{fact.kind === "task" ? <CoordinationTaskReference task={fact.task} /> : <strong>{fact.value}</strong>}</dd>
            </div>
          ))}
        </dl>
      )}
      {presentation.exceptional === undefined ? null : (
        <p className="coordination-activity-exception">
          <span>{presentation.exceptional.label}</span>
          <strong>{presentation.exceptional.text}</strong>
        </p>
      )}
    </article>
  );
}

function CoordinationTaskReference({ task }: { task: CoordinationTaskIdentity }): ReactNode {
  const contents = <>
    {task.id === undefined ? null : <span className="coordination-task-id">{task.id}</span>}
    {task.id === undefined || task.title === undefined ? null : " "}
    {task.title === undefined ? null : <strong>{task.title}</strong>}
  </>;
  return task.id === undefined
    ? (task.title === undefined ? <strong>Requested task</strong> : contents)
    : (
      <a
        className="coordination-task-reference"
        href={`/tasks/${encodeURIComponent(task.id)}`}
        target="_blank"
        rel="noopener noreferrer"
      >{contents}</a>
    );
}

type CoordinationActivityFact =
  | { kind: "value"; label: string; value: string }
  | { kind: "task"; label: string; task: CoordinationTaskIdentity };

function coordinationActivityPresentation(item: CoordinationTranscriptItem): {
  action: string;
  accessibleLabel: string;
  facts: CoordinationActivityFact[];
  exceptional?: { label: "Rejected" | "Failure"; text: string };
} {
  const inspection = item.presentation.kind === "coordination-inspection" ? item.presentation : undefined;
  const childTask = item.presentation.kind === "coordination-child-task" ? item.presentation : undefined;
  const dependency = item.presentation.kind === "coordination-dependency" ? item.presentation : undefined;
  const permissionBlock = item.presentation.kind === "coordination-permission-block" ? item.presentation : undefined;
  let action: string;
  let accessibleLabel: string;
  let facts: CoordinationActivityFact[] = [];
  if (inspection !== undefined) {
    ({ action, facts } = coordinationInspectionActivityPresentation(inspection));
    accessibleLabel = action;
  } else if (childTask !== undefined) {
    action = accessibleLabel = "Create child task";
    facts = childTaskFacts(childTask.task, childTask.columnId);
  } else if (dependency !== undefined) {
    action = accessibleLabel = "Add dependency";
    facts = dependencyFacts(dependency.sourceTask, dependency.targetTask);
  } else if (permissionBlock !== undefined) {
    action = accessibleLabel = "Report permission block";
    facts = permissionBlock.reason === undefined
      ? []
      : [{ kind: "value", label: "Reason", value: permissionBlock.reason }];
  } else switch (item.presentation.kind) {
    case "coordination-task-move": {
      const from = item.presentation.fromColumnId;
      const to = item.presentation.toColumnId;
      action = accessibleLabel = "Move current task";
      facts = [
        ...(from === undefined
          ? []
          : [{ kind: "value" as const, label: "From", value: humanizeIdentifier(from) }]),
        { kind: "value", label: "To", value: to === undefined ? "Requested column" : humanizeIdentifier(to) },
      ];
      break;
    }
    case "coordination-comment": {
      action = accessibleLabel = "Add comment";
      break;
    }
    default:
      action = accessibleLabel = humanizeIdentifier(item.tool);
  }
  const exceptional = coordinationExceptionalPresentation(item);
  return {
    action,
    accessibleLabel,
    facts,
    ...(exceptional === undefined ? {} : { exceptional }),
  };
}

function childTaskFacts(task: CoordinationTaskIdentity, columnId: string | undefined): CoordinationActivityFact[] {
  return [
    { kind: "task", label: "Created task", task },
    ...(columnId === undefined
      ? []
      : [{ kind: "value" as const, label: "Column", value: humanizeIdentifier(columnId) }]),
  ];
}

function dependencyFacts(
  sourceTask: CoordinationTaskIdentity,
  targetTask: CoordinationTaskIdentity,
): CoordinationActivityFact[] {
  return [
    { kind: "task", label: "Task", task: sourceTask },
    { kind: "task", label: "Depends on", task: targetTask },
  ];
}

type CoordinationInspectionPresentation = Extract<
  NonNullable<CoordinationTranscriptItem["presentation"]>,
  { kind: "coordination-inspection" }
>;

function coordinationInspectionActivityPresentation(inspection: CoordinationInspectionPresentation): {
  action: string;
  facts: CoordinationActivityFact[];
} {
  switch (inspection.scope) {
    case "current-task": {
      const column = inspection.columnName ??
        (inspection.columnId === undefined ? undefined : humanizeIdentifier(inspection.columnId));
      return {
        action: "Inspect current task",
        facts: [
          ...(inspection.taskTitle === undefined
            ? []
            : [{ kind: "value" as const, label: "Task", value: inspection.taskTitle }]),
          ...(column === undefined ? [] : [{ kind: "value" as const, label: "Column", value: column }]),
        ],
      };
    }
    case "operating-context": {
      const board = inspection.boardName ??
        (inspection.boardId === undefined ? undefined : humanizeIdentifier(inspection.boardId));
      return {
        action: "Inspect operating context",
        facts: [
          { kind: "task", label: "Task", task: { ...optionalLiteral("id", inspection.taskId) } },
          ...(inspection.processName === undefined ? [] : [{ kind: "value" as const, label: "Process", value: inspection.processName }]),
          ...(board === undefined ? [] : [{ kind: "value" as const, label: "Board", value: board }]),
          ...(inspection.owningAgentName === undefined ? [] : [{ kind: "value" as const, label: "Agent", value: inspection.owningAgentName }]),
        ],
      };
    }
    case "collaborators": {
      const count = inspection.collaboratorCount;
      return {
        action: "List collaborators",
        facts: count === undefined ? [] : [{ kind: "value", label: "Result", value: `${count} ${count === 1 ? "collaborator" : "collaborators"}` }],
      };
    }
    case "board-summaries": {
      const boards = inspection.boards.map(({ id, name }) => name ?? humanizeIdentifier(id)).join(", ");
      return {
        action: "Summarize boards",
        facts: boards.length === 0 ? [] : [{ kind: "value", label: "Boards", value: boards }],
      };
    }
    case "archived-tasks": {
      const count = inspection.taskCount;
      return {
        action: "List archived tasks",
        facts: count === undefined ? [] : [{ kind: "value", label: "Result", value: `${count} archived ${count === 1 ? "task" : "tasks"}` }],
      };
    }
    case "tasks": {
      const board = inspection.board?.name ??
        (inspection.board?.id === undefined ? "Requested board" : humanizeIdentifier(inspection.board.id));
      const columns = inspection.columns.map(({ id, name }) => name ?? humanizeIdentifier(id)).join(", ");
      return {
        action: "List tasks",
        facts: [
          { kind: "value", label: "Board", value: board },
          { kind: "value", label: "Columns", value: columns.length === 0 ? "Requested columns" : columns },
        ],
      };
    }
    case "task":
      return {
        action: "Inspect task",
        facts: [{
          kind: "task",
          label: "Task",
          task: { ...optionalLiteral("id", inspection.taskId), ...optionalLiteral("title", inspection.taskTitle) },
        }],
      };
    case "task-activity":
      return {
        action: "Read task activity",
        facts: [{ kind: "task", label: "Task", task: { ...optionalLiteral("id", inspection.taskId) } }],
      };
    case "task-attachments":
      return {
        action: "Read task attachments",
        facts: [{ kind: "task", label: "Task", task: { ...optionalLiteral("id", inspection.taskId) } }],
      };
  }
}

function coordinationExceptionalPresentation(
  item: CoordinationTranscriptItem,
): { label: "Rejected" | "Failure"; text: string } | undefined {
  if (item.diagnostic === undefined) return undefined;
  return item.diagnostic.kind === "rejection"
    ? { label: "Rejected", text: item.diagnostic.message }
    : { label: "Failure", text: item.diagnostic.message };
}

function optionalLiteral<Key extends string>(key: Key, value: unknown): { [Property in Key]?: string } {
  const string = literalString(value);
  return string === undefined ? {} : { [key]: string } as { [Property in Key]?: string };
}

function literalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function TranscriptToolDisclosure({
  articleClassName,
  exceptional = false,
  detailsClassName,
  titleClassName,
  evidenceClassName,
  title,
  status,
  statusSubject,
  statusClassName,
  evidence,
  summary,
}: {
  articleClassName: string;
  exceptional?: boolean;
  detailsClassName: string;
  titleClassName: string;
  evidenceClassName: string;
  title: string;
  status: string;
  statusSubject: string;
  statusClassName: string;
  evidence: Array<{ label: string; value: string }>;
  summary?: string;
}): ReactNode {
  return (
    <article className={`transcript-tool ${articleClassName} ${exceptional ? "exceptional" : ""}`}>
      <details className={`transcript-tool-details ${detailsClassName}`}>
        <summary>
          <svg className="command-disclosure-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="m5 3.5 5 4.5-5 4.5" />
          </svg>
          <span className={`transcript-tool-title ${titleClassName}`}>{title}</span>
          <ActivityStatusMark status={status} subject={statusSubject} className={statusClassName} />
        </summary>
        <div className={`transcript-tool-evidence ${evidenceClassName}`}>
          {evidence.map((entry) => (
            <div key={entry.label} className="transcript-evidence-entry">
              <p>{entry.label}</p>
              <pre>{entry.value}</pre>
            </div>
          ))}
        </div>
      </details>
      {summary === undefined ? null : <p className="mcp-summary">{summary}</p>}
    </article>
  );
}

function humanizeIdentifier(identifier: string): string {
  const words = identifier
    .replace(/([a-z\d])([A-Z])/gu, "$1 $2")
    .replace(/[_.-]+/gu, " ")
    .trim()
    .toLocaleLowerCase();
  return words.length === 0 ? identifier : `${words[0]!.toLocaleUpperCase()}${words.slice(1)}`;
}

function structuredLiteral(value: unknown): string {
  const formatted = JSON.stringify(value, null, 2);
  return formatted === undefined ? String(value) : formatted;
}

function activationReasonLabel(reason: AgentConversationView["originatingActivation"]["reason"]["type"]): string {
  switch (reason) {
    case "column-entry": return "Entered a watched column";
    case "agent-mention": return "Mentioned in a task comment";
    case "blockers-cleared": return "Final blocker cleared";
    case "user-follow-up": return "User follow-up";
  }
}
