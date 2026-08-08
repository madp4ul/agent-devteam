import { execFile } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import type {
  ProcessDiagnostic,
  RuntimeStartupBoundary,
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

export class GitTaskWorkspaceManager {
  readonly projectRepositoryPath: string;
  readonly taskWorkspaceRoot: string;

  constructor(
    projectRepositoryPath: string,
    taskWorkspaceRoot: string,
  ) {
    this.projectRepositoryPath = projectRepositoryPath;
    this.taskWorkspaceRoot = taskWorkspaceRoot;
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
      runGit(["-C", this.projectRepositoryPath, "rev-parse", "--git-dir"]),
    );
    const commit = (
      await atBoundary(
        "starting-ref-resolution",
        `Could not resolve task workspace starting ref ${startingRef}`,
        runGit([
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
      runGit([
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
      if (!samePath(workspace.path, expectedPath)) throw new Error("unexpected path");
      const registration = await runGit([
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
      const isWorktree = (
        await runGit(["-C", workspace.path, "rev-parse", "--is-inside-work-tree"])
      ).trim();
      if (entry === undefined || isWorktree !== "true") throw new Error("unexpected registration");
    } catch (error) {
      throw new GitTaskWorkspaceError(
        "worktree-registration",
        `Task ${taskId} workspace is not the registered task worktree expected by the project`,
        error,
      );
    }
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

function runGit(arguments_: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", arguments_, { encoding: "utf8" }, (error, stdout) => {
      if (error !== null) reject(error);
      else resolve(stdout);
    });
  });
}
