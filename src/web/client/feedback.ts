import { ApiError } from "./api.ts";

export interface Feedback {
  role: "status" | "alert";
  text: string;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { reason?: string; diagnostic?: string; removedWorktrees?: string[];
      cleanupFailure?: import("../../application/task-contract.ts").WorkspaceCleanupFailure };
    if (body.reason === "workspace-preview-changed" || body.reason === "workspace-preview-unavailable" || body.reason === "workspace-nested-cleanup-failed") {
      const removed = body.removedWorktrees?.length ? ` Already removed: ${body.removedWorktrees.join(", ")}. Those deletions cannot be undone.` : "";
      const failed = body.cleanupFailure === undefined ? "" : ` Git reported a failure at ${body.cleanupFailure.path}: registration ${body.cleanupFailure.registration}, files ${body.cleanupFailure.files}. Inspect this target before retrying.`;
      return `${body.reason === "workspace-nested-cleanup-failed" ? "Workspace cleanup stopped; the task was not archived. Inspect the remaining files and Git registrations."
        : "Workspace evidence or deletion scope changed or is unavailable. Review the refreshed preview before proceeding."}${removed}${failed}`;
    }
    if (body.reason === "empty-title") return "Enter an outcome-oriented title.";
    if (body.reason === "empty-description") return "Enter a complete description.";
    if (body.reason === "active-resource-claims") return "This task still holds or is waiting for shared resources. Ask a participant on the task to release or cancel its claims before archiving it.";
    if (body.reason === "circular-relationship") return body.diagnostic ?? "This relationship would create a circular wait.";
    if (body.reason === "completion-is-not-starting-column") {
      return "Create the task in a workflow column, then move it to Completion when the work is done.";
    }
    if (body.reason === "runtime-unavailable") {
      return "Automation remains paused because no agent runtime is configured.";
    }
    if (body.reason === "not-dismissible") {
      return "This activation has already started or changed state. Current task state has been restored.";
    }
    if (body.reason === "workspace-registration-invalid") {
      return "Archival stopped because the task workspace registration is invalid or inconsistent. The task and workspace were left unchanged.";
    }
    if (body.reason === "workspace-ownership-untrusted") {
      return "Archival could not inspect the task workspace because Git rejected its ownership trust. No workspace removal was attempted.";
    }
    if (body.reason === "workspace-locked") {
      return "Archival stopped because the task workspace is locked. Unlock it in Git and retry; the task and workspace were left unchanged.";
    }
    if (body.reason === "workspace-nested-worktrees") {
      return "This task contains nested Git worktrees. Open the task and archive it individually to inspect and confirm deletion.";
    }
    if (body.reason === "workspace-commit-not-durable") {
      return "No named ref contains the workspace HEAD. Open the task and review the workspace to explicitly discard those commits, or save them to a branch before retrying.";
    }
    if (body.reason === "interrupted") return "The host stopped before this task was archived. Inspect the current task and workspace before requesting archival again.";
    if (body.reason === "archive-in-progress") return "Archival is already in progress for this task. Check its operation feedback before retrying.";
    if (body.reason === "workspace-removal-failed") {
      return "Git could not remove the registered task workspace, so the task was not archived. Inspect the workspace and registration before retrying.";
    }
    if (body.reason === "workspace-cleanup-failed") {
      return "Git could not inspect the task workspace, so no removal was attempted. The task, workspace directory, Git pointer, and worktree registration remain unchanged.";
    }
    return body.diagnostic ?? body.reason?.replaceAll("-", " ") ?? error.message;
  }
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export function mutationFeedback(error: unknown): Feedback {
  if (
    error instanceof ApiError &&
    (error.body as { reason?: string }).reason === "revision-conflict"
  ) {
    return {
      role: "alert",
      text: "This task changed since this page loaded. Current state has been restored; review it and try again.",
    };
  }
  return { role: "alert", text: `The task could not be moved: ${errorMessage(error)}` };
}
