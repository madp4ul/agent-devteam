import type { CoordinationMigration } from "../coordination-database.ts";

export const resourceCatalogMigration: CoordinationMigration = {
  id: "0016_resource_catalog",
  apply(database) {
    database.exec(`CREATE TABLE resources (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
    );`);
  },
};
