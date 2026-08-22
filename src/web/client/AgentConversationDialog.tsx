import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import type {
  AgentConversationView,
  AttemptTokenUsage,
} from "../../application/browser-transport-contract.ts";
import type { AttemptTranscriptItem, CoordinationTaskIdentity } from "../../application/runtime-contract.ts";
import { continueAgentConversation, readAgentConversation, retireAgentConversation } from "./api.ts";
import { ActivityStatusMark } from "./ActivityStatusMark.tsx";
import { CloseIconButton } from "./CloseIconButton.tsx";
import { CopyMarkdownButton } from "./CopyMarkdownButton.tsx";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { errorMessage } from "./feedback.ts";
import { useLatestRefresh, usePolling } from "./live-refresh.ts";
import { MarkdownContent } from "./MarkdownContent.tsx";
import { Modal } from "./Modal.tsx";
import { MoreActionsIconButton } from "./MoreActionsIconButton.tsx";
import { TextPreview } from "./TextPreview.tsx";

const ACTIVE_CONVERSATION_POLL_INTERVAL_MILLISECONDS = 1_000;
const IDLE_CONVERSATION_POLL_INTERVAL_MILLISECONDS = 2_000;

export function AgentConversationDialog({
  taskId,
  conversationId,
  selectedAttemptRunning,
  selectedAttemptId,
  selectedMessageId,
  selectedPendingActivationId,
  onClose,
}: {
  taskId: string;
  conversationId: string;
  selectedAttemptRunning: boolean;
  selectedAttemptId?: string;
  selectedMessageId?: string;
  selectedPendingActivationId?: string;
  onClose(): void;
}): ReactNode {
  const [conversation, setConversation] = useState<AgentConversationView>();
  const [conversationRunning, setConversationRunning] = useState(
    selectedAttemptRunning || selectedPendingActivationId !== undefined,
  );
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string>();
  const [retirementOpen, setRetirementOpen] = useState(false);
  const [retirementReason, setRetirementReason] = useState("");
  const [retirementSubmitting, setRetirementSubmitting] = useState(false);
  const [retirementError, setRetirementError] = useState<string>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const moreActionsButtonRef = useRef<HTMLButtonElement>(null);
  const retirementReasonRef = useRef<HTMLTextAreaElement>(null);
  const pendingScrollPosition = useRef<number | "bottom" | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const retirementIdempotencyKey = useRef(crypto.randomUUID());
  const pendingActivationId = useRef<string | undefined>(selectedPendingActivationId);
  const selectedContextPositioned = useRef(false);

  useLayoutEffect(() => {
    if (pendingScrollPosition.current === null || contentRef.current === null) return;
    contentRef.current.scrollTop = pendingScrollPosition.current === "bottom"
      ? contentRef.current.scrollHeight
      : pendingScrollPosition.current;
    pendingScrollPosition.current = null;
  }, [conversation]);

  useLayoutEffect(() => {
    if (
      (selectedAttemptId === undefined && selectedMessageId === undefined) ||
      selectedContextPositioned.current ||
      contentRef.current === null
    ) return;
    const candidates = [...contentRef.current.querySelectorAll<HTMLElement>(
      "[data-conversation-attempt], [data-conversation-message]",
    )];
    const selectedContext = selectedAttemptId === undefined
      ? candidates.find((element) => element.dataset.conversationMessage === selectedMessageId)
      : candidates.find((element) => element.dataset.conversationAttempt === selectedAttemptId);
    if (selectedContext === undefined) return;
    selectedContext.scrollIntoView({ block: "start" });
    selectedContextPositioned.current = true;
  }, [conversation, selectedAttemptId, selectedMessageId]);

  const refresh = useLatestRefresh(
    () => readAgentConversation(taskId, conversationId),
    (result) => {
        if (result.available) {
          const content = contentRef.current;
          pendingScrollPosition.current = content === null
            ? null
            : content.scrollHeight - content.clientHeight - content.scrollTop <= 32
              ? "bottom"
              : content.scrollTop;
          setConversation(result.conversation);
          const pendingAppeared = pendingActivationId.current !== undefined &&
            result.conversation.runs.some((run) => run.activationId === pendingActivationId.current);
          if (pendingAppeared) pendingActivationId.current = undefined;
          setConversationRunning(
            result.conversation.runs.some((run) => run.attempt.status === "running") ||
            (pendingActivationId.current !== undefined && !pendingAppeared),
          );
          setUnavailable(false);
          setError(undefined);
        } else {
          setUnavailable(true);
        }
    },
  );
  useEffect(() => {
    void refresh().catch((caught) => setError(errorMessage(caught)));
  }, [conversationId, refresh, refreshVersion, taskId]);
  usePolling(
    refresh,
    conversationRunning
      ? ACTIVE_CONVERSATION_POLL_INTERVAL_MILLISECONDS
      : IDLE_CONVERSATION_POLL_INTERVAL_MILLISECONDS,
    (caught) => setError(errorMessage(caught)),
  );

  const submitFollowUp = async (): Promise<void> => {
    if (draft.trim().length === 0 || submitting || conversation?.continuation.available !== true) return;
    setSubmitting(true);
    setSubmissionError(undefined);
    try {
      const result = await continueAgentConversation(
        taskId,
        conversationId,
        draft,
        idempotencyKey.current,
      );
      if (!result.accepted) throw new Error(`Follow-up unavailable: ${result.reason}`);
      pendingActivationId.current = result.activationId;
      setConversationRunning(true);
      setConversation((current) => current === undefined || current.messages.some(({ id }) => id === result.message.id)
        ? current
        : { ...current, messages: [...current.messages, result.message] });
      setDraft("");
      idempotencyKey.current = crypto.randomUUID();
      setRefreshVersion((version) => version + 1);
    } catch (caught) {
      setSubmissionError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };
  const history = conversation === undefined ? [] : conversationHistory(conversation);
  const activeRunPresent = conversation?.runs.some(({ attempt }) => attempt.status === "running") ?? false;
  const submitRetirement = async (): Promise<void> => {
    if (conversation === undefined || retirementReason.trim().length === 0 || retirementSubmitting) return;
    setRetirementSubmitting(true);
    setRetirementError(undefined);
    try {
      const result = await retireAgentConversation(
        taskId,
        conversation.id,
        retirementReason,
        retirementIdempotencyKey.current,
      );
      if (!result.accepted) throw new Error(`Retirement unavailable: ${result.reason}`);
      setConversation((current) => current === undefined
        ? current
        : {
            ...current,
            retirement: result.retirement,
            retirementAvailability: { available: false, reason: "already-retired" },
            latestActivityAt: result.retirement.occurredAt,
          });
      setRetirementOpen(false);
      setRetirementReason("");
      retirementIdempotencyKey.current = crypto.randomUUID();
      setRefreshVersion((version) => version + 1);
    } catch (caught) {
      setRetirementError(errorMessage(caught));
    } finally {
      setRetirementSubmitting(false);
    }
  };
  const closeRetirement = (): void => {
    if (retirementSubmitting) return;
    setRetirementOpen(false);
    setRetirementError(undefined);
    window.requestAnimationFrame(() => moreActionsButtonRef.current?.focus());
  };

  return (
    <>
    <Modal
      labelledBy="conversation-title"
      className="transcript-modal"
      backdropClassName="transcript-backdrop"
      initialFocusRef={closeButtonRef}
      onClose={onClose}
    >
        <header className="modal-heading">
          <div className="conversation-heading-copy">
            <p className="eyebrow" id="conversation-title">Agent conversation</p>
            {conversation === undefined ? (
              <h2>Loading…</h2>
            ) : (
              <div className="conversation-title-row">
                <h2>{conversation.owningAgent.name}</h2>
                {conversation.retirement === null ? null : <span className="conversation-retired-label">Retired</span>}
                <p className="conversation-origin-summary">
                  <span>Origin</span> · {activationReasonLabel(conversation.originatingActivation.reason.type)}
                </p>
              </div>
            )}
          </div>
          <div className="transcript-header-actions">
            {conversation === undefined ? null : <ConversationActionsMenu
              buttonRef={moreActionsButtonRef}
              threadId={conversation.currentThreadId}
              retirementAvailable={conversation.retirementAvailability.available}
              retirementUnavailableMessage={conversation.retirementAvailability.available
                ? undefined
                : retirementAvailabilityMessage(conversation)}
              onRetire={() => {
                setRetirementError(undefined);
                setRetirementOpen(true);
              }}
            />}
            <CloseIconButton buttonRef={closeButtonRef} label="Close conversation" onClick={onClose} />
          </div>
        </header>
        <div ref={contentRef} className="transcript-content">
          {error !== undefined ? (
            <p className="unavailable" role="alert">{error}</p>
          ) : unavailable ? (
            <p className="unavailable">
              This conversation is unavailable. Durable coordination history remains complete.
            </p>
          ) : conversation === undefined ? (
            <p className="unavailable">Loading conversation…</p>
          ) : history.length === 0 ? (
            <p className="unavailable">This conversation has not started a run yet.</p>
          ) : (<>
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
                    ? <TokenUsageSummary usage={entry.run.transcript.usage} />
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
                ) : item.kind === "mcp" && item.server === "coordination" && item.tool === "add_comment" && coordinationCommentBody(item) !== undefined ? (
                  <CoordinationComment
                    key={item.id ?? `${entry.run.attempt.id}-${index}`}
                    id={item.id ?? `${entry.run.attempt.id}-${index}`}
                    status={item.status}
                    body={coordinationCommentBody(item)!}
                  />
                ) : item.kind === "mcp" && item.server === "coordination" ? (
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
          </>)}
          {conversation === undefined ? null : (
            <form
              className="conversation-composer"
              aria-label="Continue conversation"
              onSubmit={(event) => {
                event.preventDefault();
                void submitFollowUp();
              }}
            >
              <label htmlFor={`conversation-follow-up-${conversation.id}`}>Follow-up message</label>
              <textarea
                id={`conversation-follow-up-${conversation.id}`}
                rows={3}
                value={draft}
                disabled={!conversation.continuation.available || submitting}
                onChange={(event) => setDraft(event.target.value)}
              />
              {!conversation.continuation.available ? (
                <p className="unavailable">{continuationUnavailableMessage(conversation.continuation.reason)}</p>
              ) : null}
              {submissionError === undefined ? null : <p className="unavailable" role="alert">{submissionError}</p>}
              <div className="conversation-composer-actions">
                <button type="submit" disabled={draft.trim().length === 0 || submitting || !conversation.continuation.available}>
                  {submitting ? "Sending…" : "Send follow-up"}
                </button>
              </div>
            </form>
          )}
        </div>
    </Modal>
    {conversation === undefined || !retirementOpen ? null : (
      <Modal
        labelledBy="retirement-confirmation-title"
        className="retirement-confirmation"
        initialFocusRef={retirementReasonRef}
        onClose={closeRetirement}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitRetirement();
          }}
        >
          <div className="retirement-confirmation-copy">
            <h2 id="retirement-confirmation-title">Retire conversation?</h2>
            <p>
              Ordinary activations will stop reusing this conversation. Its history will remain readable and explicitly continuable.
            </p>
          </div>
          <label htmlFor={`conversation-retirement-reason-${conversation.id}`}>
            Reason for retirement
            <textarea
              ref={retirementReasonRef}
              id={`conversation-retirement-reason-${conversation.id}`}
              rows={3}
              value={retirementReason}
              disabled={retirementSubmitting}
              onChange={(event) => setRetirementReason(event.target.value)}
              required
            />
          </label>
          {retirementError === undefined ? null : <p className="unavailable" role="alert">{retirementError}</p>}
          <div className="dialog-actions">
            <button type="button" className="secondary" disabled={retirementSubmitting} onClick={closeRetirement}>Cancel</button>
            <button
              type="submit"
              className="destructive"
              disabled={retirementReason.trim().length === 0 || retirementSubmitting}
            >
              {retirementSubmitting ? "Retiring…" : "Retire conversation"}
            </button>
          </div>
        </form>
      </Modal>
    )}
    </>
  );
}

type ConversationHistoryEntry =
  | { kind: "message"; message: AgentConversationView["messages"][number]; awaitingRun: boolean }
  | { kind: "run"; run: AgentConversationView["runs"][number]; runIndex: number }
  | { kind: "retirement"; retirement: NonNullable<AgentConversationView["retirement"]> }
  | { kind: "replacement"; reason: string; occurredAt: string };

function coordinationCommentBody(item: {
  presentation?: { kind: string; body?: string };
  arguments?: unknown;
}): string | undefined {
  if (item.presentation?.kind === "coordination-comment") return item.presentation.body;
  if (typeof item.arguments !== "object" || item.arguments === null || Array.isArray(item.arguments)) return undefined;
  const body = (item.arguments as Record<string, unknown>).body;
  return typeof body === "string" && body.length > 0 ? body : undefined;
}

function CoordinationComment({ id, status, body }: { id: string; status: string; body: string }): ReactNode {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="transcript-coordination coordination-comment" aria-label="Comment added">
      <header className="coordination-activity-heading">
        <strong>Comment added</strong>
        <span className="coordination-activity-actions">
          <CopyMarkdownButton source={body} label="Copy comment Markdown" />
          <ActivityStatusMark status={status} subject="Coordination action" className="coordination-status" />
        </span>
      </header>
      <TextPreview
        id={`coordination-comment-${id}`}
        text={body}
        expanded={expanded}
        onExpanded={setExpanded}
      />
    </article>
  );
}

type CoordinationTranscriptItem = Extract<AttemptTranscriptItem, { kind: "mcp" }>;

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
  const arguments_ = literalRecord(item.arguments);
  const result = coordinationResultRecord(item.result);
  const inspection = item.presentation?.kind === "coordination-inspection" ? item.presentation : undefined;
  const childTask = item.presentation?.kind === "coordination-child-task" ? item.presentation : undefined;
  const dependency = item.presentation?.kind === "coordination-dependency" ? item.presentation : undefined;
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
  } else switch (item.tool) {
    case "move_current_task": {
      const transition = literalRecord(result?.transition);
      const from = item.presentation?.kind === "coordination-task-move"
        ? item.presentation.fromColumnId
        : literalString(transition?.fromColumnId);
      const to = item.presentation?.kind === "coordination-task-move"
        ? item.presentation.toColumnId
        : literalString(transition?.toColumnId) ?? literalString(arguments_?.destinationColumnId);
      action = accessibleLabel = "Move current task";
      facts = [
        ...(from === undefined
          ? []
          : [{ kind: "value" as const, label: "From", value: humanizeIdentifier(from) }]),
        { kind: "value", label: "To", value: to === undefined ? "Requested column" : humanizeIdentifier(to) },
      ];
      break;
    }
    case "create_child_task": {
      const task = literalRecord(result?.task);
      action = accessibleLabel = "Create child task";
      facts = childTaskFacts(
        { ...optionalLiteral("id", task?.id), ...optionalLiteral("title", task?.title ?? arguments_?.title) },
        literalString(task?.columnId) ?? literalString(arguments_?.columnId),
      );
      break;
    }
    case "add_dependency": {
      const relationship = literalRecord(result?.relationship);
      action = accessibleLabel = "Add dependency";
      facts = dependencyFacts(
        { ...optionalLiteral("id", relationship?.sourceTaskId) },
        { ...optionalLiteral("id", relationship?.targetTaskId ?? arguments_?.targetTaskId) },
      );
      break;
    }
    case "report_permission_block": {
      action = accessibleLabel = "Report permission block";
      const reason = literalString(arguments_?.summary);
      facts = reason === undefined ? [] : [{ kind: "value", label: "Reason", value: reason }];
      break;
    }
    default:
      action = accessibleLabel = humanizeIdentifier(item.tool);
  }
  const exceptional = coordinationExceptionalPresentation(item, result);
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
  result: Record<string, unknown> | undefined,
): { label: "Rejected" | "Failure"; text: string } | undefined {
  if (item.status === "rejected") {
    const reason = literalString(result?.reason);
    return { label: "Rejected", text: reason === undefined ? "The request was rejected." : humanizeIdentifier(reason) };
  }
  if (item.status !== "failed") return undefined;
  const error = literalRecord(item.error);
  return {
    label: "Failure",
    text: normalizedCoordinationFailure(literalString(error?.message) ?? literalString(item.error)),
  };
}

function normalizedCoordinationFailure(diagnostic: string | undefined): string {
  if (diagnostic === undefined || /^coordination call failed\.?$/iu.test(diagnostic.trim())) {
    return "The coordination call did not complete.";
  }
  return diagnostic.trim().replace(/^failed:\s*/iu, "").replace(/\s+failed\.?$/iu, " did not complete.");
}

function optionalLiteral<Key extends string>(key: Key, value: unknown): { [Property in Key]?: string } {
  const string = literalString(value);
  return string === undefined ? {} : { [key]: string } as { [Property in Key]?: string };
}

function coordinationResultRecord(value: unknown): Record<string, unknown> | undefined {
  const direct = literalRecord(value);
  if (direct === undefined) return parseLiteralRecord(value);
  if (direct.transition !== undefined || direct.accepted !== undefined || direct.task !== undefined) return direct;
  if (!Array.isArray(direct.content)) return direct;
  for (const entry of direct.content) {
    const parsed = parseLiteralRecord(literalString(literalRecord(entry)?.text));
    if (parsed !== undefined) return parsed;
  }
  return direct;
}

function parseLiteralRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return literalRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function literalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
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

function retirementAvailabilityMessage(conversation: AgentConversationView): string {
  if (conversation.retirementAvailability.available) {
    return "Retirement is available because this conversation has no unfinished activation work.";
  }
  switch (conversation.retirementAvailability.reason) {
    case "already-retired": return "This conversation is retired. Ordinary activations will not return to it.";
    case "task-archived": return "Archived task conversations cannot be retired.";
    case "activation-work-pending": return "Finish, dismiss, interrupt, or recover this agent's unfinished work before retiring the conversation.";
  }
}

function continuationUnavailableMessage(
  reason: Extract<AgentConversationView["continuation"], { available: false }>["reason"],
): string {
  switch (reason) {
    case "task-archived": return "Archived task conversations cannot be continued.";
    case "owning-agent-unavailable": return "The owning agent is no longer available in the applied process.";
    case "thread-unavailable": return "This conversation has no resumable Codex thread.";
  }
}

function activationReasonLabel(reason: AgentConversationView["originatingActivation"]["reason"]["type"]): string {
  switch (reason) {
    case "column-entry": return "Column entry";
    case "agent-mention": return "Agent mention";
    case "blockers-cleared": return "Blockers cleared";
    case "user-follow-up": return "User follow-up";
  }
}

function TokenUsageSummary({ usage }: { usage: AttemptTokenUsage }): ReactNode {
  const format = (value: number): string => value.toLocaleString("en-US");
  const uncachedInputTokens = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    <div className="token-usage" role="region" aria-label="Token usage">
      <span>Input <strong>{format(uncachedInputTokens)}</strong></span>
      <span aria-hidden="true">·</span>
      <span>Output <strong>{format(usage.outputTokens)}</strong></span>
    </div>
  );
}

function ConversationActionsMenu({
  buttonRef,
  threadId,
  retirementAvailable,
  retirementUnavailableMessage,
  onRetire,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  threadId?: string | null;
  retirementAvailable: boolean;
  retirementUnavailableMessage?: string | undefined;
  onRetire(): void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [buttonRef, open]);

  return (
    <div ref={containerRef} className="conversation-actions-menu">
      <MoreActionsIconButton
        buttonRef={buttonRef}
        expanded={open}
        label="More conversation actions"
        onClick={() => setOpen((current) => !current)}
      />
      {open ? (
        <div
          className="conversation-actions-options"
          role="menu"
          aria-label="Conversation actions"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              buttonRef.current?.focus();
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
            const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
            const nextIndex = event.key === "Home" ? 0
              : event.key === "End" ? items.length - 1
              : event.key === "ArrowDown" ? (currentIndex + 1) % items.length
              : (currentIndex - 1 + items.length) % items.length;
            items[nextIndex]?.focus();
          }}
        >
          {threadId == null ? null : (
            <button
              ref={firstItemRef}
              type="button"
              role="menuitem"
              onClick={() => {
                void navigator.clipboard.writeText(threadId).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy thread ID"}
            </button>
          )}
          <button
            ref={threadId == null ? firstItemRef : undefined}
            type="button"
            role="menuitem"
            className="conversation-retire-menu-item"
            aria-disabled={!retirementAvailable}
            aria-describedby={!retirementAvailable ? "conversation-retirement-unavailable" : undefined}
            title={retirementUnavailableMessage}
            onClick={() => {
              if (!retirementAvailable) return;
              setOpen(false);
              onRetire();
            }}
          >
            Retire conversation
          </button>
          {retirementAvailable || retirementUnavailableMessage === undefined ? null : (
            <span id="conversation-retirement-unavailable" className="visually-hidden">
              {retirementUnavailableMessage}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
