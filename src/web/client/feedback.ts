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
