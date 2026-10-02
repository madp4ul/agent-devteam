import { useId, useState, type ReactNode } from "react";

import type { TaskActivityView } from "../../application/task-contract.ts";
import { TextPreview } from "./TextPreview.tsx";

export function ResumeInstructions({ activity }: { activity: TaskActivityView }): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const previewId = useId();
  const message = activity.details.continuationMessage;
  return message === undefined ? (
    <p>Instructions for this historical resume were not retained.</p>
  ) : message.length === 0 ? (
    <p>Resumed without additional instructions.</p>
  ) : (
    <TextPreview id={previewId} text={message} expanded={expanded} onExpanded={setExpanded} />
  );
}
