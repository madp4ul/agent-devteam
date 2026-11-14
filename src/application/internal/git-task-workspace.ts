import { workspaceGitSummary } from "./workspace-git-summary.ts";
import { readGitRecords, runGit, runGitForExitCode, gitSafeDirectoryEnvironment } from "./git-command.ts";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import type { WorkspaceProgressView } from "../automation-contract.ts";
import { GitProgressReader } from "./git-progress.ts";
import type { ProcessDiagnostic } from "../process-contract.ts";
import type { RuntimeStartupBoundary } from "../runtime-contract.ts";
import type {
  TaskWorkspaceGitStateView,
  TaskWorkspaceView,
  WorkspaceCleanupFailure,
} from "../task-contract.ts";
import { normalizedPath, samePath } from "./path-identity.ts";
import { GitArchivalReview, within as isWithin } from "./git-archival-review.ts";

export async function validateTaskWorkspaceConsistency(
  projectRepositoryPath: string,
  taskWorkspaceRoot: string,
  records: Array<{ taskId: string; workspace: TaskWorkspaceView }>,
  options: { allowNestedEvidenceWorktrees?: boolean } = {},
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
    if (!(await hasWorktreeGitPointer(record.workspace.path))) {
      diagnostics.push(workspaceDiagnostic(
        root,
        record.taskId,
        record.workspace.path,
        "Every recorded task workspace must retain its Git pointer",
        "Inspect the retained registration and partial archival state before repairing the workspace metadata.",
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
    // Agents may register evidence worktrees within their task workspace.
    // Only a recorded, correctly located task can own those nested paths;
    // unknown containers and the task registrations themselves remain checked.
    if (options.allowNestedEvidenceWorktrees !== false
      && records.some((record) => samePath(record.workspace.path, join(root, record.taskId))
      && isWithin(record.workspace.path, path))) continue;
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
    onProgress?: (progress: WorkspaceProgressView) => void,
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
    const progress = new GitProgressReader(onProgress ?? (() => {}));
    onProgress?.({ stage: "Registering worktree" });
    await atBoundary(
      "worktree-registration",
      `Could not register task ${taskId} worktree`,
      this.#runGit([
        "-C",
        this.projectRepositoryPath,
        "worktree",
        "add",
        "--no-checkout",
        "--detach",
        path,
        commit,
      ], undefined, (chunk) => progress.write(chunk)),
    );
    onProgress?.({ stage: "Checking out files" });
    await atBoundary(
      "workspace-preparation",
      `Could not populate task ${taskId} worktree`,
      this.#runGit(["-C", path, "checkout", "--force", "--progress", "--detach", commit],
        gitSafeDirectoryEnvironment(path), (chunk) => progress.write(chunk)),
    );
    progress.finish();
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

    const history = descendsFromStart === 0
      ? {
          kind: "progress" as const,
          commitsSinceTaskStart: Number.parseInt((await runGit([
            "-C", workspace.path, "rev-list", "--count", `${workspace.commit}..HEAD`,
          ])).trim(), 10),
        }
      : { kind: "diverged" as const };

    return { ...workspaceGitSummary(statusOutput, numstatOutput), history };
  }

  async removeForArchival(
    taskId: string,
    workspace: TaskWorkspaceView,
    discardChanges?: true,
    archivalPreviewToken?: string,
  ): Promise<
    { removed: true } | {
      removed: false;
      reason:
        | "workspace-dirty"
        | "workspace-commit-not-durable"
        | "workspace-registration-invalid"
        | "workspace-ownership-untrusted"
        | "workspace-nested-worktrees"
        | "workspace-locked"
        | "workspace-removal-failed"
        | "workspace-cleanup-failed"
        | "workspace-preview-changed"
        | "workspace-preview-unavailable"
        | "workspace-nested-cleanup-failed";
      recoveryPending?: true;
      removedWorktrees?: string[];
      cleanupFailure?: WorkspaceCleanupFailure;
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
    if (archivalPreviewToken !== undefined) {
      return this.removeReviewedArchival(taskId, workspace, archivalPreviewToken);
    }
    try {
      const registrations = await readRegisteredWorktrees(this.projectRepositoryPath, this.#runGit);
      if (registrations.some((path) => isWithin(workspace.path, path))) {
        return { removed: false, reason: "workspace-nested-worktrees" };
      }
      const environment = { ...gitSafeDirectoryEnvironment(workspace.path), GIT_OPTIONAL_LOCKS: "0" };
      const directory = await lstat(workspace.path);
      const root = await realpath(this.taskWorkspaceRoot);
      if (!directory.isDirectory() || directory.isSymbolicLink() ||
        !samePath(await realpath(workspace.path), join(root, taskId))) {
        return { removed: false, reason: "workspace-registration-invalid" };
      }
      const [common, repositoryCommon, top] = await Promise.all([
        this.#runGit(["-C", workspace.path, "rev-parse", "--path-format=absolute", "--git-common-dir"], environment),
        this.#runGit(["-C", this.projectRepositoryPath, "rev-parse", "--path-format=absolute", "--git-common-dir"]),
        this.#runGit(["-C", workspace.path, "rev-parse", "--show-toplevel"], environment),
      ]);
      if (!samePath(common.trim(), repositoryCommon.trim()) || !samePath(top.trim(), workspace.path)) {
        return { removed: false, reason: "workspace-registration-invalid" };
      }
      if (discardChanges) {
        const review = await new GitArchivalReview(this.projectRepositoryPath, this.#runGit).inspect(workspace.path);
        if (!review.preview.token) return { removed: false, reason: "workspace-preview-unavailable" };
      }
      if (!discardChanges) {
        let dirty = false;
        await readGitRecords(["-C", workspace.path, "status", "--porcelain", "--untracked-files=normal"], environment,
          "line", () => { dirty = true; });
        if (dirty) return { removed: false, reason: "workspace-dirty" };
      }
      const refs = await this.#runGit(
        ["-C", workspace.path, "for-each-ref", "--count=1", "--format=%(refname)", "--contains", "HEAD"],
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
      // Git may unregister a worktree before reporting a filesystem removal
      // failure. Do not cancel its durable claim while that boundary is uncertain.
      let recovery: "intact" | "removed" | "inconsistent";
      try {
        recovery = await this.inspectInterruptedArchival(taskId, workspace);
      } catch {
        recovery = "inconsistent";
      }
      if (recovery === "removed") return { removed: true };
      return {
        removed: false,
        reason: isLockedWorktree(error)
          ? "workspace-locked"
          : isDubiousOwnership(error)
            ? "workspace-ownership-untrusted"
            : "workspace-removal-failed",
        ...(recovery === "inconsistent" ? { recoveryPending: true as const } : {}),
      };
    }
  }

  async inspectArchival(taskId: string, workspace: TaskWorkspaceView) {
    await this.verify(taskId, workspace);
    return (await new GitArchivalReview(this.projectRepositoryPath, this.#runGit).inspect(workspace.path)).preview;
  }

  async resolveArchivalPath(taskId: string, workspace: TaskWorkspaceView, path: string): Promise<TaskWorkspaceView> {
    if (!samePath(workspace.path, this.pathFor(taskId))) throw new TaskWorkspaceRegistrationError("unexpected parent path");
    const reviewer = new GitArchivalReview(this.projectRepositoryPath, this.#runGit);
    await reviewer.resolvePath(workspace.path, workspace.path);
    return { ...workspace, path: await reviewer.resolvePath(workspace.path, path) };
  }

  private async removeReviewedArchival(taskId: string, workspace: TaskWorkspaceView, token: string): Promise<
    { removed: true } | { removed: false; reason: "workspace-preview-changed" | "workspace-preview-unavailable" | "workspace-nested-cleanup-failed"; removedWorktrees?: string[]; recoveryPending?: true; cleanupFailure?: WorkspaceCleanupFailure }
  > {
    const reviewer = new GitArchivalReview(this.projectRepositoryPath, this.#runGit);
    const removedWorktrees: string[] = [];
    try {
      const review = await reviewer.inspect(workspace.path);
      if (review.preview.token === null) return { removed: false, reason: "workspace-preview-unavailable" };
      if (review.preview.token !== token) return { removed: false, reason: "workspace-preview-changed" };
      const remaining = [...review.entries].reverse();
      while (remaining.length > 0) {
        await this.verify(taskId, workspace);
        const paths = await reviewer.paths(workspace.path);
        if (paths.length !== remaining.length || paths.some((path) => !remaining.some((entry) => samePath(entry.view.path, path)))) {
          return { removed: false, reason: "workspace-preview-changed", removedWorktrees };
        }
        // Recheck every remaining target before each destructive step. An external
        // writer is not excluded by the application claim; never silently adopt it.
        for (const entry of remaining) {
          const current = await reviewer.inspectOne(workspace.path, entry.view.path, paths);
          if (current.fingerprint !== entry.fingerprint) {
            return { removed: false, reason: "workspace-preview-changed", removedWorktrees };
          }
        }
        const target = remaining.shift()!;
        try {
          await this.#runGit(["-C", this.projectRepositoryPath, "worktree", "remove", "--force", target.view.path]);
        } catch (error) {
          if (target.view.parent) {
            const recovery = await this.inspectInterruptedArchival(taskId, workspace).catch(() => "inconsistent" as const);
            if (recovery === "removed") return { removed: true };
            return { removed: false, reason: "workspace-nested-cleanup-failed", removedWorktrees,
              ...(recovery === "inconsistent" ? { recoveryPending: true as const } : {}) };
          }
          const registration = await reviewer.paths(workspace.path)
            .then((registered) => registered.some((path) => samePath(path, target.view.path)) ? "present" as const : "absent" as const,
              () => "unknown" as const);
          const files = await lstat(target.view.path).then(() => "present" as const,
            (failure: NodeJS.ErrnoException) => failure.code === "ENOENT" ? "absent" as const : "unknown" as const);
          if (registration === "absent" && files === "absent") removedWorktrees.push(target.view.path);
          return { removed: false, reason: "workspace-nested-cleanup-failed", removedWorktrees,
            cleanupFailure: { path: target.view.path, registration, files } };
        }
        removedWorktrees.push(target.view.path);
      }
      return { removed: true };
    } catch {
      return { removed: false, reason: "workspace-nested-cleanup-failed", removedWorktrees };
    }
  }

  async inspectInterruptedArchival(
    taskId: string,
    workspace: TaskWorkspaceView,
  ): Promise<"intact" | "removed" | "inconsistent"> {
    const expectedPath = this.pathFor(taskId);
    if (!samePath(workspace.path, expectedPath) || !samePath(dirname(expectedPath), this.taskWorkspaceRoot)) {
      return "inconsistent";
    }
    const directory = await lstat(workspace.path)
      .catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
    if (directory !== undefined && (!directory.isDirectory() || directory.isSymbolicLink())) return "inconsistent";
    const directoryExists = directory !== undefined;
    const registrations = await readRegisteredWorktrees(this.projectRepositoryPath, this.#runGit);
    const registered = registrations.some((path) => samePath(path, workspace.path));
    if (directoryExists && registered) {
      if (!(await hasWorktreeGitPointer(workspace.path))) return "inconsistent";
      return this.verify(taskId, workspace).then(() => "intact" as const, () => "inconsistent" as const);
    }
    if (registrations.some((path) => isWithin(workspace.path, path))) return "inconsistent";
    if (!directoryExists && !registered) return "removed";
    if (directoryExists && !registered) {
      const gitPointer = await lstat(join(workspace.path, ".git"))
        .catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
      if (gitPointer !== undefined) return "inconsistent";
      try {
        const recoveryRoot = join(dirname(resolve(this.taskWorkspaceRoot)), "archival-remainders");
        await mkdir(recoveryRoot, { recursive: true });
        const recoveryDirectory = await lstat(recoveryRoot);
        if (!recoveryDirectory.isDirectory() || recoveryDirectory.isSymbolicLink()) return "inconsistent";
        const retainedPath = join(recoveryRoot, `${taskId}-${randomUUID()}`);
        await writeFile(`${retainedPath}.json`, `${JSON.stringify({
          taskId,
          originalPath: workspace.path,
          retainedPath,
          occurredAt: new Date().toISOString(),
        }, null, 2)}\n`, { flag: "wx" });
        await rename(workspace.path, retainedPath);
        return "removed";
      } catch {
        return "inconsistent";
      }
    }
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


async function readRegisteredWorktrees(projectRepositoryPath: string, runGitCommand = runGit): Promise<string[]> {
  const output = await runGitCommand([
    "-C", projectRepositoryPath, "worktree", "list", "--porcelain",
  ]);
  return [...output.matchAll(/^worktree (.+)$/gm)].map((match) => resolve(match[1] ?? ""));
}

async function hasWorktreeGitPointer(path: string): Promise<boolean> {
  const pointer = await lstat(join(path, ".git"))
    .catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" || error.code === "ENOTDIR" ? undefined : Promise.reject(error));
  return pointer !== undefined && pointer.isFile() && !pointer.isSymbolicLink();
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
