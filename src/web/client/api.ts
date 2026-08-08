import type {
  AutomationView,
  BoardSummaryColumnView,
  BoardSummaryView,
  BoardView,
  BoardMutationResult,
  StartupView,
  TaskOverviewView,
  TaskInspectionView,
  TaskView,
  AttemptTranscriptQueryResult,
  ActivationRecoveryAction,
  NeedsAttentionTaskView,
} from "../../application/coordination-contract.ts";

export interface BrowserColumnView extends BoardSummaryColumnView {
  tasks: TaskOverviewView[];
}

export interface BrowserBoardView extends Omit<BoardSummaryView, "columns"> {
  columns: BrowserColumnView[];
}

export interface BrowserBoardState {
  startup: StartupView;
  automation: AutomationView;
  boards: BrowserBoardView[];
  attention: NeedsAttentionTaskView[];
}

export interface BrowserTaskDetail {
  task: TaskView;
  board: BoardView;
  inspection: TaskInspectionView;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function readBoard(): Promise<BrowserBoardState> {
  const response = await fetch("/api/board");
  const body = await response.json() as BrowserBoardState;
  if (!response.ok && body.startup.mode !== "configuration-error") {
    throw new ApiError(response.status, body);
  }
  return body;
}

export async function readTask(taskId: string): Promise<BrowserTaskDetail> {
  const result = await request<{ available: true } & BrowserTaskDetail>(
    `/api/tasks/${encodeURIComponent(taskId)}`,
  );
  return { task: result.task, board: result.board, inspection: result.inspection };
}

export async function createTask(input: {
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  idempotencyKey: string;
}): Promise<Extract<BoardMutationResult, { accepted: true }>> {
  return mutation("/api/tasks", "POST", input);
}

export async function createChildTask(
  parentTaskId: string,
  input: {
    boardId: string;
    columnId: string;
    title: string;
    description: string;
    startingRef?: string;
    idempotencyKey: string;
  },
): Promise<Extract<BoardMutationResult, { accepted: true }>> {
  return mutation(`/api/tasks/${encodeURIComponent(parentTaskId)}/children`, "POST", input);
}

export async function addTaskDependency(
  taskId: string,
  targetTaskId: string,
  idempotencyKey: string,
): Promise<void> {
  await request(`/api/tasks/${encodeURIComponent(taskId)}/relationships`, {
    method: "POST",
    body: JSON.stringify({ type: "dependency", targetTaskId, idempotencyKey }),
  });
}

export async function editTask(
  taskId: string,
  input: {
    title: string;
    description: string;
    expectedRevision: number;
    idempotencyKey: string;
  },
): Promise<Extract<BoardMutationResult, { accepted: true }>> {
  return mutation(`/api/tasks/${encodeURIComponent(taskId)}`, "PATCH", input);
}

export async function moveTask(
  taskId: string,
  input: {
    destinationColumnId: string;
    expectedRevision: number;
    idempotencyKey: string;
  },
): Promise<Extract<BoardMutationResult, { accepted: true }>> {
  return mutation(`/api/tasks/${encodeURIComponent(taskId)}/move`, "POST", input);
}

export async function resumeAutomation(): Promise<void> {
  await request("/api/automation/resume", { method: "POST", body: "{}" });
}

export async function markUserMentionAddressed(
  attentionReasonId: string,
  idempotencyKey: string,
): Promise<void> {
  await request(`/api/attention/${encodeURIComponent(attentionReasonId)}/mark-addressed`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey }),
  });
}

export async function recoverFailedActivation(
  attentionReasonId: string,
  action: ActivationRecoveryAction,
  idempotencyKey: string,
): Promise<void> {
  await request(`/api/attention/${encodeURIComponent(attentionReasonId)}/${action}`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey }),
  });
}

export async function addTaskComment(
  taskId: string,
  body: string,
  idempotencyKey: string,
): Promise<void> {
  await request(`/api/tasks/${encodeURIComponent(taskId)}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, idempotencyKey }),
  });
}

export async function readAttemptTranscript(
  attemptId: string,
): Promise<AttemptTranscriptQueryResult> {
  const response = await fetch(`/api/attempts/${encodeURIComponent(attemptId)}/transcript`);
  const body = await response.json() as AttemptTranscriptQueryResult;
  if (!response.ok && !(response.status === 503 && !body.available && body.reason === "unavailable")) {
    throw new ApiError(response.status, body);
  }
  return body;
}

async function mutation(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<Extract<BoardMutationResult, { accepted: true }>> {
  return request(url, { method, body: JSON.stringify(body) });
}

async function request<Result>(url: string, init?: RequestInit): Promise<Result> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json() as unknown;
  if (!response.ok) throw new ApiError(response.status, body);
  return body as Result;
}
