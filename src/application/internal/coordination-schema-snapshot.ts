import type { DatabaseSync } from "node:sqlite";

interface SchemaObjectRow {
  type: "index" | "table" | "trigger" | "view";
  name: string;
  table_name: string;
  sql: string;
}

export function describeCoordinationSchema(database: DatabaseSync): string {
  const objects = database.prepare(`
    SELECT type, name, tbl_name AS table_name, sql
    FROM sqlite_schema
    WHERE sql IS NOT NULL
      AND name NOT LIKE 'sqlite_%'
    ORDER BY CASE type
      WHEN 'table' THEN 1
      WHEN 'index' THEN 2
      WHEN 'trigger' THEN 3
      WHEN 'view' THEN 4
      ELSE 5
    END, name
  `).all() as unknown as SchemaObjectRow[];

  return objects.map(({ type, name, table_name, sql }) =>
    `-- ${type} ${name} on ${table_name}\n${normalizeSql(sql)};`
  ).join("\n\n") + "\n";
}

function normalizeSql(sql: string): string {
  return sql.trim().replace(/\r\n/g, "\n").replace(/;$/, "");
}
