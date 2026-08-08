import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { RuntimeStartupBoundary, TaskWorkspaceView } from "../coordination-contract.ts";

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
      await this.verifyRegisteredWorkspace(taskId, existing);
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

  private async verifyRegisteredWorkspace(
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

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function runGit(arguments_: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", arguments_, { encoding: "utf8" }, (error, stdout) => {
      if (error !== null) reject(error);
      else resolve(stdout);
    });
  });
}
