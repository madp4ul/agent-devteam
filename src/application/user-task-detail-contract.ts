import type {
  ActiveRunView,
  AgentConversationIndexEntry,
  AutomationView,
  BoardView,
  CollaboratorView,
  ProcessDiagnostic,
  StartupView,
  TaskOverviewView,
  TaskView,
  UserTaskInspectionView,
} from "./coordination-contract.ts";

export interface UserRelatedTaskView {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  column: { id: string; name: string };
  blocking: TaskOverviewView["blocking"];
  archived?: true;
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
  startup: StartupView;
  conversations: AgentConversationIndexEntry[];
}

export type UserTaskDetailQueryResult =
  | ({ available: true } & UserTaskDetailView)
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };
