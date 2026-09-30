import type { CoordinationApplication } from "../../application/coordination-application.ts";

export type AgentCoordinationCapabilities = Pick<CoordinationApplication,
  | "queryBoardSummaries"
  | "queryTaskOverviews"
  | "queryArchivedTaskOverviews"
  | "queryTaskInspection"
  | "queryTaskParticipants"
  | "queryTaskActivity"
  | "queryTaskAttachments"
  | "queryCollaborators"
  | "queryOperatingContext"
  | "addTaskComment"
  | "createTask"
  | "editTask"
  | "resolveInertTaskMove"
  | "moveTask"
  | "createChildTask"
  | "createTaskRelationship"
  | "removeTaskRelationship"
  | "editTaskRelationshipResumeAgent"
>;
