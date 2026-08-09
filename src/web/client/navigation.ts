export interface BoardContext {
  boardId: string;
  filter: string;
  showArchived: boolean;
  scrollLeft: number;
  scrollPositions?: Record<string, number>;
}

export interface NavigationState {
  boardContext?: BoardContext;
  returnToBoard?: true;
}

export type Navigate = (path: string, state?: NavigationState) => void;
