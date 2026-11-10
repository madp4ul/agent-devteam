import type { ResourceView, ResourceMutationResult, ResourceQueryResult, ResourcesQueryResult } from "../../application/resource-contract.ts";

async function request<Result>(path: string, method = "GET", body?: object): Promise<Result> {
  const response = await fetch(path, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) {
    if (result.reason === "active-claims") throw new Error("This resource still has a holder or pending claims. Release or cancel those claims before archiving it.");
    if (result.reason === "revision-conflict") throw new Error("This resource changed. Refresh its details before trying again.");
    throw new Error(`Resource request failed: ${(result.reason ?? result.error ?? String(response.status)).replaceAll("-", " ")}`);
  }
  return result as Result;
}
export async function readResources(includeArchived = false): Promise<ResourceView[]> {
  const result = await request<ResourcesQueryResult>(`/api/resources${includeArchived ? "?includeArchived=true" : ""}`);
  if (!result.available) throw new Error(result.reason);
  return result.resources;
}
export async function readResource(id: string): Promise<ResourceView> {
  const result = await request<ResourceQueryResult>(`/api/resources/${encodeURIComponent(id)}`);
  if (!result.available) throw new Error(result.reason);
  return result.resource;
}
export async function saveResource(fields: { title: string; description: string }, resource: ResourceView | undefined, idempotencyKey: string): Promise<ResourceView> {
  const result = await request<ResourceMutationResult>(resource ? `/api/resources/${encodeURIComponent(resource.id)}` : "/api/resources", resource ? "PATCH" : "POST", {
    ...fields, ...(resource ? { expectedRevision: resource.revision } : {}), idempotencyKey,
  });
  if (!result.accepted) throw new Error(result.reason);
  return result.resource;
}
export async function archiveResource(resource: ResourceView, idempotencyKey: string): Promise<ResourceView> {
  const result = await request<ResourceMutationResult>(`/api/resources/${encodeURIComponent(resource.id)}/archive`, "POST", { expectedRevision: resource.revision, idempotencyKey });
  if (!result.accepted) throw new Error(result.reason);
  return result.resource;
}
