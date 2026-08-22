import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type {
  AgentConversationView,
  AttemptTokenUsage,
  EstimatedTokenCost,
} from "../../application/browser-transport-contract.ts";
import type { AttemptTranscriptItem, CoordinationTaskIdentity } from "../../application/runtime-contract.ts";
import { ActivityStatusMark } from "./ActivityStatusMark.tsx";
import { CopyMarkdownButton } from "./CopyMarkdownButton.tsx";
import { CostEstimate } from "./CostEstimate.tsx";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { MarkdownContent } from "./MarkdownContent.tsx";
import { TextPreview } from "./TextPreview.tsx";

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
    selectedContextRef.current.scrollIntoView({ block: "start" });
    selectedContextPositioned.current = true;
  }, [conversation, selectedAttemptId, selectedMessageId]);

  const history = conversationHistory(conversation);
  const activeRunPresent = conversation.runs.some(({ attempt }) => attempt.status === "running");
  if (history.length === 0) {
    return <p className="unavailable">This conversation has not started a run yet.</p>;
  }

  return (
    <>
      {history.map((entry) => entry.kind === "replacement" ? (
        <section key="replacement" className="conversation-retirement-marker" role="note">
          <p className="eyebrow">Replacement context</p>
          <p>{entry.reason}</p>
        </section>
      ) : entry.kind === "retirement" ? (
        <section key="retirement" className="conversation-retirement-marker" role="note">
          <p className="eyebrow">Conversation retired</p>
          <p>{entry.retirement.reason}</p>
          <small>{entry.retirement.actor.id}</small>
        </section>
      ) : entry.kind === "message" ? (
        <section
          key={`message-${entry.message.id}`}
          className={`conversation-user-turn${entry.awaitingRun ? " awaiting-run" : ""}${
            entry.message.id === selectedMessageId ? " selected-message-turn" : ""
          }`}
          data-conversation-message={entry.message.id}
          ref={selectedAttemptId === undefined && entry.message.id === selectedMessageId
            ? selectedContextRef
            : undefined}
        >
          <article className="conversation-message user-message">
            <header className="conversation-message-heading">
              <p className="eyebrow">You</p>
              <CopyMarkdownButton source={entry.message.body} label="Copy your message Markdown" />
            </header>
            <MarkdownContent source={entry.message.body} />
          </article>
          {entry.awaitingRun ? (
            <div className="conversation-turn-pending" role="status" aria-label="Follow-up queued">
              <span className="signal queued">Queued</span>
              <p>
                {activeRunPresent
                  ? `Waiting for ${conversation.owningAgent.name} to finish the current run.`
                  : `Waiting for ${conversation.owningAgent.name}'s next run to start.`}
              </p>
            </div>
          ) : null}
        </section>
      ) : (
      <section
        className={`conversation-run${entry.run.attempt.id === selectedAttemptId ? " selected-run" : ""}`}
        key={entry.run.attempt.id}
        data-conversation-attempt={entry.run.attempt.id}
        ref={entry.run.attempt.id === selectedAttemptId ? selectedContextRef : undefined}
        aria-labelledby={`run-${entry.run.attempt.id}`}
      >
        <header className="conversation-run-heading">
          <div className="conversation-run-identity">
            <h3 id={`run-${entry.run.attempt.id}`}>Run {entry.runIndex + 1} · {entry.run.attempt.status}</h3>
            <p>{conversation.owningAgent.name}</p>
          </div>
          <div className="conversation-run-metrics">
            <p className="conversation-run-duration">
              <span>Runtime</span> <strong><ElapsedTime startedAt={entry.run.attempt.startedAt} completedAt={entry.run.attempt.completedAt} /></strong>
            </p>
            {entry.run.transcript.available && entry.run.transcript.usage !== undefined
              ? <TokenUsageSummary
                  usage={entry.run.transcript.usage}
                  {...(entry.run.transcript.costEstimate === undefined
                    ? {}
                    : { costEstimate: entry.run.transcript.costEstimate })}
                />
              : null}
          </div>
        </header>
        {entry.run.attempt.threadContinuity === "replaced" ? (
          <p className="unavailable">
            Codex could not resume the prior thread. This run started a replacement thread, so earlier model context was not retained.
          </p>
        ) : null}
        {!entry.run.transcript.available ? (
          <p className="unavailable">
            Codex produced no inspectable evidence for this run.
          </p>
        ) : entry.run.transcript.items.length === 0 ? (
          <p className="unavailable">Codex produced no inspectable conversation items for this run.</p>
        ) : entry.run.transcript.items.map((item, index) => (
          item.kind === "message" ? (
            <article key={item.id ?? `${entry.run.attempt.id}-${index}`} className="transcript-item message">
              <header className="conversation-message-heading">
                <CopyMarkdownButton source={item.text} label="Copy Codex message Markdown" />
              </header>
              <MarkdownContent source={item.text} />
            </article>
          ) : item.kind === "command" ? (
            <TranscriptToolDisclosure
              key={item.id ?? `${entry.run.attempt.id}-${index}`}
              articleClassName="transcript-command"
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
              key={item.id ?? `${entry.run.attempt.id}-${index}`}
              id={item.id ?? `${entry.run.attempt.id}-${index}`}
              item={item}
              body={item.presentation.body}
              {...(onCommentSource === undefined ? {} : { onCommentSource })}
            />
          ) : item.kind === "coordination" ? (
            <CoordinationActivity
              key={item.id ?? `${entry.run.attempt.id}-${index}`}
              item={item}
            />
          ) : item.kind === "mcp" ? (
            <TranscriptToolDisclosure
              key={item.id ?? `${entry.run.attempt.id}-${index}`}
              articleClassName="transcript-mcp"
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
            <article key={item.id ?? `${entry.run.attempt.id}-${index}`} className={`transcript-item ${item.kind}`}>
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
          )
        ))}
            </section>
            ))}
    </>
  );
}

type ConversationHistoryEntry =
  | { kind: "message"; message: AgentConversationView["messages"][number]; awaitingRun: boolean }
  | { kind: "run"; run: AgentConversationView["runs"][number]; runIndex: number }
  | { kind: "retirement"; retirement: NonNullable<AgentConversationView["retirement"]> }
  | { kind: "replacement"; reason: string; occurredAt: string };

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
  const [expanded, setExpanded] = useState(false);
  const commentId = item.presentation?.kind === "coordination-comment"
    ? item.presentation.commentId
    : undefined;
  const exceptional = coordinationExceptionalPresentation(item);
  return (
    <article className="transcript-coordination coordination-comment" aria-label="Comment added">
      <header className="coordination-activity-heading">
        <strong>Comment added</strong>
        <span className="coordination-activity-actions">
          <CopyMarkdownButton source={body} label="Copy comment Markdown" />
          <ActivityStatusMark status={item.status} subject="Coordination action" className="coordination-status" />
        </span>
      </header>
      <TextPreview
        id={`coordination-comment-${id}`}
        text={body}
        expanded={expanded}
        onExpanded={setExpanded}
      />
      {exceptional === undefined ? null : (
        <p className="coordination-activity-exception">
          <span>{exceptional.label}</span>
          <strong>{exceptional.text}</strong>
        </p>
      )}
      {commentId === undefined || onCommentSource === undefined ? null : (
        <footer className="coordination-comment-footer">
          <button type="button" className="quiet-action" onClick={() => onCommentSource(commentId)}>
            View in task history
          </button>
        </footer>
      )}
    </article>
  );
}

type CoordinationTranscriptItem = Extract<AttemptTranscriptItem, { kind: "coordination" }>;

function CoordinationActivity({ item }: { item: CoordinationTranscriptItem }): ReactNode {
  const presentation = coordinationActivityPresentation(item);
  return (
    <article className="transcript-coordination coordination-activity" aria-label={presentation.accessibleLabel}>
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
    <article className={`transcript-tool ${articleClassName}`}>
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

function conversationHistory(conversation: AgentConversationView): ConversationHistoryEntry[] {
  const messages = new Map(conversation.messages.map((message) => [message.id, message]));
  const history: ConversationHistoryEntry[] = [];
  conversation.runs.forEach((run, runIndex) => {
    const message = run.sourceMessageId === undefined ? undefined : messages.get(run.sourceMessageId);
    if (message !== undefined) {
      history.push({ kind: "message", message, awaitingRun: false });
      messages.delete(message.id);
    }
    history.push({ kind: "run", run, runIndex });
  });
  history.push(...[...messages.values()]
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .map((message) => ({ kind: "message" as const, message, awaitingRun: true })));
  if (conversation.retirement !== null) history.push({ kind: "retirement", retirement: conversation.retirement });
  if (conversation.replacementReason !== null) {
    history.push({ kind: "replacement", reason: conversation.replacementReason, occurredAt: conversation.createdAt });
  }
  return history.sort((left, right) => historyEntryTime(left).localeCompare(historyEntryTime(right)));
}

function historyEntryTime(entry: ConversationHistoryEntry): string {
  if (entry.kind === "message") return entry.message.occurredAt;
  if (entry.kind === "run") return entry.run.attempt.startedAt;
  if (entry.kind === "retirement") return entry.retirement.occurredAt;
  return entry.occurredAt;
}

function TokenUsageSummary({
  usage,
  costEstimate,
}: {
  usage: AttemptTokenUsage;
  costEstimate?: EstimatedTokenCost;
}): ReactNode {
  const format = (value: number): string => value.toLocaleString("en-US");
  const uncachedInputTokens = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    <div className="token-usage" role="region" aria-label="Token usage">
      <span>Input <strong>{format(uncachedInputTokens)}</strong></span>
      <span aria-hidden="true">·</span>
      <span>Output <strong>{format(usage.outputTokens)}</strong></span>
      {costEstimate === undefined ? null : <span aria-hidden="true">·</span>}
      <CostEstimate {...(costEstimate === undefined ? {} : { estimate: costEstimate })} />
    </div>
  );
}
