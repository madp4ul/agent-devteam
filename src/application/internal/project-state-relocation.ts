import { randomUUID } from "node:crypto";
import { access, cp, lstat, readFile, readdir, realpath, rename, rm, statfs, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { validateTaskWorkspaceConsistency } from "./git-task-workspace.ts";
import { samePath } from "./path-identity.ts";
import { resolveProjectGitCommonDirectory, runProjectGit } from "./project-git.ts";
import { acquireProjectStateOperationGuard } from "./project-state-operation-guard.ts";
import { resolveProjectState } from "./project-state.ts";

export interface ProjectStateRelocationResult {
  source: string;
  destination: string;
  sourceRemoved: boolean;
}

interface RelocationJournal {
  formatVersion: 1;
  source: string;
  destination: string;
  stagingRoot: string;
  phase: "copying" | "destination-ready" | "git-repaired" | "binding-switched";
  authoritativeRoot: string;
}

class RelocationPhaseFailure extends Error {
  readonly phase: RelocationJournal["phase"];
  readonly authoritativeRoot: string;
  readonly recoveryDestination: string;

  constructor(
    message: string,
    phase: RelocationJournal["phase"],
    authoritativeRoot: string,
    recoveryDestination: string,
    cause: unknown,
  ) {
    super(message, { cause });
    this.name = "RelocationPhaseFailure";
    this.phase = phase;
    this.authoritativeRoot = authoritativeRoot;
    this.recoveryDestination = recoveryDestination;
  }
}

export async function relocateProjectState(
  projectRepositoryPath: string,
  requestedDestination: string,
): Promise<ProjectStateRelocationResult> {
  const repositoryPath = resolve(projectRepositoryPath);
  let guard: Awaited<ReturnType<typeof acquireProjectStateOperationGuard>> | undefined;
  try {
    guard = await acquireProjectStateOperationGuard(repositoryPath, "state relocation");
    return await relocateWithExclusiveAccess(repositoryPath, requestedDestination);
  } catch (error) {
    throw await describeRelocationFailure(repositoryPath, requestedDestination, error);
  } finally {
    await guard?.release();
  }
}

async function relocateWithExclusiveAccess(
  repositoryPath: string,
  requestedDestination: string,
): Promise<ProjectStateRelocationResult> {
  const boundRoot = resolve(await readBinding(repositoryPath));
  const destination = resolve(requestedDestination);
  const journalPath = await relocationJournalPath(repositoryPath);
  let journal = await readJournal(journalPath);
  const source = journal?.source ?? boundRoot;
  const canonicalRepository = await canonicalProspectivePath(repositoryPath);
  const canonicalSource = await canonicalProspectivePath(source);
  const canonicalDestination = await canonicalProspectivePath(destination);
  if (samePath(canonicalSource, canonicalRepository) || isWithin(canonicalSource, canonicalRepository)) {
    throw new Error(
      `Bound project state root ${source} must not equal or contain the project repository ${repositoryPath}`,
    );
  }
  if (journal === undefined && samePath(boundRoot, destination)) {
    throw new Error(`Destination ${destination} is already the bound project state root`);
  }
  if (isWithin(canonicalRepository, canonicalDestination)) {
    throw new Error(`Destination ${destination} must not be inside the project repository ${repositoryPath}`);
  }
  if (isWithin(canonicalSource, canonicalDestination)) {
    throw new Error(`Destination ${destination} must not be inside the bound project state root ${source}`);
  }
  const sourceWorkspaceRoot = join(source, "task-worktrees");
  const destinationWorkspaceRoot = join(destination, "task-worktrees");
  if (journal !== undefined) {
    if (!samePath(journal.source, boundRoot) && !samePath(journal.destination, boundRoot)) {
      throw new Error(
        `An unfinished relocation from ${journal.source} to ${journal.destination} must be recovered first: ` +
        `coordination relocate-state "${journal.destination}" --project "${repositoryPath}"`,
      );
    }
    if (!samePath(journal.destination, destination)) {
      throw new Error(
        `An unfinished relocation targets ${journal.destination}; rerun coordination relocate-state "${journal.destination}" ` +
        `--project "${repositoryPath}"`,
      );
    }
    if (samePath(boundRoot, destination)) {
      await validateRelocatedState(repositoryPath, destinationWorkspaceRoot, join(destination, "coordination.sqlite3"));
      const sourceRemoved = await removeVerifiedSource(repositoryPath, journal.source);
      await rm(journalPath, { force: true });
      return { source: journal.source, destination, sourceRemoved };
    }
    if (journal.phase === "binding-switched") {
      throw new Error(
        `Relocation journal says ${destination} is authoritative, but the project binding still names ${boundRoot}`,
      );
    }
    if (journal.phase === "copying") {
      const stagingExists = await pathExists(journal.stagingRoot);
      const destinationExists = await pathExists(destination);
      if (destinationExists && !stagingExists) {
        await validateCopiedDestination(repositoryPath, destination);
        journal = { ...journal, phase: "destination-ready" };
        await writeJournal(journalPath, journal);
      } else if (stagingExists && !destinationExists) {
        await rm(journal.stagingRoot, { recursive: true, force: true });
        await rm(journalPath, { force: true });
        journal = undefined;
      } else if (!stagingExists && !destinationExists) {
        await rm(journalPath, { force: true });
        journal = undefined;
      } else {
        throw new Error("Both the staged and final relocation destinations exist; automatic recovery is unsafe");
      }
    }
  }
  if (journal === undefined && await pathExists(destination)) {
    throw new Error(`Destination ${destination} already exists`);
  }
  if (journal === undefined) {
    const current = await resolveProjectState(repositoryPath);
    await validateRelocatedState(repositoryPath, current.taskWorkspaceRoot, current.databasePath);
    await ensureDestinationCapacity(source, destination);
  }
  const stagingRoot = journal?.stagingRoot ?? join(
    dirname(destination),
    `.${basename(destination)}.coordination-relocation-${randomUUID()}`,
  );
  let phase = journal?.phase;
  try {
    if (phase === undefined) {
      await writeJournal(journalPath, {
        formatVersion: 1,
        source,
        destination,
        stagingRoot,
        phase: "copying",
        authoritativeRoot: source,
      });
      phase = "copying";
      await cp(source, stagingRoot, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
      rewriteDatabasePaths(
        join(stagingRoot, "coordination.sqlite3"),
        sourceWorkspaceRoot,
        destinationWorkspaceRoot,
      );
      await rename(stagingRoot, destination);
      phase = "destination-ready";
      await writeJournal(journalPath, {
        formatVersion: 1, source, destination, stagingRoot, phase, authoritativeRoot: source,
      });
    }
    const workspacePaths = readWorkspacePaths(join(destination, "coordination.sqlite3"));
    if (phase === "destination-ready") {
      if (workspacePaths.length > 0) {
        await runProjectGit(repositoryPath, ["worktree", "repair", ...workspacePaths]);
      }
      phase = "git-repaired";
      await writeJournal(journalPath, {
        formatVersion: 1, source, destination, stagingRoot, phase, authoritativeRoot: source,
      });
    }
    await validateRelocatedState(repositoryPath, destinationWorkspaceRoot, join(destination, "coordination.sqlite3"));
    await runProjectGit(repositoryPath, ["config", "--local", "coordination.projectStateRoot", destination]);
    phase = "binding-switched";
    await writeJournal(journalPath, {
      formatVersion: 1, source, destination, stagingRoot, phase, authoritativeRoot: destination,
    });
    await validateRelocatedState(repositoryPath, destinationWorkspaceRoot, join(destination, "coordination.sqlite3"));
  } catch (error) {
    if (phase !== "binding-switched") {
      try {
        await restoreSource(
          repositoryPath,
          source,
          destination,
          stagingRoot,
          phase === "destination-ready" || phase === "git-repaired",
        );
        await rm(journalPath, { force: true });
      } catch (rollbackError) {
        throw new RelocationPhaseFailure(
          `${errorMessage(error)} Automatic rollback failed; preserve both roots and rerun the relocation command.`,
          phase ?? "copying",
          source,
          destination,
          rollbackError,
        );
      }
    }
    throw new RelocationPhaseFailure(
      errorMessage(error),
      phase ?? "copying",
      phase === "binding-switched" ? destination : source,
      destination,
      error,
    );
  }
  const sourceRemoved = await removeVerifiedSource(repositoryPath, source);
  await rm(journalPath, { force: true });
  return { source, destination, sourceRemoved };
}

export async function assertNoProjectStateRelocation(projectRepositoryPath: string): Promise<void> {
  const journal = await readJournal(await relocationJournalPath(resolve(projectRepositoryPath)));
  if (journal === undefined) return;
  throw new Error(
    `Project state relocation from ${journal.source} to ${journal.destination} is unfinished; recover it with ` +
    `coordination relocate-state "${journal.destination}" --project "${resolve(projectRepositoryPath)}"`,
  );
}

async function relocationJournalPath(repositoryPath: string): Promise<string> {
  const commonDirectory = await resolveProjectGitCommonDirectory(repositoryPath);
  return join(commonDirectory, "coordination-project-state-relocation.json");
}

async function readJournal(path: string): Promise<RelocationJournal | undefined> {
  const text = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (text === undefined) return undefined;
  const parsed = JSON.parse(text) as Partial<RelocationJournal>;
  if (
    parsed.formatVersion !== 1 ||
    typeof parsed.source !== "string" ||
    typeof parsed.destination !== "string" ||
    typeof parsed.stagingRoot !== "string" ||
    !["copying", "destination-ready", "git-repaired", "binding-switched"].includes(parsed.phase ?? "") ||
    typeof parsed.authoritativeRoot !== "string"
  ) throw new Error(`Invalid project-state relocation journal at ${path}`);
  const journal = parsed as RelocationJournal;
  const expectedStagingPrefix = `.${basename(journal.destination)}.coordination-relocation-`;
  if (
    !isAbsolute(journal.source) ||
    !isAbsolute(journal.destination) ||
    !isAbsolute(journal.stagingRoot) ||
    samePath(journal.source, journal.destination) ||
    !samePath(dirname(journal.stagingRoot), dirname(journal.destination)) ||
    !basename(journal.stagingRoot).startsWith(expectedStagingPrefix) ||
    !samePath(
      journal.authoritativeRoot,
      journal.phase === "binding-switched" ? journal.destination : journal.source,
    )
  ) throw new Error(`Unsafe project-state relocation journal at ${path}`);
  return journal;
}

async function writeJournal(path: string, journal: RelocationJournal): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, { flag: "wx" });
  await rename(temporaryPath, path);
}

function rewriteDatabasePaths(databasePath: string, fromRoot: string, toRoot: string): string[] {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE");
    try {
      const workspaces = database.prepare("SELECT task_id, path FROM task_workspaces ORDER BY task_id").all() as Array<{
        task_id: string;
        path: string;
      }>;
      const updateWorkspace = database.prepare("UPDATE task_workspaces SET path = ? WHERE task_id = ?");
      const attempts = database.prepare("SELECT id, workspace_path FROM attempts ORDER BY started_at, id").all() as Array<{
        id: string;
        workspace_path: string;
      }>;
      const updateAttempt = database.prepare("UPDATE attempts SET workspace_path = ? WHERE id = ?");
      const paths: string[] = [];
      for (const workspace of workspaces) {
        const suffix = relative(fromRoot, resolve(workspace.path));
        if (suffix === "" || suffix.startsWith("..") || isAbsolute(suffix)) {
          throw new Error(`Workspace path ${workspace.path} is outside the bound task-worktree root ${fromRoot}`);
        }
        const relocatedPath = join(toRoot, suffix);
        updateWorkspace.run(relocatedPath, workspace.task_id);
        paths.push(relocatedPath);
      }
      for (const attempt of attempts) {
        updateAttempt.run(relocateWorkspacePath(attempt.workspace_path, fromRoot, toRoot), attempt.id);
      }
      database.exec("COMMIT");
      return paths;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

function relocateWorkspacePath(path: string, fromRoot: string, toRoot: string): string {
  const suffix = relative(fromRoot, resolve(path));
  if (suffix === "" || suffix.startsWith("..") || isAbsolute(suffix)) {
    throw new Error(`Workspace path ${path} is outside the bound task-worktree root ${fromRoot}`);
  }
  return join(toRoot, suffix);
}

async function validateRelocatedState(
  repositoryPath: string,
  taskWorkspaceRoot: string,
  databasePath: string,
): Promise<void> {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  let records: Array<{ taskId: string; workspace: { path: string; startingRef: string; commit: string } }>;
  try {
    const integrity = database.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    if (integrity.integrity_check !== "ok") throw new Error(`Relocated database integrity check failed: ${integrity.integrity_check}`);
    records = (database.prepare(
      "SELECT task_id, path, starting_ref, commit_id FROM task_workspaces ORDER BY task_id",
    ).all() as Array<{ task_id: string; path: string; starting_ref: string; commit_id: string }>).map((row) => ({
      taskId: row.task_id,
      workspace: { path: row.path, startingRef: row.starting_ref, commit: row.commit_id },
    }));
    const attempts = database.prepare("SELECT id, workspace_path FROM attempts ORDER BY id").all() as Array<{
      id: string;
      workspace_path: string;
    }>;
    for (const attempt of attempts) {
      assertWorkspacePathWithin(attempt.workspace_path, taskWorkspaceRoot, `Attempt ${attempt.id}`);
    }
  } finally {
    database.close();
  }
  const diagnostics = await validateTaskWorkspaceConsistency(repositoryPath, taskWorkspaceRoot, records);
  if (diagnostics.length > 0) {
    throw new Error(`Relocated project state is inconsistent: ${diagnostics.map((item) => item.rule).join("; ")}`);
  }
}

function assertWorkspacePathWithin(path: string, root: string, owner: string): void {
  const suffix = relative(root, resolve(path));
  if (suffix === "" || suffix.startsWith("..") || isAbsolute(suffix)) {
    throw new Error(`${owner} workspace path ${path} is outside ${root}`);
  }
}

async function restoreSource(
  repositoryPath: string,
  source: string,
  destination: string,
  stagingRoot: string,
  destinationReady: boolean,
): Promise<void> {
  const sourceWorkspaceRoot = join(source, "task-worktrees");
  const sourcePaths = readWorkspacePaths(join(source, "coordination.sqlite3"));
  if (sourcePaths.length > 0) {
    await runProjectGit(repositoryPath, ["worktree", "repair", ...sourcePaths]);
  }
  await runProjectGit(repositoryPath, ["config", "--local", "coordination.projectStateRoot", source]);
  await validateRelocatedState(repositoryPath, sourceWorkspaceRoot, join(source, "coordination.sqlite3"));
  await rm(destinationReady ? destination : stagingRoot, { recursive: true, force: true });
}

function readWorkspacePaths(databasePath: string): string[] {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return (database.prepare("SELECT path FROM task_workspaces ORDER BY task_id").all() as Array<{ path: string }>)
      .map(({ path }) => path);
  } finally {
    database.close();
  }
}

async function readBinding(repositoryPath: string): Promise<string> {
  const value = (await runProjectGit(repositoryPath, [
    "config", "--local", "--get", "coordination.projectStateRoot",
  ])).trim();
  if (value.length === 0) throw new Error(`Project ${repositoryPath} has no project state binding`);
  return value;
}

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

async function canonicalProspectivePath(path: string): Promise<string> {
  const suffix: string[] = [];
  let existing = resolve(path);
  while (true) {
    try {
      return resolve(await realpath(existing), ...suffix.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(existing);
      if (parent === existing) throw error;
      suffix.push(basename(existing));
      existing = parent;
    }
  }
}

async function ensureDestinationCapacity(source: string, destination: string): Promise<void> {
  const requiredBytes = await occupiedBytes(source);
  let capacity: Awaited<ReturnType<typeof statfs>>;
  try {
    capacity = await statfs(dirname(destination), { bigint: true });
  } catch (error) {
    throw new Error(`Destination parent ${dirname(destination)} is not available`, { cause: error });
  }
  const availableBytes = capacity.bavail * capacity.bsize;
  if (availableBytes < requiredBytes) {
    throw new Error(
      `Destination ${destination} has insufficient space: ${requiredBytes} bytes required, ${availableBytes} available`,
    );
  }
}

async function occupiedBytes(path: string): Promise<bigint> {
  const entry = await lstat(path, { bigint: true });
  if (!entry.isDirectory()) return entry.size;
  let total = 0n;
  for (const child of await readdir(path)) total += await occupiedBytes(join(path, child));
  return total;
}

async function removeVerifiedSource(repositoryPath: string, source: string): Promise<boolean> {
  if (!await pathExists(source)) return true;
  if (samePath(source, repositoryPath) || isWithin(source, repositoryPath)) return false;
  const identity = await readFile(join(source, "project-state.json"), "utf8")
    .then((text) => JSON.parse(text) as { repositoryPath?: unknown; gitCommonDirectory?: unknown })
    .catch(() => undefined);
  if (
    identity === undefined ||
    typeof identity.repositoryPath !== "string" ||
    typeof identity.gitCommonDirectory !== "string" ||
    !samePath(identity.repositoryPath, repositoryPath)
  ) return false;
  const commonDirectory = await resolveProjectGitCommonDirectory(repositoryPath);
  if (!samePath(identity.gitCommonDirectory, commonDirectory)) return false;
  return rm(source, { recursive: true, force: true }).then(() => true, () => false);
}

function isWithin(root: string, candidate: string): boolean {
  const suffix = relative(root, candidate);
  return suffix !== "" && !suffix.startsWith("..") && !isAbsolute(suffix);
}

async function validateCopiedDestination(repositoryPath: string, destination: string): Promise<void> {
  const identity = JSON.parse(await readFile(join(destination, "project-state.json"), "utf8")) as {
    repositoryPath?: unknown;
    gitCommonDirectory?: unknown;
  };
  const commonDirectory = await resolveProjectGitCommonDirectory(repositoryPath);
  if (
    typeof identity.repositoryPath !== "string" ||
    typeof identity.gitCommonDirectory !== "string" ||
    !samePath(identity.repositoryPath, repositoryPath) ||
    !samePath(identity.gitCommonDirectory, commonDirectory)
  ) throw new Error(`Copied destination ${destination} does not belong to project ${repositoryPath}`);

  const taskWorkspaceRoot = join(destination, "task-worktrees");
  const database = new DatabaseSync(join(destination, "coordination.sqlite3"), { readOnly: true });
  try {
    const integrity = database.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    if (integrity.integrity_check !== "ok") throw new Error(`Copied database integrity check failed: ${integrity.integrity_check}`);
    const rows = database.prepare("SELECT task_id, path FROM task_workspaces ORDER BY task_id").all() as Array<{
      task_id: string;
      path: string;
    }>;
    for (const row of rows) {
      const expectedPath = join(taskWorkspaceRoot, row.task_id);
      if (!samePath(row.path, expectedPath) || !await pathExists(expectedPath)) {
        throw new Error(`Copied task workspace ${row.task_id} is not complete at ${expectedPath}`);
      }
    }
    const attempts = database.prepare("SELECT id, workspace_path FROM attempts ORDER BY id").all() as Array<{
      id: string;
      workspace_path: string;
    }>;
    for (const attempt of attempts) {
      assertWorkspacePathWithin(attempt.workspace_path, taskWorkspaceRoot, `Copied attempt ${attempt.id}`);
    }
  } finally {
    database.close();
  }
}

async function describeRelocationFailure(
  repositoryPath: string,
  requestedDestination: string,
  cause: unknown,
): Promise<Error> {
  const destination = resolve(requestedDestination);
  const journal = await readJournal(await relocationJournalPath(repositoryPath)).catch(() => undefined);
  const phase = cause instanceof RelocationPhaseFailure ? cause.phase : journal?.phase ?? "preflight";
  const authoritativeRoot = cause instanceof RelocationPhaseFailure
    ? cause.authoritativeRoot
    : journal?.authoritativeRoot ?? await readBinding(repositoryPath).catch(() => "unknown");
  const recoveryDestination = cause instanceof RelocationPhaseFailure
    ? cause.recoveryDestination
    : journal?.destination ?? destination;
  return new Error(
    `Project state relocation failed during ${phase}. Authoritative root: ${authoritativeRoot}. ` +
    `Recovery: coordination relocate-state "${recoveryDestination}" --project "${repositoryPath}". ` +
    `Diagnostic: ${errorMessage(cause)}`,
    { cause },
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
