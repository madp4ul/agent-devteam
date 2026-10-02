import { randomBytes } from "node:crypto";
import type { CoordinationMigration } from "../coordination-database.ts";

export const historyCursorSigningMigration: CoordinationMigration = {
  id: "0006_history_cursor_signing",
  apply(database) {
    database.exec("CREATE TABLE history_cursor_identity (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), secret TEXT NOT NULL)");
    database.prepare("INSERT INTO history_cursor_identity VALUES (1, ?)").run(randomBytes(32).toString("hex"));
  },
};
