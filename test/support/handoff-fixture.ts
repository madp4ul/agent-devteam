import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createCommittedTestRepository } from "./agent-runtime-fixture.ts";

export { ControlledAgentRuntime, PausedRetryClock } from "./agent-runtime-fixture.ts";

export async function createHandoffFixture(): Promise<{
  definitionPath: string;
  databasePath: string;
  repositoryPath: string;
  workspaceRoot: string;
  implementerInstructionsPath: string;
}> {
  const { directory, repositoryPath } = await createCommittedTestRepository(
    "coordination-handoff-",
  );
  const implementerInstructionsPath = join(directory, "implementer.md");
  await writeFile(implementerInstructionsPath, "Implement and hand off the task.\n");
  await writeFile(join(directory, "reviewer.md"), "Review the completed implementation.\n");
  const definitionPath = join(directory, "process.yaml");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Handoff process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep every handoff explicit.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements scoped tasks
    summary: Builds the requested change.
    instructions: ./implementer.md
    model: gpt-5.6-sol
    reasoningEffort: medium
  - id: reviewer
    name: Code Reviewer
    role: Reviews implementations
    summary: Reviews completed changes.
    instructions: ./reviewer.md
    model: gpt-5.6-terra
    reasoningEffort: high
boards:
  - id: delivery
    name: Delivery
    guidance: Move completed work to review.
    columns:
      - id: implementation
        name: Implementation
        watchingAgent: implementer
      - id: review
        name: Review
        watchingAgent: reviewer
`,
  );
  return {
    definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
    repositoryPath,
    workspaceRoot: join(directory, "workspaces"),
    implementerInstructionsPath,
  };
}
