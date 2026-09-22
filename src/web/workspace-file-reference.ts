import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface WorkspaceFileTarget {
  filePath: string;
  line?: number;
  column?: number;
}

export type WorkspaceFileResolution =
  | { resolved: true; target: WorkspaceFileTarget }
  | {
      resolved: false;
      reason: "invalid-file-reference" | "workspace-unavailable" | "file-outside-workspace" | "file-not-found" | "not-a-file";
      diagnostic: string;
    };

export async function resolveWorkspaceFileReference(
  workspacePath: string,
  reference: string,
): Promise<WorkspaceFileResolution> {
  const parsed = parseReference(reference);
  if (parsed === undefined) {
    return {
      resolved: false,
      reason: "invalid-file-reference",
      diagnostic: "The local file link is not a supported path.",
    };
  }
  let workspace: string;
  try {
    workspace = await realpath(workspacePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        resolved: false,
        reason: "workspace-unavailable",
        diagnostic: "This task workspace has been removed or is unavailable.",
      };
    }
    throw error;
  }
  const candidate = isAbsolute(parsed.path) ? resolve(parsed.path) : resolve(workspace, parsed.path);
  if (!isWithinOrEqual(workspace, candidate)) {
    return outsideWorkspace();
  }
  let canonical: string;
  try {
    canonical = await realpath(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        resolved: false,
        reason: "file-not-found",
        diagnostic: "The linked file no longer exists in this task workspace.",
      };
    }
    throw error;
  }
  if (!isWithinOrEqual(workspace, canonical)) {
    return outsideWorkspace();
  }
  if (!(await stat(canonical)).isFile()) {
    return {
      resolved: false,
      reason: "not-a-file",
      diagnostic: "The local link points to a directory rather than a file.",
    };
  }
  return {
    resolved: true,
    target: {
      filePath: canonical,
      ...(parsed.line === undefined ? {} : { line: parsed.line }),
      ...(parsed.column === undefined ? {} : { column: parsed.column }),
    },
  };
}

function outsideWorkspace(): WorkspaceFileResolution {
  return {
    resolved: false,
    reason: "file-outside-workspace",
    diagnostic: "Local file links may only open files inside this task workspace.",
  };
}

function parseReference(reference: string): { path: string; line?: number; column?: number } | undefined {
  const trimmed = reference.trim();
  if (trimmed.length === 0) return undefined;
  const fragmentMatch = /#L(\d+)(?:C(\d+))?$/iu.exec(trimmed);
  const suffixMatch = fragmentMatch === null ? /:(\d+)(?::(\d+))?$/u.exec(trimmed) : null;
  const pathReference = trimmed.slice(0, fragmentMatch?.index ?? suffixMatch?.index ?? trimmed.length);
  let decoded: string;
  try {
    decoded = pathReference.toLocaleLowerCase().startsWith("file:")
      ? fileURLToPath(pathReference)
      : decodeURIComponent(pathReference);
  } catch {
    return undefined;
  }
  if (decoded.length === 0 || decoded.includes("\0")) return undefined;
  const lineText = fragmentMatch?.[1] ?? suffixMatch?.[1];
  const columnText = fragmentMatch?.[2] ?? suffixMatch?.[2];
  return {
    path: decoded,
    ...(lineText === undefined ? {} : { line: Number.parseInt(lineText, 10) }),
    ...(columnText === undefined ? {} : { column: Number.parseInt(columnText, 10) }),
  };
}

function isWithinOrEqual(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}
