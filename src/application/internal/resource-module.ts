import { agentCommandOrigin } from "./agent-command-origin.ts";
import type { DatabaseSync } from "node:sqlite";
import { waitCycleDiagnostic } from "./wait-cycle.ts";
import { randomUUID } from "node:crypto";
import type { ActivityJournal } from "./activity-journal.ts";
import type { ActivationCreationModule } from "./activation-creation-module.ts";
import type { ClaimResourceCommand, ReleaseResourceCommand, ResourceClaimResult, ResourceClaimView } from "../resource-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { IdempotentCommandExecutor } from "./idempotent-command-executor.ts";
import type { ArchiveResourceCommand, CreateResourceCommand, EditResourceCommand, ResourceMutationResult, ResourceView } from "../resource-contract.ts";

type ResourceRow = Omit<ResourceView, "archived" | "owner" | "queue"> & { archived: number };

/** Owns resource definitions and exclusive task claims inside command transactions. */
export class ResourceModule {
  readonly #database: DatabaseSync;
  readonly #commands: IdempotentCommandExecutor;
  readonly #journal: ActivityJournal;
  readonly #activations: ActivationCreationModule;
  constructor(database: CoordinationDatabase, commands: IdempotentCommandExecutor, journal: ActivityJournal, activations: ActivationCreationModule) {
    this.#database = database.connection;
    this.#commands = commands;
    this.#journal = journal;
    this.#activations = activations;
  }
  list(includeArchived = false): ResourceView[] {
    return (this.#database.prepare(`SELECT id, title, description, revision, archived FROM resources ${includeArchived ? "" : "WHERE archived = 0"} ORDER BY sequence`).all() as ResourceRow[]).map(row => this.view(row));
  }
  inspect(id: string): ResourceView | undefined {
    const row = this.#database.prepare("SELECT id, title, description, revision, archived FROM resources WHERE id = ?").get(id) as ResourceRow | undefined;
    return row === undefined ? undefined : this.view(row);
  }
  private view(row: ResourceRow): ResourceView {
    const claims = this.claims("claim.resource_id = ? AND claim.status IN ('held', 'pending')", row.id);
    return { ...row, archived: row.archived === 1, owner: claims.find(c => c.status === "held") ?? null, queue: claims.filter(c => c.status === "pending") };
  }
  taskClaims(taskId: string): ResourceClaimView[] { return readActiveTaskResourceClaims(this.#database, taskId); }
  private claims(where: string, id: string): ResourceClaimView[] {
    return readResourceClaims(this.#database, where, id);
  }
  claim(command: ClaimResourceCommand): ResourceClaimResult {
    return this.executeClaim("claim-resource", command, { resourceId: command.resourceId }, () => {
      const task = this.#database.prepare("SELECT column_id, archived_at, archival_pending FROM tasks WHERE id = ?").get(command.taskId) as { column_id: string; archived_at: string | null; archival_pending: number } | undefined;
      if (!task) return { accepted: false, reason: "not-found" };
      if (task.archived_at !== null || task.archival_pending === 1 || task.column_id === "completion") return { accepted: false, reason: "inactive-task" };
      const resource = this.inspect(command.resourceId);
      if (!resource) return { accepted: false, reason: "not-found" };
      if (resource.archived) return { accepted: false, reason: "archived-resource" };
      const existingClaim = this.taskClaims(command.taskId).find(c => c.resourceId === command.resourceId);
      if (existingClaim) return { accepted: false, reason: "active-claim-exists", existingClaim };
      const predecessor = resource.queue.at(-1) ?? resource.owner;
      if (predecessor) {
        const diagnostic = waitCycleDiagnostic(this.#database, { source: command.taskId, target: predecessor.taskId, label: `resource ${command.resourceId} FIFO predecessor` });
        if (diagnostic) return { accepted: false, reason: "circular-wait", diagnostic };
      }
      const id = randomUUID(), now = new Date().toISOString();
      const status = resource.owner === null ? "held" : "pending";
      this.#database.prepare(`INSERT INTO resource_claims (id, resource_id, task_id, requesting_agent_id, status, requested_at, granted_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, command.resourceId, command.taskId, command.actor.id, status, now, status === "held" ? now : null);
      const claim = this.claims("claim.id = ?", id)[0]!;
      this.activity(claim, "resource.requested", command.actor, command.attemptId);
      if (status === "held") this.activity(claim, "resource.granted", { kind: "framework", id: "coordination" });
      return { accepted: true, claim };
    });
  }
  release(command: ReleaseResourceCommand): ResourceClaimResult {
    return this.executeClaim("release-resource", command, { claimId: command.claimId }, () => {
      const claim = this.claims("claim.id = ?", command.claimId)[0];
      if (!claim) return { accepted: false, reason: "not-found" };
      if (claim.taskId !== command.taskId) return { accepted: false, reason: "claim-task-mismatch" };
      this.closeClaim(claim, command.actor, command.attemptId);
      return { accepted: true, claim: this.claims("claim.id = ?", claim.id)[0]! };
    });
  }
  clearTask(taskId: string, actor: ArchiveResourceCommand["actor"]): void {
    for (const claim of this.taskClaims(taskId)) this.closeClaim(claim, actor);
  }
  private closeClaim(claim: ResourceClaimView, actor: ArchiveResourceCommand["actor"], attemptId?: string): void {
    if (claim.status !== "held" && claim.status !== "pending") return;
    const now = new Date().toISOString();
    this.#database.prepare("UPDATE resource_claims SET status = ?, closed_at = ? WHERE id = ?").run(claim.status === "held" ? "released" : "cancelled", now, claim.id);
    this.activity(claim, claim.status === "held" ? "resource.released" : "resource.cancelled", actor, attemptId);
    if (claim.status === "held") {
      const next = this.claims("claim.resource_id = ? AND claim.status = 'pending'", claim.resourceId)[0];
      if (next) {
        this.#database.prepare("UPDATE resource_claims SET status = 'held', granted_at = ? WHERE id = ?").run(now, next.id);
        const event = this.activity(next, "resource.granted", { kind: "framework", id: "coordination" });
        this.#activations.createOrdinary({ taskId: next.taskId, targetAgentId: next.requestingAgentId, reasonType: "resource-granted", sourceEventId: event, occurredAt: now });
      }
    }
  }
  private activity(claim: ResourceClaimView, type: "resource.requested" | "resource.granted" | "resource.cancelled" | "resource.released", actor: ArchiveResourceCommand["actor"] | { kind: "framework"; id: "coordination" }, attemptId?: string): string {
    return this.#journal.append(claim.taskId, type, actor, { claimId: claim.id, resourceId: claim.resourceId, resourceTitle: claim.resourceTitle, requestingAgentId: claim.requestingAgentId, requestingAgentName: claim.requestingAgentName, ...(attemptId ? { attemptId } : {}) });
  }
  private executeClaim(kind: "claim-resource" | "release-resource", command: ClaimResourceCommand | ReleaseResourceCommand, request: unknown, operation: () => ResourceClaimResult): ResourceClaimResult {
    agentCommandOrigin(this.#database, { ...command, callerTaskId: command.taskId });
    if (!command.idempotencyKey.trim()) return { accepted: false, reason: "invalid-idempotency-key" };
    if (command.actor.kind !== "agent" || !this.#database.prepare("SELECT id FROM agents WHERE id = ? AND applied = 1").get(command.actor.id)) return { accepted: false, reason: "invalid-agent" };
    return this.#commands.execute<ResourceClaimResult>({ kind, caller: [command.actor.kind, command.actor.id, command.taskId], idempotencyKey: command.idempotencyKey }, operation, r => r.accepted, { request: JSON.stringify(request), onConflict: () => ({ accepted: false, reason: "idempotency-conflict" }) });
  }
  create(command: CreateResourceCommand): ResourceMutationResult {
    const title = command.title.trim(), description = (command.description ?? "").trim();
    return this.execute("create-resource", command, { title, description }, () => {
      if (!title) return { accepted: false, reason: "empty-title" };
      const next = (this.#database.prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM resources").get() as { next: number }).next;
      const id = `R-${String(next).padStart(4, "0")}`;
      this.#database.prepare("INSERT INTO resources (id, title, description) VALUES (?, ?, ?)").run(id, title, description);
      return { accepted: true, resource: this.inspect(id)! };
    });
  }
  edit(command: EditResourceCommand): ResourceMutationResult {
    const title = command.title?.trim(), description = command.description?.trim();
    return this.execute("edit-resource", command, { resourceId: command.resourceId, expectedRevision: command.expectedRevision, title, description }, () => {
      const rejection = this.rejection(command);
      if (rejection) return rejection;
      if (title === undefined && description === undefined) return { accepted: false, reason: "empty-change" };
      if (title === "") return { accepted: false, reason: "empty-title" };
      this.#database.prepare("UPDATE resources SET title = COALESCE(?, title), description = COALESCE(?, description), revision = revision + 1 WHERE id = ?").run(title ?? null, description ?? null, command.resourceId);
      return { accepted: true, resource: this.inspect(command.resourceId)! };
    });
  }
  archive(command: ArchiveResourceCommand): ResourceMutationResult {
    return this.execute("archive-resource", command, { resourceId: command.resourceId, expectedRevision: command.expectedRevision }, () => {
      const rejection = this.rejection(command);
      if (rejection) return rejection;
      if (this.inspect(command.resourceId)!.owner || this.inspect(command.resourceId)!.queue.length) return { accepted: false, reason: "active-claims" };
      this.#database.prepare("UPDATE resources SET archived = 1, revision = revision + 1 WHERE id = ?").run(command.resourceId);
      return { accepted: true, resource: this.inspect(command.resourceId)! };
    });
  }
  private rejection(command: ArchiveResourceCommand): ResourceMutationResult | undefined {
    const currentResource = this.inspect(command.resourceId);
    if (!currentResource) return { accepted: false, reason: "not-found" };
    if (currentResource.archived) return { accepted: false, reason: "archived-resource" };
    if (currentResource.revision !== command.expectedRevision) return { accepted: false, reason: "revision-conflict", currentResource };
    return undefined;
  }
  private execute(kind: "create-resource" | "edit-resource" | "archive-resource", command: ArchiveResourceCommand | CreateResourceCommand | EditResourceCommand, request: unknown, operation: () => ResourceMutationResult): ResourceMutationResult {
    const origin = agentCommandOrigin(this.#database, { ...command, ...(command.originTaskId === undefined ? {} : { callerTaskId: command.originTaskId }) });
    if (!command.idempotencyKey.trim()) return { accepted: false, reason: "invalid-idempotency-key" };
    return this.#commands.execute<ResourceMutationResult>({ kind, idempotencyKey: command.idempotencyKey, caller: [command.actor.kind, command.actor.id, origin?.id ?? ""] }, operation, result => result.accepted, {
      request: JSON.stringify(request), onConflict: () => ({ accepted: false, reason: "idempotency-conflict" }),
    });
  }
}

function readResourceClaims(database: DatabaseSync, where: string, id: string): ResourceClaimView[] {
  return (database.prepare(`SELECT claim.id, claim.resource_id AS resourceId, resource.title AS resourceTitle,
      claim.task_id AS taskId, task.title AS taskTitle, claim.requesting_agent_id AS requestingAgentId,
      agent.name AS requestingAgentName, claim.status, claim.requested_at AS requestedAt,
      claim.granted_at AS grantedAt, claim.closed_at AS closedAt FROM resource_claims claim
      JOIN resources resource ON resource.id = claim.resource_id JOIN tasks task ON task.id = claim.task_id
      JOIN agents agent ON agent.id = claim.requesting_agent_id WHERE ${where} ORDER BY claim.sequence`).all(id) as unknown as ResourceClaimView[]).map(row => ({ ...row }));
}

export function readActiveTaskResourceClaims(database: DatabaseSync, taskId: string): ResourceClaimView[] {
  return readResourceClaims(database, "claim.task_id = ? AND claim.status IN ('held', 'pending')", taskId);
}

export function readResourceClaim(database: DatabaseSync, claimId: string): ResourceClaimView | undefined {
  return readResourceClaims(database, "claim.id = ?", claimId)[0];
}
