import { useCallback, useState } from "react";

import { moveTask } from "./api.ts";
import { mutationFeedback, type Feedback } from "./feedback.ts";

interface MoveSubject {
  id: string;
  revision: number;
}

interface MoveDestination {
  id: string;
  name: string;
}

export function useTaskMovement(refresh: () => Promise<void>): {
  feedback: Feedback | undefined;
  setFeedback(feedback: Feedback | undefined): void;
  pendingTaskId: string | undefined;
  move(subject: MoveSubject, destination: MoveDestination): Promise<void>;
} {
  const [feedback, setFeedback] = useState<Feedback>();
  const [pendingTaskId, setPendingTaskId] = useState<string>();

  const move = useCallback(async (subject: MoveSubject, destination: MoveDestination) => {
    if (pendingTaskId !== undefined) return;
    setPendingTaskId(subject.id);
    setFeedback(undefined);
    try {
      await moveTask(subject.id, {
        destinationColumnId: destination.id,
        expectedRevision: subject.revision,
        idempotencyKey: crypto.randomUUID(),
      });
      await refresh();
      setFeedback({ role: "status", text: `Moved ${subject.id} to ${destination.name}.` });
    } catch (error) {
      setFeedback(mutationFeedback(error));
      await refresh();
    } finally {
      setPendingTaskId(undefined);
    }
  }, [pendingTaskId, refresh]);

  return { feedback, setFeedback, pendingTaskId, move };
}
