export interface TaskInput {
  id: string;
  title: string;
  active: boolean;
  metadata: { priority: "high" | "normal" };
}

export interface TaskView extends TaskInput {
  revision: number;
}

export interface TaskOverview {
  taskId: string;
  title: string;
  priority: string;
  activationCount: number;
  runningActivationId: string | null;
}

export interface SliceEvidence {
  approach: "project-owned SQL" | "Drizzle";
  routine: TaskView;
  projection: TaskOverview[];
  emittedSql: string;
  transactionVisible: boolean;
  handwrittenResultAssertions: number;
  uncheckedSqlTypeHints: number;
  runtimeDecoders: string[];
}

export interface MigrationEvidence {
  approach: "project-owned SQL" | "Drizzle Kit artifacts";
  upgradedTask: { id: string; category: string; revision: number };
  activationCount: number;
  backupIntegrity: string;
  sourceIntegrity: string;
  foreignKeyViolations: number;
  unknownFutureRefused: boolean;
  rollbackPreserved: boolean;
  triggerPreserved: boolean;
  viewPreserved: boolean;
  generatedStatements: number;
  customStatements: number;
  originalGeneratedFailure?: string;
  notes: string[];
}
