import { Fragment, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";

import { findParticipantMentions } from "../../application/participant-mentions.ts";

export function MarkdownContent({ source, participants, className }: {
  source: string;
  participants?: Map<string, string>;
  className?: string;
}): ReactNode {
  const components = markdownComponents(participants);
  return (
    <div className={`markdown-content${className === undefined ? "" : ` ${className}`}`}>
      <ReactMarkdown
        skipHtml
        disallowedElements={["img"]}
        components={components}
      >{source}</ReactMarkdown>
    </div>
  );
}

function markdownComponents(participants: Map<string, string> | undefined): Components {
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
      const external = href !== undefined && /^https?:\/\//i.test(href);
      return (
        <a
          href={href}
          {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
        >{content(children)}</a>
      );
    },
  };
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
