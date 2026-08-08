import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { samePath } from "./path-identity.ts";

const execFileAsync = promisify(execFile);
const bindingKey = "coordination.projectStateRoot";
const identityFileName = "project-state.json";

export interface ProjectStatePaths {
  root: string;
  databasePath: string;
  taskWorkspaceRoot: string;
}

interface ProjectStateIdentity {
  formatVersion: 1;
  repositoryPath: string;
  gitCommonDirectory: string;
}

export async function resolveProjectState(
  projectRepositoryPath: string,
  requestedRoot?: string,
): Promise<ProjectStatePaths> {
  const repositoryPath = resolve(projectRepositoryPath);
  const gitCommonDirectory = resolve(
    repositoryPath,
    (await runGit(repositoryPath, ["rev-parse", "--git-common-dir"])).trim(),
  );
  const configured = await readOptionalBinding(repositoryPath);
  const requested = requestedRoot === undefined ? undefined : resolve(requestedRoot);
  if (configured !== undefined && requested !== undefined && !samePath(configured, requested)) {
    throw new Error(
      `Project ${repositoryPath} is already bound to ${configured}; requested state root ${requested} cannot redirect it`,
    );
  }
  const root = configured ?? requested ?? join(dirname(repositoryPath), `${basename(repositoryPath)}-agent-coordination-state`);
  const identity: ProjectStateIdentity = {
    formatVersion: 1,
    repositoryPath,
    gitCommonDirectory,
  };
  if (configured !== undefined) {
    try {
      await access(root);
    } catch {
      throw new Error(`Bound project state root ${root} does not exist; restore it before startup`);
    }
  }
  await initializeOrVerifyIdentity(root, identity, configured === undefined);
  if (configured === undefined) {
    await runGit(repositoryPath, ["config", "--local", bindingKey, root]);
  }
  const taskWorkspaceRoot = join(root, "task-worktrees");
  const databasePath = join(root, "coordination.sqlite3");
  if (configured === undefined) {
    await mkdir(taskWorkspaceRoot, { recursive: true });
  } else {
    await requireBoundPath(databasePath, `Bound coordination database ${databasePath} does not exist; restore it before startup`);
    await requireBoundPath(taskWorkspaceRoot, `Bound task-worktree directory ${taskWorkspaceRoot} does not exist; restore it before startup`);
  }
  return { root, databasePath, taskWorkspaceRoot };
}

async function requireBoundPath(path: string, message: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(message);
  }
}

async function readOptionalBinding(repositoryPath: string): Promise<string | undefined> {
  try {
    const result = await runGit(repositoryPath, ["config", "--local", "--get", bindingKey]);
    const value = result.trim();
    return value.length === 0 ? undefined : resolve(value);
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 1) return undefined;
    throw error;
  }
}

async function initializeOrVerifyIdentity(
  root: string,
  expected: ProjectStateIdentity,
  mayInitialize: boolean,
): Promise<void> {
  if (mayInitialize) await mkdir(root, { recursive: true });
  const path = join(root, identityFileName);
  try {
    const actual = JSON.parse(await readFile(path, "utf8")) as Partial<ProjectStateIdentity>;
    if (
      actual.formatVersion !== expected.formatVersion ||
      actual.repositoryPath === undefined ||
      actual.gitCommonDirectory === undefined ||
      !samePath(actual.repositoryPath, expected.repositoryPath) ||
      !samePath(actual.gitCommonDirectory, expected.gitCommonDirectory)
    ) {
      throw new Error(`Project state root ${root} belongs to another project`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (!mayInitialize) {
      throw new Error(`Bound project state root ${root} has no project identity; restore it before startup`);
    }
    await writeFile(path, `${JSON.stringify(expected, null, 2)}\n`, { flag: "wx" });
  }
}

async function runGit(repositoryPath: string, arguments_: string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", repositoryPath, ...arguments_], { encoding: "utf8" });
  return result.stdout;
}
