import type { DatabaseSync } from "node:sqlite";

export interface WaitEdge { source: string; target: string; label: string }

/** Participates in the caller's mutation transaction; retained relationships stay acyclic. */
export function waitCycleDiagnostic(database: DatabaseSync, proposed: WaitEdge): string | undefined {
  const edges = database.prepare(`SELECT source_task_id AS source, target_task_id AS target,
    type || ' relationship ' || id AS label FROM task_relationships`).all() as unknown as WaitEdge[];
  const claims = database.prepare(`SELECT task_id AS taskId, resource_id AS resourceId
    FROM resource_claims WHERE status IN ('held', 'pending') ORDER BY sequence`).all() as Array<{ taskId: string; resourceId: string }>;
  const predecessors = new Map<string, string>();
  for (const claim of claims) {
    const predecessor = predecessors.get(claim.resourceId);
    if (predecessor !== undefined) edges.push({ source: claim.taskId, target: predecessor, label: `resource ${claim.resourceId} FIFO predecessor` });
    predecessors.set(claim.resourceId, claim.taskId);
  }
  const outgoing = new Map<string, WaitEdge[]>();
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  const visited = new Set([proposed.target]);
  const queue: Array<{ task: string; path: WaitEdge[] }> = [{ task: proposed.target, path: [] }];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    if (current.task === proposed.source) {
      const chain = [proposed, ...current.path];
      return `This operation would create a circular wait: ${proposed.source}${chain.map(edge => ` --[${edge.label}]--> ${edge.target}`).join("")}. Consult the participants on these tasks to stop using and release resources, cancel pending claims, or remove unnecessary relationships before retrying.`;
    }
    for (const edge of outgoing.get(current.task) ?? []) {
      if (visited.has(edge.target)) continue;
      visited.add(edge.target);
      queue.push({ task: edge.target, path: [...current.path, edge] });
    }
  }
  return undefined;
}
