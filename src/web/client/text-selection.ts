interface TextSelectionSnapshot {
  text: string;
  startOffset: number;
  backwards: boolean;
}

export interface CapturedTextSelection {
  container: Node;
  snapshot: TextSelectionSnapshot;
}

export function captureTextSelectionWithin(...containers: Array<Node | null>): CapturedTextSelection | null {
  for (const container of containers) {
    if (container === null) continue;
    const snapshot = captureTextSelection(container);
    if (snapshot !== null) return { container, snapshot };
  }
  return null;
}

export function restoreCapturedTextSelection(captured: CapturedTextSelection | null): void {
  if (captured === null || !captured.container.isConnected) return;
  restoreTextSelection(captured.container, captured.snapshot);
}

function captureTextSelection(container: Node | null): TextSelectionSnapshot | null {
  const selection = window.getSelection();
  if (
    container === null ||
    selection === null ||
    selection.isCollapsed ||
    selection.anchorNode === null ||
    selection.focusNode === null ||
    !container.contains(selection.anchorNode) ||
    !container.contains(selection.focusNode) ||
    selection.rangeCount === 0
  ) return null;

  const range = selection.getRangeAt(0);
  const text = range.cloneContents().textContent ?? "";
  if (text.length === 0) return null;
  const prefix = document.createRange();
  prefix.setStart(container, 0);
  prefix.setEnd(range.startContainer, range.startOffset);
  return {
    text,
    startOffset: prefix.cloneContents().textContent?.length ?? 0,
    backwards: selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset,
  };
}

function restoreTextSelection(container: Node | null, snapshot: TextSelectionSnapshot | null): void {
  if (container === null || snapshot === null) return;
  const startOffset = nearestOccurrence(container.textContent ?? "", snapshot.text, snapshot.startOffset);
  if (startOffset === null) return;
  const start = textPointAt(container, startOffset, true);
  const end = textPointAt(container, startOffset + snapshot.text.length, false);
  const selection = window.getSelection();
  if (start === null || end === null || selection === null) return;
  selection.setBaseAndExtent(
    snapshot.backwards ? end.node : start.node,
    snapshot.backwards ? end.offset : start.offset,
    snapshot.backwards ? start.node : end.node,
    snapshot.backwards ? start.offset : end.offset,
  );
}

function nearestOccurrence(content: string, text: string, previousOffset: number): number | null {
  let nearest: number | null = null;
  let cursor = content.indexOf(text);
  while (cursor >= 0) {
    if (nearest === null || Math.abs(cursor - previousOffset) < Math.abs(nearest - previousOffset)) nearest = cursor;
    cursor = content.indexOf(text, cursor + 1);
  }
  return nearest;
}

function textPointAt(
  container: Node,
  absoluteOffset: number,
  preferNextAtBoundary: boolean,
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let remaining = absoluteOffset;
  let current = walker.nextNode();
  while (current !== null) {
    const text = current as Text;
    if (remaining < text.data.length) return { node: text, offset: remaining };
    if (remaining === text.data.length) {
      if (!preferNextAtBoundary) return { node: text, offset: remaining };
      const next = walker.nextNode();
      return next === null ? { node: text, offset: remaining } : { node: next as Text, offset: 0 };
    }
    remaining -= text.data.length;
    current = walker.nextNode();
  }
  return null;
}
