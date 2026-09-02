import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import type { CollaboratorView } from "../../application/browser-transport-contract.ts";
import {
  findPartialParticipantMention,
  findParticipantMentions,
} from "../../application/participant-mentions.ts";

import { addTaskComment } from "./api.ts";
import { errorMessage } from "./feedback.ts";
import {
  captureTimelineViewportAnchor,
  restoreTimelineViewportAnchor,
} from "./timeline-scroll-anchor.ts";

export interface TaskCommentReplyIntent {
  taskId: string;
  agentId: string;
  sequence: number;
}

export function TaskCommentComposition({
  taskId,
  collaborators,
  mostRecentTaskAgentId,
  replyIntent,
  composerAvailable,
  onCommentAccepted,
  children,
}: {
  taskId: string;
  collaborators: CollaboratorView[];
  mostRecentTaskAgentId: string | undefined;
  replyIntent: TaskCommentReplyIntent | undefined;
  composerAvailable: boolean;
  onCommentAccepted(): Promise<void>;
  children: ReactNode;
}): ReactNode {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const handledReplySequence = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (
      !composerAvailable ||
      replyIntent === undefined ||
      replyIntent.taskId !== taskId ||
      handledReplySequence.current === replyIntent.sequence
    ) return;
    handledReplySequence.current = replyIntent.sequence;
    const mention = `@${replyIntent.agentId}`;
    const next = containsMention(draft, replyIntent.agentId)
      ? draft
      : `${draft}${draft.length === 0 || /\s$/.test(draft) ? "" : " "}${mention} `;
    const selectionStart = draft.length === 0 ? next.length : inputRef.current?.selectionStart;
    const selectionEnd = draft.length === 0 ? next.length : inputRef.current?.selectionEnd;
    setDraft(next);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      if (selectionStart !== undefined && selectionEnd !== undefined) {
        inputRef.current?.setSelectionRange(selectionStart, selectionEnd);
      }
    });
  }, [composerAvailable, draft, replyIntent, taskId]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const flow = flowRef.current;
    if (flow === null) return;
    if (!composerAvailable || panel === null) {
      flow.style.removeProperty("--comment-composer-height");
      return;
    }
    const placeholder = panel.parentElement;
    if (placeholder === null) return;
    let dockingThresholdHeight = panel.getBoundingClientRect().height;
    let docked = false;
    const synchronizeHeight = (): void => synchronizeComposerHeight(panel, flow);
    const synchronizeDocking = (): void => {
      const bounds = placeholder.getBoundingClientRect();
      flow.style.setProperty("--comment-composer-left", `${bounds.left}px`);
      flow.style.setProperty("--comment-composer-width", `${bounds.width}px`);
      if (!docked) dockingThresholdHeight = panel.getBoundingClientRect().height;
      docked = bounds.top + dockingThresholdHeight <= window.innerHeight;
      panel.classList.toggle("comment-panel-docked", docked);
    };
    const synchronizeLayout = (): void => {
      synchronizeHeight();
      synchronizeDocking();
    };
    synchronizeLayout();
    const observer = new ResizeObserver(synchronizeHeight);
    observer.observe(panel, { box: "border-box" });
    window.addEventListener("scroll", synchronizeDocking, { passive: true });
    window.addEventListener("resize", synchronizeLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", synchronizeDocking);
      window.removeEventListener("resize", synchronizeLayout);
      panel.classList.remove("comment-panel-docked");
      flow.style.removeProperty("--comment-composer-left");
      flow.style.removeProperty("--comment-composer-width");
    };
  }, [composerAvailable, taskId]);

  return (
    <div className="comment-timeline-flow" ref={flowRef}>
      {composerAvailable ? (
        <div data-task-section="comment">
          <TaskCommentForm
            taskId={taskId}
            collaborators={collaborators}
            mostRecentTaskAgentId={mostRecentTaskAgentId}
            body={draft}
            inputRef={inputRef}
            panelRef={panelRef}
            flowRef={flowRef}
            onBodyChanged={setDraft}
            onCommentAccepted={onCommentAccepted}
          />
        </div>
      ) : null}
      <div data-task-section="timeline">{children}</div>
    </div>
  );
}

function TaskCommentForm({
  taskId,
  collaborators,
  mostRecentTaskAgentId,
  body,
  inputRef,
  panelRef,
  flowRef,
  onBodyChanged,
  onCommentAccepted,
}: {
  taskId: string;
  collaborators: CollaboratorView[];
  mostRecentTaskAgentId: string | undefined;
  body: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  panelRef: React.RefObject<HTMLElement | null>;
  flowRef: React.RefObject<HTMLDivElement | null>;
  onBodyChanged(body: string): void;
  onCommentAccepted(): Promise<void>;
}): ReactNode {
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [selectionStart, setSelectionStart] = useState(0);
  const [activeSuggestionId, setActiveSuggestionId] = useState<string>();
  const [dismissedMention, setDismissedMention] = useState<string>();
  const participants: MentionParticipant[] = [
    ...collaborators.map((agent) => ({ ...agent, token: `@${agent.id}` as const })),
    { id: "user", name: "User", summary: "The person overseeing the process.", token: "@user" },
  ];
  const mention = findPartialParticipantMention(body, selectionStart);
  const mentionKey = mention === undefined ? undefined : `${mention.start}:${mention.query}`;
  const suggestions = mention === undefined || dismissedMention === mentionKey
    ? []
    : participants.filter((participant) => {
      const query = mention.query.toLocaleLowerCase();
      return participant.id.toLocaleLowerCase().includes(query) ||
        participant.name.toLocaleLowerCase().includes(query) ||
        participant.summary.toLocaleLowerCase().includes(query);
    });
  const preferredSuggestionId = mention?.query.length === 0 &&
      collaborators.some((collaborator) => collaborator.id === mostRecentTaskAgentId)
    ? mostRecentTaskAgentId
    : undefined;
  const selectedSuggestion = Math.max(0, suggestions.findIndex((suggestion) =>
    suggestion.id === (activeSuggestionId ?? preferredSuggestionId)
  ));

  useLayoutEffect(() => {
    const textarea = inputRef.current;
    const panel = panelRef.current;
    const flow = flowRef.current;
    if (textarea === null || panel === null || flow === null) return;
    const fitDraft = (): void => fitTextarea(textarea, panel, flow);
    fitDraft();
    window.addEventListener("resize", fitDraft);
    return () => window.removeEventListener("resize", fitDraft);
  }, [body, flowRef, inputRef, panelRef]);

  const updateSelection = (element: HTMLTextAreaElement): void => setSelectionStart(element.selectionStart);
  const insertMention = (participant: MentionParticipant): void => {
    if (mention === undefined) return;
    const next = `${body.slice(0, mention.start)}${participant.token} ${body.slice(selectionStart)}`;
    const nextSelection = mention.start + participant.token.length + 1;
    onBodyChanged(next);
    setSelectionStart(nextSelection);
    setDismissedMention(undefined);
    setActiveSuggestionId(undefined);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextSelection, nextSelection);
    });
  };
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const viewportAnchor = captureTimelineViewportAnchor();
    const restoreCompositionContext = (): void => {
      window.requestAnimationFrame(() => {
        restoreTimelineViewportAnchor(viewportAnchor);
        inputRef.current?.focus({ preventScroll: true });
      });
    };
    setPending(true);
    setError(undefined);
    try {
      await addTaskComment(taskId, body, idempotencyKey);
      onBodyChanged("");
      setSelectionStart(0);
      setIdempotencyKey(crypto.randomUUID());
      setPending(false);
      await onCommentAccepted();
      restoreCompositionContext();
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
      restoreCompositionContext();
    }
  };

  return (
    <section ref={panelRef} className="detail-panel comment-panel" aria-labelledby="comment-heading">
      <h2 id="comment-heading">Add comment</h2>
      <form onSubmit={(event) => void submit(event)}>
        <div className="mention-composer">
          <textarea
            ref={inputRef}
            aria-label="Comment"
            aria-autocomplete="list"
            aria-controls={suggestions.length === 0 ? undefined : "mention-participants"}
            aria-expanded={suggestions.length > 0}
            aria-activedescendant={suggestions.length === 0
              ? undefined
              : `mention-participant-${suggestions[selectedSuggestion]?.id}`}
            rows={2}
            value={body}
            onChange={(event) => {
              const panel = panelRef.current;
              const flow = flowRef.current;
              if (panel !== null && flow !== null) fitTextarea(event.currentTarget, panel, flow);
              onBodyChanged(event.currentTarget.value);
              setDismissedMention(undefined);
              setActiveSuggestionId(undefined);
              updateSelection(event.currentTarget);
            }}
            onClick={(event) => updateSelection(event.currentTarget)}
            onKeyUp={(event) => updateSelection(event.currentTarget)}
            onKeyDown={(event) => {
              if (suggestions.length === 0) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const direction = event.key === "ArrowDown" ? 1 : -1;
                setActiveSuggestionId(
                  suggestions[(selectedSuggestion + direction + suggestions.length) % suggestions.length]?.id,
                );
              } else if (event.key === "Enter") {
                event.preventDefault();
                const participant = suggestions[selectedSuggestion];
                if (participant !== undefined) insertMention(participant);
              } else if (event.key === "Escape") {
                event.preventDefault();
                setDismissedMention(mentionKey);
              }
            }}
          />
          <button className="comment-submit" disabled={pending || body.trim().length === 0} type="submit">
            {pending ? "Posting…" : "Post"}
          </button>
        </div>
        {suggestions.length === 0 ? null : (
          <ul id="mention-participants" className="mention-options" role="listbox" aria-label="Mention participants">
            {suggestions.map((participant, index) => (
              <li
                key={participant.id}
                id={`mention-participant-${participant.id}`}
                role="option"
                aria-selected={index === selectedSuggestion}
                className={index === selectedSuggestion ? "active" : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMention(participant)}
              >
                <strong>{participant.name}</strong>
                <code>{participant.token}</code>
                <span>{participant.summary}</span>
              </li>
            ))}
          </ul>
        )}
        {error === undefined ? null : <p role="alert" className="feedback alert">{error}</p>}
      </form>
    </section>
  );
}

interface MentionParticipant extends CollaboratorView {
  token: `@${string}`;
}

function containsMention(body: string, participantId: string): boolean {
  return findParticipantMentions(body).some((mention) => mention.participantId === participantId);
}

function synchronizeComposerHeight(panel: HTMLElement, flow: HTMLElement): void {
  flow.style.setProperty("--comment-composer-height", `${panel.getBoundingClientRect().height}px`);
}

function fitTextarea(textarea: HTMLTextAreaElement, panel: HTMLElement, flow: HTMLElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > textarea.clientHeight ? "auto" : "hidden";
  synchronizeComposerHeight(panel, flow);
}
