import type { TaskWorkspaceGitStateView } from "../task-contract.ts";

export function workspaceGitSummary(statusOutput: string, numstatOutput: string): Omit<TaskWorkspaceGitStateView, "history"> {
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

    return { head: branch === "(detached)" ? { kind: "detached", shortHash: oid.slice(0, 7) } : { kind: "branch", name: branch, shortHash: oid.slice(0, 7) }, changes: { additions, deletions, stagedFiles, unstagedFiles, untrackedFiles } };
}
