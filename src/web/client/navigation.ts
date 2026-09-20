export interface BoardContext {
  boardId: string;
  filter: string;
  showArchived: boolean;
  scrollLeft: number;
  scrollTop?: number;
  taskAnchor?: { taskId: string; top: number };
  scrollPositions?: Record<string, number>;
  unfilteredScrollPositions?: Record<string, number>;
  highlightedTaskId?: string;
}

export interface NavigationState {
  boardContext?: BoardContext;
  returnToBoard?: true;
}

export type Navigate = (path: string, state?: NavigationState) => void;
