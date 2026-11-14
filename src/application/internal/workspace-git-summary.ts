import type { TaskWorkspaceGitStateView } from "../task-contract.ts";

export class WorkspaceGitSummaryReader {
  readonly #headers = new Map<string, string>();
  readonly #changes = { additions: 0, deletions: 0, stagedFiles: 0, unstagedFiles: 0, untrackedFiles: 0 };

  status(line: string): void {
    if (line.startsWith("# branch.")) {
      const end = line.indexOf(" ", 2);
      if (end !== -1) this.#headers.set(line.slice(2, end), line.slice(end + 1));
    } else if (line.startsWith("? ")) {
      this.#changes.untrackedFiles += 1;
    } else if (/^[12u] /u.test(line)) {
      if (line[2] !== ".") this.#changes.stagedFiles += 1;
      if (line[3] !== ".") this.#changes.unstagedFiles += 1;
    }
  }

  numstat(line: string): void {
    const [added, deleted] = line.split("\t", 3);
    if (added !== undefined && /^\d+$/u.test(added)) this.#changes.additions += Number.parseInt(added, 10);
    if (deleted !== undefined && /^\d+$/u.test(deleted)) this.#changes.deletions += Number.parseInt(deleted, 10);
  }

  header(name: string): string | undefined { return this.#headers.get(`branch.${name}`); }

  result(): Omit<TaskWorkspaceGitStateView, "history"> {
    const branch = this.header("head");
    const oid = this.header("oid");
    if (branch === undefined || oid === undefined || oid === "(initial)") throw new Error("Git status did not report a current HEAD.");
    return {
      head: branch === "(detached)" ? { kind: "detached", shortHash: oid.slice(0, 7) } : { kind: "branch", name: branch, shortHash: oid.slice(0, 7) },
      changes: { ...this.#changes },
    };
  }
}

export function workspaceGitSummary(statusOutput: string, numstatOutput: string): Omit<TaskWorkspaceGitStateView, "history"> {
  const reader = new WorkspaceGitSummaryReader();
  for (const line of statusOutput.split(/\r?\n/u)) reader.status(line);
  for (const line of numstatOutput.split(/\r?\n/u)) reader.numstat(line);
  return reader.result();
}
