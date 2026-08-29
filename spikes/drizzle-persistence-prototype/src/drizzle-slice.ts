import Database from "better-sqlite3";
import { count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { activations, tasks } from "../schema-v1.ts";
import type { SliceEvidence, TaskInput } from "./model.ts";
import { rawV1Schema } from "./raw-sql.ts";

export function runDrizzleSlice(): SliceEvidence {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(rawV1Schema);
  const database = drizzle(sqlite);
  const input: TaskInput = {
    id: "task-1",
    title: "Prototype persistence",
    active: true,
    metadata: { priority: "high" },
  };
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    database.insert(tasks).values({
      id: input.id,
      title: input.title,
      active: input.active,
      metadataJson: JSON.stringify(input.metadata),
    }).run();
    database.update(tasks)
      .set({ title: "Prototype persistence updated", revision: sql`${tasks.revision} + 1` })
      .where(sql`${tasks.id} = ${input.id} AND ${tasks.revision} = 1`)
      .run();
    database.insert(activations).values({
      id: "activation-1",
      taskId: input.id,
      status: "running",
      payloadJson: JSON.stringify({ reason: "column-entry" }),
    }).run();
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
  const row = database.select().from(tasks).where(eq(tasks.id, input.id)).get();
  if (row === undefined) throw new Error("Drizzle task row missing");
  const projectionQuery = database.select({
    taskId: tasks.id,
    title: tasks.title,
    priority: sql<string>`json_extract(${tasks.metadataJson}, '$.priority')`,
    activationCount: count(activations.id),
    runningActivationId: sql<string | null>`MAX(CASE WHEN ${activations.status} = 'running' THEN ${activations.id} END)`,
  }).from(tasks)
    .leftJoin(activations, eq(activations.taskId, tasks.id))
    .groupBy(tasks.id, tasks.title, tasks.metadataJson)
    .orderBy(tasks.id);
  const projection = projectionQuery.all();
  sqlite.close();
  return {
    approach: "Drizzle",
    routine: {
      id: row.id,
      title: row.title,
      active: row.active,
      metadata: JSON.parse(row.metadataJson) as TaskInput["metadata"],
      revision: row.revision,
    },
    projection,
    emittedSql: projectionQuery.toSQL().sql,
    transactionVisible: true,
    handwrittenResultAssertions: 0,
    uncheckedSqlTypeHints: 2,
    runtimeDecoders: ["JSON metadata"],
  };
}
