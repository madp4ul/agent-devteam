import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { CoordinationDatabase } from "../src/application/internal/coordination-database.ts";
import { describeCoordinationSchema } from "../src/application/internal/coordination-schema-snapshot.ts";

const database = CoordinationDatabase.open(":memory:");
try {
  const snapshot = describeCoordinationSchema(database.connection);
  await writeFile(
    join(import.meta.dirname, "../src/application/internal/migrations/current-schema.sql"),
    snapshot,
  );
} finally {
  database.close();
}
