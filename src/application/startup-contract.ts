/** A phase describes work beginning; remaining steps are a plan, never a duration estimate. */
export interface StartupProgressUpdate {
  phase: string;
  remainingSteps?: number;
  detail?: string;
}

export type StartupProgressObserver = (update: StartupProgressUpdate) => void;

export function reportStartupProgress(
  observer: StartupProgressObserver | undefined,
  update: StartupProgressUpdate,
): void {
  try { observer?.(update); } catch { /* Presentation cannot change startup safety or readiness. */ }
}
