import type { CoordinationMigration } from "../coordination-database.ts";
import { convertHistoricalCommandResultV1 } from "../compact-command-result.ts";

interface HistoricalResponseRow {
  retained_rowid: bigint;
  command_type: string;
  response_json: string;
}

/** Reduce supported historical snapshots without changing retry identity or authored evidence. */
export const compactHistoricalCommandResponsesMigration: CoordinationMigration = {
  id: "0015_compact_historical_command_responses",
  apply(database) {
    // Keyset reads keep memory bounded to one response and avoid changing the
    // scan when UPDATE rewrites large overflow payloads. Include explicit negative
    // rowids as well; an implicit zero cursor would skip valid retained records.
    const first = database.prepare("SELECT rowid AS retained_rowid, command_type, response_json FROM command_responses ORDER BY rowid LIMIT 1");
    const next = database.prepare("SELECT rowid AS retained_rowid, command_type, response_json FROM command_responses WHERE rowid > ? ORDER BY rowid LIMIT 1");
    first.setReadBigInts(true);
    next.setReadBigInts(true);
    const update = database.prepare("UPDATE command_responses SET response_json = ? WHERE rowid = ?");
    let row = first.get() as HistoricalResponseRow | undefined;
    while (row !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.response_json);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        // Preserve malformed legacy evidence. Replay must diagnose it rather
        // than turn a retained identity into a new command execution.
        row = next.get(row.retained_rowid) as HistoricalResponseRow | undefined;
        continue;
      }
      const conversion = convertHistoricalCommandResultV1(row.command_type, parsed);
      if (conversion.supported) {
        const compact = JSON.stringify(conversion.result);
        if (compact !== row.response_json) update.run(compact, row.retained_rowid);
      }
      // Unknown command/result shapes remain byte-for-byte intact.
      row = next.get(row.retained_rowid) as HistoricalResponseRow | undefined;
    }
  },
};
