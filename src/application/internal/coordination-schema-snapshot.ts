import { readFileSync } from "node:fs";
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
      AND name NOT GLOB 'sqlite_*'
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

/** Read-only review evidence; this SQL is never used to initialize a database. */
export function readExpectedCoordinationSchema(): string {
  return readFileSync(new URL("./migrations/current-schema.sql", import.meta.url), "utf8");
}

export function verifyCoordinationSchema(database: DatabaseSync, expected: string): boolean {
  const actualObjects = snapshotObjects(describeCoordinationSchema(database));
  const expectedObjects = snapshotObjects(expected);
  for (const [name, definition] of expectedObjects) {
    if (actualObjects.get(name) !== definition) {
      throw new Error(`The expected schema object ${name} is missing or changed.`);
    }
  }
  for (const name of actualObjects.keys()) {
    if (!expectedObjects.has(name)) throw new Error(`Unexpected schema object ${name}.`);
  }
  return true;
}

function snapshotObjects(snapshot: string): Map<string, string> {
  const headers = [...snapshot.matchAll(/^-- (table|index|trigger|view) (\S+) on (\S+)\r?$/gm)];
  if (headers.length === 0 || snapshot.slice(0, headers[0]!.index).trim() !== "") {
    throw new Error("Invalid coordination schema snapshot: expected generated object headers.");
  }
  const objects = new Map<string, string>();
  for (const [index, header] of headers.entries()) {
    const key = `${header[1]} ${header[2]}`;
    if (objects.has(key)) throw new Error(`Duplicate schema snapshot object ${key}.`);
    const sql = snapshot.slice(header.index + header[0].length, headers[index + 1]?.index);
    objects.set(key, JSON.stringify([header[3], sqlTokens(sql)]));
  }
  return objects;
}

/**
 * Conservative lexical comparison, not an SQL equivalence prover. Ignore layout,
 * comments and keyword case; preserve literals, operators and expression tokens.
 * SQLite adds quotes to table names on ALTER TABLE RENAME. Only unquote simple
 * identifiers at explicit object/table-name positions, never expression strings.
 */
function sqlTokens(sql: string): string[] {
  const tokens: string[] = [];
  const lexer = /\s+|--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|[a-zA-Z_][a-zA-Z_0-9$]*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|->>|->|\|\||<<|>>|<=|>=|==|!=|<>|[^\s]/g;
  const significant = [...sql.matchAll(lexer)].map(([token]) => token)
    .filter((token) => !/^(?:\s|--|\/\*)/.test(token));
  const objectTypeIndex = significant[1]?.toLowerCase() === "unique" ? 2 : 1;
  // sqlite_schema normally removes IF NOT EXISTS; tolerate it in reviewed DDL.
  if (significant[0]?.toLowerCase() === "create" && significant.slice(objectTypeIndex + 1, objectTypeIndex + 4).join(" ").toLowerCase() === "if not exists") {
    significant.splice(objectTypeIndex + 1, 3);
  }
  const onTableIndex = ["index", "trigger"].includes(significant[objectTypeIndex]?.toLowerCase() ?? "")
    ? significant.findIndex((token) => token.toLowerCase() === "on") + 1 : -1;
  for (const [index, token] of significant.entries()) {
    const previous = tokens.at(-1);
    const objectName = tokens[0] === "create" && index === objectTypeIndex + 1;
    const tableName = index === onTableIndex ||
      ["references", "from", "join", "update", "into"].includes(previous ?? "");
    const quotedIdentifier = /^(?:"([a-zA-Z_][a-zA-Z_0-9]*)"|`([a-zA-Z_][a-zA-Z_0-9]*)`|\[([a-zA-Z_][a-zA-Z_0-9]*)\])$/.exec(token);
    tokens.push(quotedIdentifier !== null && (objectName || tableName)
      ? (quotedIdentifier[1] ?? quotedIdentifier[2] ?? quotedIdentifier[3])!.toLowerCase()
      : /^[a-zA-Z_]/.test(token) ? token.toLowerCase() : token);
  }
  if (tokens.at(-1) === ";") tokens.pop();
  return tokens;
}

function normalizeSql(sql: string): string {
  return sql.trim().replace(/;$/, "");
}
