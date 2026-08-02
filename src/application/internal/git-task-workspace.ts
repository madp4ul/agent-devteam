import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { TaskWorkspaceView } from "../coordination-application.ts";

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

  async provision(
    taskId: string,
    startingRef: string,
    existing: TaskWorkspaceView | undefined,
  ): Promise<TaskWorkspaceView> {
    if (existing !== undefined) {
      await this.verifyRegisteredWorkspace(taskId, existing);
      return existing;
    }

    const commit = (
      await runGit([
        "-C",
        this.projectRepositoryPath,
        "rev-parse",
        "--verify",
        `${startingRef}^{commit}`,
      ])
    ).trim();
    await mkdir(this.taskWorkspaceRoot, { recursive: true });
    const path = join(this.taskWorkspaceRoot, taskId);
    await runGit([
      "-C",
      this.projectRepositoryPath,
      "worktree",
      "add",
      "--detach",
      path,
      commit,
    ]);
    return { path, startingRef, commit };
  }

  private async verifyRegisteredWorkspace(
    taskId: string,
    workspace: TaskWorkspaceView,
  ): Promise<void> {
    const expectedPath = join(this.taskWorkspaceRoot, taskId);
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
      throw new Error(
        `Task ${taskId} workspace is not the registered task worktree expected by the project`,
        { cause: error },
      );
    }
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
