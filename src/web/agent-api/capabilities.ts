import type { CoordinationApplication } from "../../application/coordination-application.ts";

export type AgentCoordinationCapabilities = Pick<CoordinationApplication,
  | "queryBoardSummaries"
  | "queryTaskOverviews"
  | "queryArchivedTaskOverviews"
  | "queryTaskInspection"
  | "queryTaskParticipants"
  | "queryTaskActivity"
  | "queryTaskAttachments"
  | "queryTaskHistory"
  | "queryCollaborators"
  | "queryOperatingContext"
  | "addTaskComment"
  | "setTaskCommentPin"
  | "createTask"
  | "editTask"
  | "resolveInertTaskMove"
  | "moveTask"
  | "createChildTask"
  | "createTaskRelationship"
  | "removeTaskRelationship"
  | "editTaskRelationshipResumeAgent"
>;
