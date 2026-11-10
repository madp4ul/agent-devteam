import type { Actor } from "./task-contract.ts";

export interface ResourceView {
  id: string;
  title: string;
  description: string;
  revision: number;
  archived: boolean;
  owner: ResourceClaimView | null;
  queue: ResourceClaimView[];
}
export interface ResourceClaimView {
  id: string; resourceId: string; resourceTitle: string;
  taskId: string; taskTitle: string; requestingAgentId: string; requestingAgentName: string;
  status: "pending" | "held" | "released" | "cancelled";
  requestedAt: string; grantedAt: string | null; closedAt: string | null;
}
export interface ClaimResourceCommand { resourceId: string; taskId: string; actor: Actor; idempotencyKey: string; attemptId?: string }
export interface ReleaseResourceCommand { claimId: string; taskId: string; actor: Actor; idempotencyKey: string; attemptId?: string }
export type ResourceClaimResult = { accepted: true; claim: ResourceClaimView } | {
  accepted: false; reason: "circular-wait" | "configuration-error" | "not-found" | "archived-resource" | "inactive-task" | "invalid-agent" | "active-claim-exists" | "claim-task-mismatch" | "idempotency-conflict" | "invalid-idempotency-key";
  existingClaim?: ResourceClaimView;
  diagnostic?: string;
};
export interface ResourceCommand {
  actor: Actor;
  originTaskId?: string;
  attemptId?: string;
  idempotencyKey: string;
}
export interface CreateResourceCommand extends ResourceCommand { title: string; description?: string }
export interface EditResourceCommand extends ResourceCommand {
  resourceId: string; expectedRevision: number; title?: string; description?: string;
}
export interface ArchiveResourceCommand extends ResourceCommand { resourceId: string; expectedRevision: number }
export type ResourceMutationResult = { accepted: true; resource: ResourceView } | {
  accepted: false;
  reason: "configuration-error" | "not-found" | "empty-title" | "empty-change" | "archived-resource" | "active-claims" | "revision-conflict" | "idempotency-conflict" | "invalid-idempotency-key";
  currentResource?: ResourceView;
};
export type ResourcesQueryResult = { available: true; resources: ResourceView[] } | { available: false; reason: "configuration-error" };
export type ResourceQueryResult = { available: true; resource: ResourceView } | { available: false; reason: "configuration-error" | "not-found" };

