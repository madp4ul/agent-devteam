import { createContext, Fragment, useContext, useState, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components, type UrlTransform } from "react-markdown";

import { findParticipantMentions } from "../../application/participant-mentions.ts";
import { ApiError, openTaskWorkspaceFile } from "./api.ts";

const TaskMarkdownContext = createContext<string | undefined>(undefined);

export function TaskMarkdownProvider({ taskId, children }: {
  taskId: string;
  children: ReactNode;
}): ReactNode {
  return <TaskMarkdownContext value={taskId}>{children}</TaskMarkdownContext>;
}

export function MarkdownContent({ source, participants, className }: {
  source: string;
  participants?: Map<string, string>;
  className?: string;
}): ReactNode {
  const taskId = useContext(TaskMarkdownContext);
  const components = markdownComponents(participants, taskId);
  return (
    <div className={`markdown-content${className === undefined ? "" : ` ${className}`}`}>
      <ReactMarkdown
        skipHtml
        disallowedElements={["img"]}
        components={components}
        urlTransform={taskId === undefined ? defaultUrlTransform : taskMarkdownUrlTransform}
      >{source}</ReactMarkdown>
    </div>
  );
}

function markdownComponents(participants: Map<string, string> | undefined, taskId: string | undefined): Components {
  const content = (children: ReactNode): ReactNode => participants === undefined
    ? children
    : <MentionedText text={children} participants={participants} />;
  return {
    p: ({ children }) => <p>{content(children)}</p>,
    h1: ({ children }) => <h1>{content(children)}</h1>,
    h2: ({ children }) => <h2>{content(children)}</h2>,
    h3: ({ children }) => <h3>{content(children)}</h3>,
    h4: ({ children }) => <h4>{content(children)}</h4>,
    h5: ({ children }) => <h5>{content(children)}</h5>,
    h6: ({ children }) => <h6>{content(children)}</h6>,
    li: ({ children }) => <li>{content(children)}</li>,
    strong: ({ children }) => <strong>{content(children)}</strong>,
    em: ({ children }) => <em>{content(children)}</em>,
    blockquote: ({ children }) => <blockquote>{content(children)}</blockquote>,
    a: ({ children, href }) => {
      if (taskId !== undefined && href !== undefined && isLocalFileReference(href)) {
        return <LocalFileLink taskId={taskId} reference={href}>{content(children)}</LocalFileLink>;
      }
      const newTab = href !== undefined && (/^https?:\/\//i.test(href) || /^\/tasks\/[^/]+\/?(?:[?#].*)?$/i.test(href));
      return (
        <a
          href={href}
          {...(newTab ? { target: "_blank", rel: "noreferrer noopener" } : {})}
        >{content(children)}</a>
      );
    },
  };
}

function LocalFileLink({ taskId, reference, children }: {
  taskId: string;
  reference: string;
  children: ReactNode;
}): ReactNode {
  const [feedback, setFeedback] = useState<{ role: "status" | "alert"; text: string }>();
  const endpoint = `/api/tasks/${encodeURIComponent(taskId)}/workspace/files/open?reference=${encodeURIComponent(reference)}`;
  const open = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    const label = event.currentTarget.textContent?.trim() || "linked file";
    setFeedback(undefined);
    void openTaskWorkspaceFile(taskId, reference)
      .then(() => setFeedback({ role: "status", text: `Opened ${label}.` }))
      .catch((error: unknown) => setFeedback({ role: "alert", text: fileOpenDiagnostic(error) }));
  };
  return (
    <>
      <a href={endpoint} onClick={open}>{children}</a>
      {feedback === undefined ? null : (
        <small className="local-file-feedback" role={feedback.role}>{feedback.text}</small>
      )}
    </>
  );
}

const taskMarkdownUrlTransform: UrlTransform = (url, key, node) =>
  key === "href" && isLocalFileReference(url) ? url : defaultUrlTransform(url);

function isLocalFileReference(href: string): boolean {
  if (
    href.length === 0 ||
    href.startsWith("#") ||
    href.startsWith("//") ||
    /^\/tasks\/[^/]+\/?(?:[?#].*)?$/iu.test(href)
  ) return false;
  if (/^[A-Za-z]:[\\/]/u.test(href) || /^file:/iu.test(href)) return true;
  return !/^[A-Za-z][A-Za-z\d+.-]*:/u.test(href);
}

function fileOpenDiagnostic(error: unknown): string {
  if (error instanceof ApiError && typeof error.body === "object" && error.body !== null) {
    const diagnostic = (error.body as { diagnostic?: unknown }).diagnostic;
    if (typeof diagnostic === "string") return diagnostic;
  }
  return "The linked file could not be opened.";
}

function MentionedText({ text, participants }: {
  text: ReactNode;
  participants: Map<string, string>;
}): ReactNode {
  if (typeof text !== "string") {
    if (!Array.isArray(text)) return text;
    return text.map((part, index) => <Fragment key={index}><MentionedText text={part} participants={participants} /></Fragment>);
  }
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
