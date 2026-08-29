import type {
  ActiveRunView,
  AutomationView,
} from "./automation-contract.ts";
import type { AgentConversationIndexEntry } from "./conversation-contract.ts";
import type {
  CollaboratorView,
  ProcessDiagnostic,
  StartupView,
} from "./process-contract.ts";
import type {
  BoardView,
  TaskOverviewView,
  TaskInspectionView,
  TaskView,
  UserTaskInspectionView,
} from "./task-contract.ts";
import type { AggregatedTokenCost } from "./token-cost.ts";

export interface UserRelatedTaskView {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  column: { id: string; name: string };
  blocking: TaskOverviewView["blocking"];
  archived?: true;
}

export type UserTimelineRelatedTaskView =
  | {
      id: string;
      available: false;
    }
  | {
      id: string;
      title: string;
      available: true;
      completed: boolean;
      archived: boolean;
    };

/**
 * Browser disclosure metadata derived from the agent-facing read projections.
 * Durable IDs let presentation preserve the distinction when records are
 * regrouped into a timeline or repeated in a conversation surface.
 */
export interface AgentInspectableTaskContentView {
  taskFields: Array<keyof TaskInspectionView>;
  commentIds: string[];
  relationshipIds: string[];
  activityIds: string[];
  conversationMessageIds: string[];
  attachmentIds: string[];
}

export interface UserTaskDetailView {
  task: TaskView;
  board: BoardView;
  inspection: UserTaskInspectionView;
  activeRun: ActiveRunView | null;
  activeRuns: ActiveRunView[];
  automation: AutomationView;
  collaborators: CollaboratorView[];
  relationshipTasks: UserRelatedTaskView[];
  timelineRelationshipTasks: UserTimelineRelatedTaskView[];
  agentInspectableContent: AgentInspectableTaskContentView;
  startup: StartupView;
  conversations: AgentConversationIndexEntry[];
  conversationCost?: AggregatedTokenCost;
}

export type UserTaskDetailQueryResult =
  | ({ available: true } & UserTaskDetailView)
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };
