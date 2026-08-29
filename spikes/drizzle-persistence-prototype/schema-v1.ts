import { count, eq, sql } from "drizzle-orm";
import { integer, sqliteTable, sqliteView, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  metadataJson: text("metadata_json").notNull(),
  revision: integer("revision").notNull().default(1),
});

export const activations = sqliteTable("activations", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["queued", "running", "completed"] }).notNull(),
  payloadJson: text("payload_json").notNull(),
}, (table) => [
  uniqueIndex("one_running_activation_per_task")
    .on(table.taskId)
    .where(sql`${table.status} = 'running'`),
]);

export const taskActivationSummary = sqliteView("task_activation_summary").as((query) =>
  query.select({
    taskId: tasks.id,
    title: tasks.title,
    activationCount: count(activations.id).as("activation_count"),
  }).from(tasks)
    .leftJoin(activations, eq(activations.taskId, tasks.id))
    .groupBy(tasks.id, tasks.title)
);
