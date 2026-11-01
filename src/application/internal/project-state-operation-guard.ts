import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { open, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";

import { resolveProjectGitCommonDirectory, runProjectGit } from "./project-git.ts";

const execFileAsync = promisify(execFile);

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
  operation: "application start" | "state relocation" | "state maintenance",
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
      if (await ownerProcessIsAlive(existing)) {
        throw new Error(
          `Project state is in use by ${existing.operation} (process ${existing.pid}); stop the application and agents before continuing`,
        );
      }
      if (operation !== "application start" && await stateMayHaveSurvivingAgents(repositoryPath)) {
        throw new Error(
          `Project state records an agent attempt left running by stopped process ${existing.pid}; ` +
          "restart the application with its normal coordination start command and shut it down cleanly before continuing",
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
      !Number.isSafeInteger(parsed.pid) || parsed.pid <= 0 ||
      typeof parsed.operation !== "string" ||
      typeof parsed.acquiredAt !== "string" || !Number.isFinite(Date.parse(parsed.acquiredAt))
    ) return undefined;
    return parsed as GuardRecord;
  } catch {
    return undefined;
  }
}

async function ownerProcessIsAlive(record: GuardRecord): Promise<boolean> {
  try {
    process.kill(record.pid, 0);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
  try {
    // A surviving PID alone is not ownership: Windows (and Unix) reuse PIDs.
    // A process born after acquisition cannot be the recorded owner. This also
    // recovers old guards without changing their on-disk format.
    const result = process.platform === "win32"
      ? await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `(Get-Process -Id ${record.pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`],
        { encoding: "utf8", windowsHide: true, timeout: 5_000 })
      : await execFileAsync("ps", ["-p", String(record.pid), "-o", "lstart="],
        { encoding: "utf8", env: { ...process.env, LC_ALL: "C" }, timeout: 5_000 });
    const startedAt = Date.parse(result.stdout.trim());
    return !Number.isFinite(startedAt) || startedAt <= Date.parse(record.acquiredAt);
  } catch {
    // Lack of process-inspection permission/evidence never proves stale ownership.
    return true;
  }
}
