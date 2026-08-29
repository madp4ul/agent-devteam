import { createInterface } from "node:readline/promises";

import { runDrizzleSlice } from "./drizzle-slice.ts";
import { runDrizzleMigration, runRawMigration } from "./migration.ts";
import { runRawSlice } from "./raw-sql.ts";

const actions = {
  q: async () => ({ question: "Quit", state: { done: true } }),
  r: async () => ({ question: "Routine and difficult query comparison", state: [runRawSlice(), runDrizzleSlice()] }),
  m: async () => ({ question: "Released-like migration comparison", state: [await runRawMigration(), await runDrizzleMigration()] }),
  a: async () => ({
    question: "Complete comparison",
    state: {
      queries: [runRawSlice(), runDrizzleSlice()],
      migrations: [await runRawMigration(), await runDrizzleMigration()],
    },
  }),
};

type Action = keyof typeof actions;
const runAll = process.argv.includes("--all");
const input = createInterface({ input: process.stdin, output: process.stdout });
let frame: unknown = {
  question: "Does Drizzle improve the fully transitioned persistence and migration steady state?",
  state: "Choose an evidence slice.",
};

try {
  if (runAll) {
    frame = await actions.a();
    render(frame, false);
  } else {
    while (true) {
      render(frame, true);
      const answer = (await input.question("> ")).trim().toLowerCase() as Action;
      if (!(answer in actions)) continue;
      frame = await actions[answer]();
      if (answer === "q") break;
    }
  }
} finally {
  input.close();
}

function render(value: unknown, clear: boolean): void {
  if (clear) console.clear();
  console.log("\x1b[1mPROTOTYPE — Drizzle persistence and migration ergonomics\x1b[0m");
  console.log("\x1b[2mThrowaway evidence; scratch databases are deleted after each action.\x1b[0m\n");
  console.log(JSON.stringify(value, null, 2));
  if (clear) console.log("\n\x1b[1m[r]\x1b[0m queries  \x1b[1m[m]\x1b[0m migrations  \x1b[1m[a]\x1b[0m all  \x1b[1m[q]\x1b[0m quit");
}
