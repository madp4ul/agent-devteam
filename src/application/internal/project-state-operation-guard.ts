import { randomUUID } from "node:crypto";
import { open, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { resolveProjectGitCommonDirectory, runProjectGit } from "./project-git.ts";

interface GuardRecord {
  token: string;
  pid: number;
  operation: string;
  acquiredAt: string;
}

export interface ProjectStateOperationGuard {
  release(): Promise<void>;
}

export async function acquireProjectStateOperationGuard(
  projectRepositoryPath: string,
  operation: "application start" | "state relocation",
): Promise<ProjectStateOperationGuard> {
  const repositoryPath = resolve(projectRepositoryPath);
  const commonDirectory = await resolveProjectGitCommonDirectory(repositoryPath);
  const guardPath = resolve(commonDirectory, "coordination-project-state.lock");
  const record: GuardRecord = {
    token: randomUUID(),
    pid: process.pid,
    operation,
    acquiredAt: new Date().toISOString(),
  };
  const serialized = `${JSON.stringify(record)}\n`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const handle = await open(guardPath, "wx");
      try {
        await handle.writeFile(serialized, "utf8");
      } catch (error) {
        await handle.close().catch(() => undefined);
        await rm(guardPath, { force: true }).catch(() => undefined);
        throw error;
      }
      await handle.close();
      return {
        release: async () => {
          const current = await readFile(guardPath, "utf8").catch(() => undefined);
          if (current === serialized) await rm(guardPath, { force: true });
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existingText = await readFile(guardPath, "utf8").catch(() => undefined);
      const existing = parseRecord(existingText);
      if (existing === undefined) {
        throw new Error(
          `Project-state lock ${guardPath} is incomplete or invalid; access remains blocked because stale ownership cannot be proven`,
        );
      }
      if (processIsAlive(existing.pid)) {
        throw new Error(
          `Project state is in use by ${existing.operation} (process ${existing.pid}); stop the application and agents before continuing`,
        );
      }
      if (operation === "state relocation" && await stateMayHaveSurvivingAgents(repositoryPath)) {
        throw new Error(
          `Project state records an agent attempt left running by stopped process ${existing.pid}; ` +
          "restart the application with its normal coordination start command and shut it down cleanly before relocating",
        );
      }
      const unchanged = await readFile(guardPath, "utf8").catch(() => undefined);
      if (unchanged !== existingText) continue;
      await rm(guardPath, { force: true });
    }
  }
  throw new Error("Could not acquire exclusive project-state access; try again after the current operation finishes");
}

async function stateMayHaveSurvivingAgents(repositoryPath: string): Promise<boolean> {
  let stateRoot: string;
  try {
    stateRoot = (await runProjectGit(repositoryPath, [
      "config", "--local", "--get", "coordination.projectStateRoot",
    ])).trim();
  } catch {
    return false;
  }
  if (stateRoot.length === 0) return false;
  const database = new DatabaseSync(join(resolve(stateRoot), "coordination.sqlite3"), { readOnly: true });
  try {
    const row = database.prepare("SELECT COUNT(*) AS count FROM attempts WHERE status = 'running'").get() as {
      count: number;
    };
    return row.count > 0;
  } finally {
    database.close();
  }
}

function parseRecord(value: string | undefined): GuardRecord | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<GuardRecord>;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.pid !== "number" ||
      typeof parsed.operation !== "string" ||
      typeof parsed.acquiredAt !== "string"
    ) return undefined;
    return parsed as GuardRecord;
  } catch {
    return undefined;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
