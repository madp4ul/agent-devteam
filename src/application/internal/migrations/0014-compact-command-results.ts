import type { CoordinationMigration } from "../coordination-database.ts";

/** Ledger boundary: older packages must reject stores containing compact results. */
export const compactCommandResultsMigration: CoordinationMigration = {
  id: "0014_compact_command_results",
  apply() {},
};
