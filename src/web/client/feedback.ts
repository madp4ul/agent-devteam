import { ApiError } from "./api.ts";

export interface Feedback {
  role: "status" | "alert";
  text: string;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { reason?: string; diagnostic?: string };
    if (body.reason === "empty-title") return "Enter an outcome-oriented title.";
    if (body.reason === "empty-description") return "Enter a complete description.";
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
