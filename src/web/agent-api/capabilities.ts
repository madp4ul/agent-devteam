import type { CoordinationApplication } from "../../application/coordination-application.ts";

export type AgentCoordinationCapabilities = Pick<CoordinationApplication,
  | "queryBoardSummaries"
  | "queryTaskOverviews"
  | "queryArchivedTaskOverviews"
  | "queryTaskInspection"
  | "queryTaskActivity"
  | "queryTaskAttachments"
  | "queryCollaborators"
  | "queryOperatingContext"
  | "addTaskComment"
  | "resolveInertTaskMove"
  | "moveTask"
  | "createChildTask"
  | "createTaskRelationship"
>;
