import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runProjectGit(repositoryPath: string, arguments_: string[]): Promise<string> {
  return (await execFileAsync("git", ["-C", repositoryPath, ...arguments_], { encoding: "utf8" })).stdout;
}

export async function resolveProjectGitCommonDirectory(repositoryPath: string): Promise<string> {
  return resolve(
    repositoryPath,
    (await runProjectGit(repositoryPath, ["rev-parse", "--git-common-dir"])).trim(),
  );
}
