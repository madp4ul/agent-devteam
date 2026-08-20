import type {
  ActiveRunView,
  AutomationView,
} from "./automation-contract.ts";
import type {
  BoardSummaryColumnView,
  BoardSummaryView,
  StartupView,
} from "./process-contract.ts";
import type {
  NeedsAttentionTaskView,
  TaskOverviewView,
} from "./task-contract.ts";

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
