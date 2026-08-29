import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

import { tasks } from "../schema-v1.ts";

const database = drizzle(new Database(":memory:"));

// These compile because Drizzle derives columns, insert values, nullability,
// and aliases from the schema and selection.
const validInsert = database.insert(tasks).values({
  id: "task-1",
  title: "Valid",
  active: true,
  metadataJson: "{}",
});
const validSelection = database.select({ taskId: tasks.id, title: tasks.title })
  .from(tasks).where(eq(tasks.id, "task-1"));
type ValidSelection = ReturnType<typeof validSelection.all>;
const selected: ValidSelection[number] = { taskId: "task-1", title: "Valid" };

// @ts-expect-error renamed/missing schema column is rejected.
database.select({ name: tasks.name }).from(tasks);
// @ts-expect-error wrong insert type is rejected.
database.insert(tasks).values({ id: "bad", title: "Bad", active: "yes", metadataJson: "{}" });
// @ts-expect-error required non-null title cannot be omitted.
database.insert(tasks).values({ id: "bad", active: true, metadataJson: "{}" });
// @ts-expect-error required title cannot become null.
database.insert(tasks).values({ id: "bad", title: null, active: true, metadataJson: "{}" });
// @ts-expect-error selected alias is taskId, not id.
const wrongAlias: ValidSelection[number] = { id: "task-1", title: "Wrong" };

// Raw expressions still require a trusted sql<T> claim; changing the SQL can
// make this declaration lie without a TypeScript error.
const uncheckedJsonPriority = sql<string>`json_extract(${tasks.metadataJson}, '$.priority')`;

void validInsert;
void selected;
void wrongAlias;
void uncheckedJsonPriority;
