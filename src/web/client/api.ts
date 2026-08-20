import type {
  ActivationRecoveryRequest,
  BoardMutationResult,
  AddTaskCommentRequest,
  ArchiveCompletedTasksRequest,
  ArchiveTaskRequest,
  ContinueAgentConversationRequest,
  ContinueInterruptedTaskRequest,
  CreateChildTaskRequest,
  CreateTaskRelationshipRequest,
  CreateTaskRequest,
  EditTaskRequest,
  EmptyBrowserRequest,
  IdempotentBrowserRequest,
  MoveTaskRequest,
  TaskOverviewView,
  AttemptTranscriptQueryResult,
  AgentConversationQueryResult,
  ContinueAgentConversationResult,
  ActivationRecoveryAction,
  ArchiveCompletedTasksResult,
  TaskWorkspaceGitStateView,
  NotificationPolicyView,
  NotificationOccurrenceBatch,
  UpdateNotificationPolicyRequest,
  UserBoardColumnView,
  UserBoardProjection,
  UserBoardView,
  UserRelatedTaskView,
  UserTaskDetailQueryResult,
  UserTaskDetailView,
} from "../../application/browser-transport-contract.ts";
export type BrowserBoardState = UserBoardProjection;
export type BrowserBoardView = UserBoardView;
export type BrowserColumnView = UserBoardColumnView;

export type BrowserTaskDetail = UserTaskDetailView;
export type BrowserRelationshipTask = UserRelatedTaskView;

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
  return { ...body, activeRuns: body.activeRuns ?? [] };
}

export async function readNotificationPolicy(): Promise<NotificationPolicyView> {
  return request("/api/settings/notifications");
}

export async function updateNotificationPolicy(
  change: UpdateNotificationPolicyRequest,
): Promise<NotificationPolicyView> {
  const result = await request<{ accepted: true; policy: NotificationPolicyView }>(
    "/api/settings/notifications",
    { method: "PATCH", body: serializeBrowserRequest<UpdateNotificationPolicyRequest>(change) },
  );
  return result.policy;
}

export async function readNotificationOccurrences(
  after?: number,
): Promise<NotificationOccurrenceBatch> {
  return request(`/api/notification-occurrences${after === undefined ? "" : `?after=${after}`}`);
}

export async function readTask(taskId: string): Promise<BrowserTaskDetail> {
  const result = await request<Extract<UserTaskDetailQueryResult, { available: true }>>(
    `/api/tasks/${encodeURIComponent(taskId)}`,
  );
  const { available: _available, ...detail } = result;
  return detail;
}

export async function readArchivedTasks(): Promise<TaskOverviewView[]> {
  const result = await request<{ available: true; tasks: TaskOverviewView[] }>("/api/archive");
  return result.tasks;
}

export async function archiveTask(
  taskId: string,
  idempotencyKey: string,
  discardWorkspaceChanges = false,
): Promise<void> {
  await request(`/api/tasks/${encodeURIComponent(taskId)}/archive`, {
    method: "POST",
    body: serializeBrowserRequest<ArchiveTaskRequest>({
      idempotencyKey,
      ...(discardWorkspaceChanges ? { discardWorkspaceChanges: true } : {}),
    }),
  });
}

export async function unarchiveTask(taskId: string, idempotencyKey: string): Promise<void> {
  await request(`/api/tasks/${encodeURIComponent(taskId)}/unarchive`, {
    method: "POST",
    body: serializeBrowserRequest<IdempotentBrowserRequest>({ idempotencyKey }),
  });
}

export async function archiveCompletedTasks(
  boardId: string,
  idempotencyKey: string,
): Promise<Extract<ArchiveCompletedTasksResult, { accepted: true }>> {
  return request("/api/archive/completed", {
    method: "POST",
    body: serializeBrowserRequest<ArchiveCompletedTasksRequest>({ boardId, idempotencyKey }),
  });
}

export async function openTaskWorkspace(taskId: string): Promise<void> {
  await request(`/api/tasks/${encodeURIComponent(taskId)}/workspace/open`, {
    method: "POST",
    body: serializeBrowserRequest<EmptyBrowserRequest>({}),
  });
}

export async function openTaskWorkspaceInVisualStudioCode(taskId: string): Promise<void> {
  await request(`/api/tasks/${encodeURIComponent(taskId)}/workspace/open-vscode`, {
    method: "POST",
    body: serializeBrowserRequest<EmptyBrowserRequest>({}),
  });
}

export async function readTaskWorkspaceGitState(taskId: string): Promise<TaskWorkspaceGitStateView> {
  const result = await request<{ available: true; state: TaskWorkspaceGitStateView }>(
    `/api/tasks/${encodeURIComponent(taskId)}/workspace/git-state`,
  );
  return result.state;
}

export async function createTask(
  input: CreateTaskRequest,
): Promise<Extract<BoardMutationResult, { accepted: true }>> {
  return mutation("/api/tasks", "POST", input);
}

export async function createChildTask(
  parentTaskId: string,
  input: CreateChildTaskRequest,
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
    body: serializeBrowserRequest<CreateTaskRelationshipRequest>({
      type: "dependency",
      targetTaskId,
      idempotencyKey,
    }),
  });
}

export async function removeTaskRelationship(
  taskId: string,
  relationshipId: string,
  idempotencyKey: string,
): Promise<void> {
  await request(
    `/api/tasks/${encodeURIComponent(taskId)}/relationships/${encodeURIComponent(relationshipId)}`,
    {
      method: "DELETE",
      body: serializeBrowserRequest<IdempotentBrowserRequest>({ idempotencyKey }),
    },
  );
}

export async function editTask(
  taskId: string,
  input: EditTaskRequest,
): Promise<Extract<BoardMutationResult, { accepted: true }>> {
  return mutation(`/api/tasks/${encodeURIComponent(taskId)}`, "PATCH", input);
}

export async function moveTask(
  taskId: string,
  input: MoveTaskRequest,
): Promise<Extract<BoardMutationResult, { accepted: true }>> {
  return mutation(`/api/tasks/${encodeURIComponent(taskId)}/move`, "POST", input);
}

export async function resumeAutomation(): Promise<void> {
  await request("/api/automation/resume", {
    method: "POST",
    body: serializeBrowserRequest<EmptyBrowserRequest>({}),
  });
}

export async function resumeWithCurrentProcess(): Promise<void> {
  await request("/api/automation/resume-with-current-process", {
    method: "POST",
    body: serializeBrowserRequest<EmptyBrowserRequest>({}),
  });
}

export async function dismissStaleActivation(
  activationId: string,
  idempotencyKey: string,
): Promise<void> {
  await request(`/api/activations/${encodeURIComponent(activationId)}/dismiss-stale`, {
    method: "POST",
    body: serializeBrowserRequest<IdempotentBrowserRequest>({ idempotencyKey }),
  });
}

export async function dismissActivation(
  activationId: string,
  idempotencyKey: string,
): Promise<void> {
  await request(`/api/activations/${encodeURIComponent(activationId)}/dismiss`, {
    method: "POST",
    body: serializeBrowserRequest<IdempotentBrowserRequest>({ idempotencyKey }),
  });
}

export async function pauseAutomation(): Promise<void> {
  await request("/api/automation/pause", {
    method: "POST",
    body: serializeBrowserRequest<EmptyBrowserRequest>({}),
  });
}

export async function interruptTask(taskId: string, idempotencyKey: string): Promise<void> {
  await request(`/api/tasks/${encodeURIComponent(taskId)}/interrupt`, {
    method: "POST",
    body: serializeBrowserRequest<IdempotentBrowserRequest>({ idempotencyKey }),
  });
}

export async function continueInterruptedTask(
  taskId: string,
  message: string,
  idempotencyKey: string,
): Promise<void> {
  await request(`/api/tasks/${encodeURIComponent(taskId)}/continue`, {
    method: "POST",
    body: serializeBrowserRequest<ContinueInterruptedTaskRequest>({ message, idempotencyKey }),
  });
}

export async function markUserMentionAddressed(
  attentionReasonId: string,
  idempotencyKey: string,
): Promise<void> {
  await request(`/api/attention/${encodeURIComponent(attentionReasonId)}/mark-addressed`, {
    method: "POST",
    body: serializeBrowserRequest<IdempotentBrowserRequest>({ idempotencyKey }),
  });
}

export async function recoverFailedActivation(
  attentionReasonId: string,
  action: ActivationRecoveryAction,
  idempotencyKey: string,
  message?: string,
): Promise<void> {
  await request(`/api/attention/${encodeURIComponent(attentionReasonId)}/${action}`, {
    method: "POST",
    body: serializeBrowserRequest<ActivationRecoveryRequest>({
      idempotencyKey,
      ...(message === undefined ? {} : { message }),
    }),
  });
}

export async function addTaskComment(
  taskId: string,
  body: string,
  idempotencyKey: string,
): Promise<void> {
  await request(`/api/tasks/${encodeURIComponent(taskId)}/comments`, {
    method: "POST",
    body: serializeBrowserRequest<AddTaskCommentRequest>({ body, idempotencyKey }),
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

export async function readAgentConversation(
  taskId: string,
  conversationId: string,
): Promise<AgentConversationQueryResult> {
  const response = await fetch(
    `/api/tasks/${encodeURIComponent(taskId)}/conversations/${encodeURIComponent(conversationId)}`,
  );
  const body = await response.json() as AgentConversationQueryResult;
  if (!response.ok) throw new ApiError(response.status, body);
  return body;
}

export async function continueAgentConversation(
  taskId: string,
  conversationId: string,
  body: string,
  idempotencyKey: string,
): Promise<ContinueAgentConversationResult> {
  return request(
    `/api/tasks/${encodeURIComponent(taskId)}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "POST",
      body: serializeBrowserRequest<ContinueAgentConversationRequest>({ body, idempotencyKey }),
    },
  );
}

async function mutation<Request extends CreateTaskRequest | CreateChildTaskRequest | EditTaskRequest | MoveTaskRequest>(
  url: string,
  method: "POST" | "PATCH",
  body: Request,
): Promise<Extract<BoardMutationResult, { accepted: true }>> {
  return request(url, { method, body: serializeBrowserRequest<Request>(body) });
}

function serializeBrowserRequest<Request>(request: Request): string {
  return JSON.stringify(request);
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
