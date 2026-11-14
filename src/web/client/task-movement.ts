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

export function useTaskMovement(refresh: () => Promise<void>, setFeedback: (feedback: Feedback & { target?: string }) => void): {
  pendingTaskId: string | undefined;
  move(subject: MoveSubject, destination: MoveDestination): Promise<void>;
} {
  const [pendingTaskId, setPendingTaskId] = useState<string>();

  const move = useCallback(async (subject: MoveSubject, destination: MoveDestination) => {
    if (pendingTaskId !== undefined) return;
    setPendingTaskId(subject.id);
    try {
      await moveTask(subject.id, {
        destinationColumnId: destination.id,
        expectedRevision: subject.revision,
        idempotencyKey: crypto.randomUUID(),
      });
      await refresh();
      setFeedback({ role: "status", text: `Moved ${subject.id} to ${destination.name}.`, target: subject.id });
    } catch (error) {
      setFeedback({ ...mutationFeedback(error), target: subject.id });
      await refresh();
    } finally {
      setPendingTaskId(undefined);
    }
  }, [pendingTaskId, refresh, setFeedback]);

  return { pendingTaskId, move };
}
