import { writeFile } from "node:fs/promises";

export async function writeProcessEvolutionDefinition(
  path: string,
  options: {
    includeImplementation: boolean;
    boardName?: string;
    implementationName?: string;
  },
): Promise<void> {
  const boardName = options.boardName ?? "Delivery";
  const implementationName = options.implementationName ?? "Implementation";
  await writeFile(path, `schemaVersion: 1
name: Process evolution
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Preserve stable process identities.
agents:${options.includeImplementation ? `
  - id: implementer
    name: Implementation Agent
    role: Implements scoped work
    summary: Builds and verifies changes.
    instructions: ./implementer.md` : " []"}
boards:
  - id: delivery
    name: ${boardName}
    guidance: Deliver changes safely.
    columns:
      - id: backlog
        name: Backlog${options.includeImplementation ? `
      - id: implementation
        name: ${implementationName}
        watchingAgent: implementer` : ""}
`);
}
