import { execFile } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import type {
  ProcessDiagnostic,
  RuntimeStartupBoundary,
  TaskWorkspaceGitStateView,
  TaskWorkspaceView,
} from "../coordination-contract.ts";
import { normalizedPath, samePath } from "./path-identity.ts";

export async function validateTaskWorkspaceConsistency(
  projectRepositoryPath: string,
  taskWorkspaceRoot: string,
  records: Array<{ taskId: string; workspace: TaskWorkspaceView }>,
): Promise<ProcessDiagnostic[]> {
  const diagnostics: ProcessDiagnostic[] = [];
  const root = resolve(taskWorkspaceRoot);
  const recordByPath = new Map(records.map((record) => [normalizedPath(record.workspace.path), record]));
  let directories: string[] = [];
  try {
    directories = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  let registered: string[];
  try {
    registered = await readRegisteredWorktrees(projectRepositoryPath);
  } catch (error) {
    if (records.length === 0 && directories.length === 0) return [];
    throw error;
  }

  for (const record of records) {
    const expectedPath = join(root, record.taskId);
    if (!samePath(record.workspace.path, expectedPath)) {
      diagnostics.push(workspaceDiagnostic(
        root,
        record.taskId,
        record.workspace.path,
        `Database workspace path must be ${expectedPath}`,
        "Restore the bound project state root as one unit; do not redirect or reconstruct one task workspace.",
      ));
    }
    if (!directories.some((path) => samePath(path, record.workspace.path))) {
      diagnostics.push(workspaceDiagnostic(
        root,
        record.taskId,
        record.workspace.path,
        "Every database workspace record must have a workspace directory",
        "Restore the missing workspace directory from the project-state backup.",
      ));
    }
    if (!registered.some((path) => samePath(path, record.workspace.path))) {
      diagnostics.push(workspaceDiagnostic(
        root,
        record.taskId,
        record.workspace.path,
        "Every database workspace record must have a Git worktree registration",
        "Restore the project state and the repository's external Git worktree metadata together.",
      ));
    }
  }
  for (const path of directories) {
    if (!recordByPath.has(normalizedPath(path))) {
      diagnostics.push(workspaceDiagnostic(
        root,
        relative(root, path),
        path,
        "Every task-workspace directory must have a database workspace record",
        "Restore a consistent project-state backup; startup will not adopt or delete the directory.",
      ));
    }
  }
  for (const path of registered.filter((path) => isWithin(root, path))) {
    if (!recordByPath.has(normalizedPath(path))) {
      diagnostics.push(workspaceDiagnostic(
        root,
        relative(root, path),
        path,
        "Every framework-owned Git worktree registration must have a database workspace record",
        "Restore a consistent project-state backup; startup will not adopt or remove the registration.",
      ));
    }
  }
  return diagnostics;
}

export class GitTaskWorkspaceError extends Error {
  readonly boundary: RuntimeStartupBoundary;

  constructor(boundary: RuntimeStartupBoundary, message: string, cause: unknown) {
    super(message, { cause });
    this.name = "GitTaskWorkspaceError";
    this.boundary = boundary;
  }
}

class TaskWorkspaceRegistrationError extends Error {}

export class GitTaskWorkspaceManager {
  readonly projectRepositoryPath: string;
  readonly taskWorkspaceRoot: string;
  readonly #runGit: typeof runGit;

  constructor(
    projectRepositoryPath: string,
    taskWorkspaceRoot: string,
    runGitCommand: typeof runGit = runGit,
  ) {
    this.projectRepositoryPath = projectRepositoryPath;
    this.taskWorkspaceRoot = taskWorkspaceRoot;
    this.#runGit = runGitCommand;
  }

  pathFor(taskId: string): string {
    return join(this.taskWorkspaceRoot, taskId);
  }

  async provision(
    taskId: string,
    startingRef: string,
    existing: TaskWorkspaceView | undefined,
  ): Promise<TaskWorkspaceView> {
    if (existing !== undefined) {
      await this.verify(taskId, existing);
      return existing;
    }

    await atBoundary(
      "repository-access",
      `Could not access project repository ${this.projectRepositoryPath}`,
      this.#runGit(["-C", this.projectRepositoryPath, "rev-parse", "--git-dir"]),
    );
    const commit = (
      await atBoundary(
        "starting-ref-resolution",
        `Could not resolve task workspace starting ref ${startingRef}`,
        this.#runGit([
          "-C",
          this.projectRepositoryPath,
          "rev-parse",
          "--verify",
          `${startingRef}^{commit}`,
        ]),
      )
    ).trim();
    await atBoundary(
      "workspace-preparation",
      `Could not prepare task workspace root ${this.taskWorkspaceRoot}`,
      mkdir(this.taskWorkspaceRoot, { recursive: true }),
    );
    const path = this.pathFor(taskId);
    await atBoundary(
      "worktree-registration",
      `Could not register task ${taskId} worktree`,
      this.#runGit([
        "-C",
        this.projectRepositoryPath,
        "worktree",
        "add",
        "--detach",
        path,
        commit,
      ]),
    );
    return { path, startingRef, commit };
  }

  async verify(
    taskId: string,
    workspace: TaskWorkspaceView,
  ): Promise<void> {
    const expectedPath = this.pathFor(taskId);
    try {
      if (!samePath(workspace.path, expectedPath)) {
        throw new TaskWorkspaceRegistrationError("unexpected path");
      }
      const registration = await this.#runGit([
        "-C",
        this.projectRepositoryPath,
        "worktree",
        "list",
        "--porcelain",
      ]);
      const entry = registration
        .split(/\r?\n\r?\n/)
        .find((candidate) => {
          const registeredPath = /^worktree (.+)$/m.exec(candidate)?.[1];
          return registeredPath !== undefined && samePath(registeredPath, workspace.path);
        });
      if (entry === undefined) throw new TaskWorkspaceRegistrationError("unexpected registration");
      const isWorktree = (
        await this.#runGit(
          ["-C", workspace.path, "rev-parse", "--is-inside-work-tree"],
          gitSafeDirectoryEnvironment(workspace.path),
        )
      ).trim();
      if (isWorktree !== "true") {
        throw new TaskWorkspaceRegistrationError("unexpected registration");
      }
    } catch (error) {
      throw new GitTaskWorkspaceError(
        "worktree-registration",
        `Task ${taskId} workspace is not the registered task worktree expected by the project`,
        error,
      );
    }
  }

  async inspectGitState(workspace: TaskWorkspaceView): Promise<TaskWorkspaceGitStateView> {
    const [statusOutput, numstatOutput, descendsFromStart] = await Promise.all([
      runGit(["-C", workspace.path, "status", "--porcelain=v2", "--branch", "--untracked-files=all"]),
      runGit(["-C", workspace.path, "diff", "--numstat", "HEAD", "--"]),
      runGitForExitCode(["-C", workspace.path, "merge-base", "--is-ancestor", workspace.commit, "HEAD"]),
    ]);
    if (descendsFromStart !== 0 && descendsFromStart !== 1) {
      throw new Error(`Git ancestry check failed with exit code ${descendsFromStart}.`);
    }

    const branch = statusOutput
      .split(/\r?\n/)
      .find((line) => line.startsWith("# branch.head "))
      ?.slice("# branch.head ".length);
    const oid = statusOutput
      .split(/\r?\n/)
      .find((line) => line.startsWith("# branch.oid "))
      ?.slice("# branch.oid ".length);
    if (branch === undefined || oid === undefined || oid === "(initial)") {
      throw new Error("Git status did not report a current HEAD.");
    }

    let stagedFiles = 0;
    let unstagedFiles = 0;
    let untrackedFiles = 0;
    for (const line of statusOutput.split(/\r?\n/)) {
      if (line.startsWith("? ")) {
        untrackedFiles += 1;
      } else if (/^[12u] /.test(line)) {
        const state = line.slice(2, 4);
        if (state[0] !== ".") stagedFiles += 1;
        if (state[1] !== ".") unstagedFiles += 1;
      }
    }

    let additions = 0;
    let deletions = 0;
    for (const line of numstatOutput.split(/\r?\n/)) {
      if (line.length === 0) continue;
      const [added, deleted] = line.split("\t", 3);
      if (added !== undefined && added !== "-") additions += Number.parseInt(added, 10);
      if (deleted !== undefined && deleted !== "-") deletions += Number.parseInt(deleted, 10);
    }

    const history = descendsFromStart === 0
      ? {
          kind: "progress" as const,
          commitsSinceTaskStart: Number.parseInt((await runGit([
            "-C", workspace.path, "rev-list", "--count", `${workspace.commit}..HEAD`,
          ])).trim(), 10),
        }
      : { kind: "diverged" as const };

    return {
      head: branch === "(detached)"
        ? { kind: "detached", shortHash: oid.slice(0, 7) }
        : { kind: "branch", name: branch, shortHash: oid.slice(0, 7) },
      history,
      changes: { additions, deletions, stagedFiles, unstagedFiles, untrackedFiles },
    };
  }

  async removeForArchival(
    taskId: string,
    workspace: TaskWorkspaceView,
    discardChanges?: true,
  ): Promise<
    { removed: true } | {
      removed: false;
      reason:
        | "workspace-dirty"
        | "workspace-commit-not-durable"
        | "workspace-registration-invalid"
        | "workspace-ownership-untrusted"
        | "workspace-locked"
        | "workspace-removal-failed"
        | "workspace-cleanup-failed";
    }
  > {
    try {
      await this.verify(taskId, workspace);
    } catch (error) {
      return {
        removed: false,
        reason: isDubiousOwnership(error)
          ? "workspace-ownership-untrusted"
          : hasErrorType(error, TaskWorkspaceRegistrationError)
            ? "workspace-registration-invalid"
            : "workspace-cleanup-failed",
      };
    }
    try {
      const environment = gitSafeDirectoryEnvironment(workspace.path);
      const status = await this.#runGit(
        ["-C", workspace.path, "status", "--porcelain", "--untracked-files=all"],
        environment,
      );
      if (status.trim().length > 0 && !discardChanges) {
        return { removed: false, reason: "workspace-dirty" };
      }
      const refs = await this.#runGit(
        ["-C", workspace.path, "for-each-ref", "--format=%(refname)", "--contains", "HEAD"],
        environment,
      );
      if (refs.trim().length === 0) return { removed: false, reason: "workspace-commit-not-durable" };
    } catch (error) {
      return {
        removed: false,
        reason: isDubiousOwnership(error)
          ? "workspace-ownership-untrusted"
          : "workspace-cleanup-failed",
      };
    }
    try {
      await this.#runGit([
        "-C",
        this.projectRepositoryPath,
        "worktree",
        "remove",
        ...(discardChanges ? ["--force"] : []),
        workspace.path,
      ]);
      return { removed: true };
    } catch (error) {
      return {
        removed: false,
        reason: isLockedWorktree(error)
          ? "workspace-locked"
          : isDubiousOwnership(error)
            ? "workspace-ownership-untrusted"
            : "workspace-removal-failed",
      };
    }
  }

  async inspectInterruptedArchival(
    workspace: TaskWorkspaceView,
  ): Promise<"intact" | "removed" | "inconsistent"> {
    const directoryExists = await stat(workspace.path)
      .then((entry) => entry.isDirectory())
      .catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? false : Promise.reject(error));
    const registered = (await readRegisteredWorktrees(this.projectRepositoryPath))
      .some((path) => samePath(path, workspace.path));
    if (directoryExists && registered) return "intact";
    if (!directoryExists && !registered) return "removed";
    return "inconsistent";
  }
}

async function atBoundary<T>(
  boundary: RuntimeStartupBoundary,
  message: string,
  work: Promise<T>,
): Promise<T> {
  try {
    return await work;
  } catch (error) {
    throw new GitTaskWorkspaceError(boundary, message, error);
  }
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

async function readRegisteredWorktrees(projectRepositoryPath: string): Promise<string[]> {
  const output = await runGit([
    "-C", projectRepositoryPath, "worktree", "list", "--porcelain",
  ]);
  return [...output.matchAll(/^worktree (.+)$/gm)].map((match) => resolve(match[1] ?? ""));
}

function workspaceDiagnostic(
  root: string,
  taskId: string,
  invalidValue: string,
  rule: string,
  correction: string,
): ProcessDiagnostic {
  return {
    file: root,
    line: 1,
    column: 1,
    invalidValue: { taskId, path: invalidValue },
    rule,
    consequence: "Startup is blocked before board mutation or agent dispatch.",
    correction,
  };
}

function runGit(arguments_: string[], environment?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", arguments_, { encoding: "utf8", env: environment }, (error, stdout) => {
      if (error !== null) reject(error);
      else resolve(stdout);
    });
  });
}

function gitSafeDirectoryEnvironment(path: string): NodeJS.ProcessEnv {
  const configuration: Array<[string, string]> = [];
  const inheritedCount = Number.parseInt(process.env.GIT_CONFIG_COUNT ?? "0", 10);
  for (let index = 0; index < inheritedCount; index += 1) {
    const key = process.env[`GIT_CONFIG_KEY_${index}`];
    const value = process.env[`GIT_CONFIG_VALUE_${index}`];
    if (key !== undefined && value !== undefined && key.toLocaleLowerCase() !== "safe.directory") {
      configuration.push([key, value]);
    }
  }
  configuration.push([
    "safe.directory",
    /^(?:[A-Za-z]:\\|\\\\)/u.test(path) ? path.replaceAll("\\", "/") : path,
  ]);
  const environment: NodeJS.ProcessEnv = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/iu.test(key),
      ),
    ),
    GIT_CONFIG_COUNT: configuration.length.toString(),
  };
  for (const [index, [key, value]] of configuration.entries()) {
    environment[`GIT_CONFIG_KEY_${index}`] = key;
    environment[`GIT_CONFIG_VALUE_${index}`] = value;
  }
  return environment;
}

function isDubiousOwnership(error: unknown): boolean {
  return errorDescription(error).match(/dubious ownership|safe\.directory/iu) !== null;
}

function isLockedWorktree(error: unknown): boolean {
  return errorDescription(error).match(/locked (?:working tree|worktree)|worktree is locked/iu) !== null;
}

function errorDescription(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
  const cause = error.cause === undefined ? "" : errorDescription(error.cause);
  return `${error.message}\n${stderr}\n${cause}`;
}

function hasErrorType<T extends Error>(
  error: unknown,
  errorType: abstract new (...arguments_: never[]) => T,
): boolean {
  if (error instanceof errorType) return true;
  return error instanceof Error && error.cause !== undefined
    ? hasErrorType(error.cause, errorType)
    : false;
}

function runGitForExitCode(arguments_: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile("git", arguments_, { encoding: "utf8" }, (error) => {
      if (error === null) resolve(0);
      else if (typeof error.code === "number") resolve(error.code);
      else reject(error);
    });
  });
}
