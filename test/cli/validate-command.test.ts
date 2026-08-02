import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { escapeRegExp } from "../support/text.ts";

const execFileAsync = promisify(execFile);
const cliPath = resolve("src/cli.ts");

test("the validate command reports success and actionable failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-cli-"));
  const definitionPath = join(directory, "process.yaml");
  const validDefinition = `schemaVersion: 1
name: CLI process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Validate before startup.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver changes.
    columns:
      - id: backlog
        name: Backlog
`;
  await writeFile(definitionPath, validDefinition);

  const valid = await execFileAsync(process.execPath, [
    "--experimental-strip-types",
    cliPath,
    "validate",
    definitionPath,
  ]);
  assert.match(valid.stdout, /Valid process definition/);
  assert.match(valid.stdout, /Semantic version: [a-f0-9]{64}/);

  await writeFile(definitionPath, validDefinition.replace("schemaVersion: 1", "schemaVersion: 2"));
  await assert.rejects(
    execFileAsync(process.execPath, [
      "--experimental-strip-types",
      cliPath,
      "validate",
      definitionPath,
    ]),
    (error: unknown) => {
      const failure = error as { code: number; stdout: string };
      assert.equal(failure.code, 1);
      assert.match(failure.stdout, new RegExp(`${escapeRegExp(definitionPath)}:1:16`));
      assert.match(failure.stdout, /Rule:/);
      assert.match(failure.stdout, /Consequence:/);
      assert.match(failure.stdout, /Correction:/);
      return true;
    },
  );
});
