import type {
  ActiveRunView,
  AutomationView,
  BoardSummaryColumnView,
  BoardSummaryView,
  NeedsAttentionTaskView,
  StartupView,
  TaskOverviewView,
} from "./coordination-contract.ts";

export interface UserBoardColumnView extends BoardSummaryColumnView {
  tasks: TaskOverviewView[];
}

export interface UserBoardView extends Omit<BoardSummaryView, "columns"> {
  columns: UserBoardColumnView[];
}

export interface UserBoardProjection {
  startup: StartupView;
  automation: AutomationView;
  activeRuns: ActiveRunView[];
  boards: UserBoardView[];
  attention: NeedsAttentionTaskView[];
}
