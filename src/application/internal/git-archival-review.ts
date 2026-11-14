import { WorkspaceGitSummaryReader } from "./workspace-git-summary.ts";
import { createHash } from "node:crypto";
import { lstat, open, readdir, readlink, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { ArchivalWorktreeView, TaskArchivalPreview } from "../task-contract.ts";
import { normalizedPath, samePath } from "./path-identity.ts";
import { gitSafeDirectoryEnvironment, readGitRecords, runGit } from "./git-command.ts";

interface ReviewedWorktree { view: ArchivalWorktreeView; fingerprint: string }
export interface ArchivalReview {
  preview: TaskArchivalPreview;
  entries: ReviewedWorktree[];
}

/** Filesystem/Git evidence for one explicit destructive review, never a cached status. */
export class GitArchivalReview {
  readonly repository: string;
  readonly git: typeof runGit;
  constructor(repository: string, git: typeof runGit = runGit) { this.repository = repository; this.git = git; }

  async paths(root: string): Promise<string[]> {
    const output = await this.git(["-C", this.repository, "worktree", "list", "--porcelain", "-z"]);
    return output.split("\0").filter((part) => part.startsWith("worktree "))
      .map((part) => resolve(part.slice(9))).filter((path) => samePath(root, path) || within(root, path))
      .sort((a, b) => a.length - b.length || a.localeCompare(b));
  }

  async resolvePath(root: string, path: string): Promise<string> {
    await validatePath(root, path);
    if (!(await this.paths(root)).some((registered) => samePath(registered, path))) throw new Error("The reviewed worktree is no longer registered.");
    return path;
  }

  async inspect(root: string): Promise<ArchivalReview> {
    const paths = await this.paths(root);
    if (!paths.some((path) => samePath(path, root))) throw new Error("The parent registration is missing.");
    const entries: ReviewedWorktree[] = [];
    const repositoryCommon = (await this.git(["-C", this.repository, "rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
    for (const path of paths) {
      try { entries.push(await this.inspectOne(root, path, paths, repositoryCommon)); }
      catch (error) {
        const canOpen = await this.resolvePath(root, path).then(() => true, () => false);
        entries.push({ fingerprint: "", view: { path, parent: samePath(root, path), ignoredFiles: 0,
          canOpen, durableHead: false, upstream: { kind: "unknown" },
          diagnostic: error instanceof Error ? error.message : "Git inspection unavailable" } });
      }
    }
    const canProceed = entries.every((entry) => entry.fingerprint !== "");
    return { entries, preview: {
      token: canProceed ? digest(entries.map((entry) => [normalizedPath(entry.view.path), entry.fingerprint])) : null,
      worktrees: entries.map((entry) => entry.view),
    } };
  }

  async inspectOne(root: string, path: string, paths: string[], repositoryCommon?: string): Promise<ReviewedWorktree> {
    await validatePath(root, path);
    const environment = { ...gitSafeDirectoryEnvironment(path), GIT_OPTIONAL_LOCKS: "0" };
    const git = (...args: string[]) => this.git(["-C", path, ...args], environment);
    const common = await git("rev-parse", "--path-format=absolute", "--git-common-dir");
    repositoryCommon ??= (await this.git(["-C", this.repository, "rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
    const top = await git("rev-parse", "--show-toplevel");
    if (!samePath(common.trim(), repositoryCommon) || !samePath(top.trim(), path)) {
      throw new Error("Worktree Git identity does not match its registration.");
    }
    const summary = new WorkspaceGitSummaryReader();
    const refs = createHash("sha256");
    const index = createHash("sha256");
    let durableHead = false;
    let ignoredFiles = 0;
    const records = (args: string[], separator: "line" | "nul", consume: (record: string) => void) =>
      readGitRecords(["-C", path, ...args], environment, separator, consume);
    await Promise.all([
      records(["status", "--porcelain=v2", "--branch", "--untracked-files=all"], "line", (line) => summary.status(line)),
      records(["diff", "--numstat", "HEAD", "--"], "line", (line) => summary.numstat(line)),
      records(["for-each-ref", "--format=%(refname):%(objectname)", "--contains", "HEAD"], "line", (line) => {
        durableHead = true;
        refs.update(line).update("\n");
      }),
      records(["ls-files", "--stage", "-z"], "nul", (record) => { index.update(record).update("\0"); }),
      records(["ls-files", "--others", "--ignored", "--exclude-standard", "-z"], "nul", () => { ignoredFiles += 1; }),
    ]);
    const state = summary.result();
    const head = summary.header("oid");
    const branch = summary.header("head");
    const upstreamName = summary.header("upstream");
    const aheadBehind = /^\+(\d+) -(\d+)$/u.exec(summary.header("ab") ?? "");
    const upstream: ArchivalWorktreeView["upstream"] = upstreamName === undefined ? { kind: "none" }
      : aheadBehind === null ? { kind: "unknown" }
      : { kind: "known", name: upstreamName, ahead: Number(aheadBehind[1]), behind: Number(aheadBehind[2]) };
    const upstreamCommit = upstream.kind === "known" ? (await git("rev-parse", "--verify", "@{upstream}")).trim() : null;
    const content = await contentFingerprint(path, paths.filter((other) => within(path, other)));
    return { fingerprint: digest({ head, branch, refs: refs.digest("hex"), index: index.digest("hex"), upstream, upstreamCommit, content }), view: {
      path, parent: samePath(root, path), canOpen: true, ignoredFiles, durableHead, upstream,
      state: { ...state, history: { kind: "no-task-baseline" } },
    } };
  }
}

async function validatePath(root: string, path: string): Promise<void> {
  if (!samePath(root, path) && !within(root, path)) throw new Error("Worktree is outside the task workspace.");
  const rootReal = await realpath(root);
  const resolved = await realpath(path);
  if (!samePath(resolve(rootReal, relative(root, path)), resolved)) throw new Error("Worktree path traverses a symbolic link.");
  if ((await lstat(root)).isSymbolicLink() || (await lstat(path)).isSymbolicLink()) throw new Error("Symbolic worktree paths cannot be removed.");
}

// Stream file contents, including ignored/untracked evidence; never follow links.
// Nested registered checkouts have their own independently revalidated fingerprint.
async function contentFingerprint(root: string, nested: string[]): Promise<string> {
  const hash = createHash("sha256");
  async function visit(path: string): Promise<void> {
    await validatePath(root, path);
    const entries = (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.name.toLowerCase() === ".git") {
        if (samePath(path, root)) continue;
        throw new Error(`Unregistered nested Git metadata at ${child}; inspect and relocate it before deletion.`);
      }
      if (nested.some((candidate) => samePath(candidate, child))) continue;
      if (entry.isDirectory()) { await visit(child); continue; }
      hash.update(JSON.stringify(relative(root, child)));
      if (entry.isSymbolicLink()) hash.update(`link:${await readlink(child)}`);
      else if (entry.isFile()) {
        const before = await lstat(child);
        if (!before.isFile() || !samePath(await realpath(child), child)) throw new Error("File identity changed during inspection.");
        const file = await open(child, "r");
        try {
          const opened = await file.stat();
          if (opened.ino !== before.ino || opened.dev !== before.dev) throw new Error("File identity changed during inspection.");
          hash.update(`mode:${opened.mode}`);
          if (opened.size > 0) {
            for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk);
          }
          const after = await file.stat();
          const retained = await lstat(child);
          if (after.mtimeMs !== opened.mtimeMs || after.size !== opened.size || retained.ino !== opened.ino || retained.isSymbolicLink()) {
            throw new Error("File content changed during inspection.");
          }
        } finally { await file.close(); }
      } else throw new Error(`Cannot inspect special file ${child}`);
      hash.update("\0");
    }
  }
  await visit(root);
  return hash.digest("hex");
}

export function within(root: string, path: string): boolean {
  const child = relative(root, path);
  return child !== "" && child !== ".." && !child.startsWith(`..\\`) && !child.startsWith("../") && !isAbsolute(child);
}
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
