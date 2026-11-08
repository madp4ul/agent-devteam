// Disposable startup benchmark; never accepts a retained database path.
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CoordinationDatabase } from "../../src/application/internal/coordination-database.ts";

const directory = await mkdtemp(join(tmpdir(), "coordination-startup-benchmark-"));
const path = join(directory, "coordination.sqlite3");
try {
  const database = await CoordinationDatabase.open(path);
  const payload = JSON.stringify({ historicalResponse: "x".repeat(1024 * 1024) });
  database.transaction(() => {
    const insert = database.connection.prepare("INSERT INTO command_responses(command_type,idempotency_key,response_json) VALUES ('benchmark',?,?)");
    for (let row = 0; row < 1024; row++) insert.run(String(row), payload);
  });
  database.close();
  console.log(JSON.stringify({ node: process.version, databaseBytes: (await stat(path)).size }));
  for (const strategy of ["copied", "direct", "direct", "copied"]) {
    // An empty cold journal selects the unchanged pre-existing copy path. The
    // database bytes, ledger, schema and health checks are identical in both.
    if (strategy === "copied") await writeFile(`${path}-journal`, "");
    else await rm(`${path}-journal`, { force: true });
    const copied = new Map();
    const phases = [];
    const start = performance.now();
    const opened = await CoordinationDatabase.open(path, ({ phase, detail }) => {
      if (phases.at(-1) !== phase) phases.push(phase);
      const match = detail?.match(/^(.*): copied (\d+) \/ \d+ bytes$/);
      if (match) copied.set(match[1], Number(match[2]));
    });
    opened.close();
    console.log(JSON.stringify({ strategy, elapsedMs: Math.round(performance.now() - start),
      copiedBytes: [...copied.values()].reduce((sum, value) => sum + value, 0), phases }));
  }
} finally { await rm(directory, { recursive: true, force: true }); }
