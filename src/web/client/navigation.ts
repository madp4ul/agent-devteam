export interface BoardContext {
  boardId: string;
  filter: string;
  scrollLeft: number;
  scrollPositions?: Record<string, number>;
}

export interface NavigationState {
  boardContext?: BoardContext;
  returnToBoard?: true;
}

export type Navigate = (path: string, state?: NavigationState) => void;
