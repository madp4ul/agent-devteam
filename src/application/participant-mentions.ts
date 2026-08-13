export interface ParticipantMention {
  participantId: string;
  start: number;
  end: number;
}

export interface PartialParticipantMention {
  start: number;
  query: string;
}

export function findParticipantMentions(text: string): ParticipantMention[] {
  const mentions: ParticipantMention[] = [];
  for (const match of text.matchAll(/(?:^|[^\w@])@([A-Za-z0-9][A-Za-z0-9_-]*)/g)) {
    if (match.index === undefined || match[1] === undefined) continue;
    const start = match.index + match[0].lastIndexOf("@");
    if (insideCodeSpan(text, start)) continue;
    mentions.push({ participantId: match[1], start, end: start + match[1].length + 1 });
  }
  return mentions;
}

export function findPartialParticipantMention(
  text: string,
  cursor: number,
): PartialParticipantMention | undefined {
  const beforeCursor = text.slice(0, cursor);
  const match = /(?:^|[^\w@])@([A-Za-z0-9_-]*)$/.exec(beforeCursor);
  if (match === null) return undefined;
  const start = beforeCursor.lastIndexOf("@");
  if (insideCodeSpan(text, start)) return undefined;
  return { start, query: match[1] ?? "" };
}

function insideCodeSpan(text: string, position: number): boolean {
  let delimiterLength = 0;
  for (let index = 0; index < position;) {
    if (text[index] !== "`" || escaped(text, index)) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (text[end] === "`") end += 1;
    const runLength = end - index;
    if (delimiterLength === 0) delimiterLength = runLength;
    else if (delimiterLength === runLength) delimiterLength = 0;
    index = end;
  }
  return delimiterLength !== 0;
}

function escaped(text: string, position: number): boolean {
  let slashes = 0;
  for (let index = position - 1; index >= 0 && text[index] === "\\"; index -= 1) slashes += 1;
  return slashes % 2 === 1;
}
