import type { DatabaseSync } from "node:sqlite";
import type { Actor } from "../task-contract.ts";

/** Validate runtime provenance before either task or resource mutation effects. */
export function agentCommandOrigin(
  database: DatabaseSync,
  command: { actor: Actor; attemptId?: string; callerTaskId?: string },
): { id: string; title: string } | undefined {
  if (command.actor.kind !== "agent") return undefined;
  if (command.attemptId === undefined) {
    if (command.callerTaskId === undefined) return undefined;
    const task = database.prepare("SELECT id, title FROM tasks WHERE id = ?")
      .get(command.callerTaskId) as { id: string; title: string } | undefined;
    if (task === undefined) throw new Error("Agent action origin task is unavailable");
    return { id: task.id, title: task.title };
  }
  const origin = database.prepare(
    `SELECT task.id, task.title FROM attempts attempt
     JOIN activations activation ON activation.id = attempt.activation_id
     JOIN tasks task ON task.id = activation.task_id
     WHERE attempt.id = ? AND activation.target_agent_id = ? AND attempt.status = 'running'`,
  ).get(command.attemptId, command.actor.id) as { id: string; title: string } | undefined;
  if (origin === undefined || (command.callerTaskId !== undefined && origin.id !== command.callerTaskId)) {
    throw new Error("Agent action attempt provenance is not current");
  }
  return { id: origin.id, title: origin.title };
}
