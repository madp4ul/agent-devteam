import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";

export type HostWorkspaceLaunchConfirmation = "spawn" | "exit";
export type HostWorkspaceLauncher = (
  command: string,
  arguments_: string[],
  confirmation: HostWorkspaceLaunchConfirmation,
) => Promise<void>;
export type VisualStudioCodeExecutableResolver = () => Promise<string | undefined>;

export function createHostWorkspaceOpener(
  platform: NodeJS.Platform = process.platform,
  launch: HostWorkspaceLauncher = launchHostCommand,
): ((path: string) => Promise<void>) | undefined {
  const command = hostOpenCommand(platform);
  if (command === undefined) return undefined;
  return (path) => launch(command, [path], platform === "win32" ? "spawn" : "exit");
}

export function createVisualStudioCodeWorkspaceOpener(
  platform: NodeJS.Platform = process.platform,
  launch: HostWorkspaceLauncher = launchHostCommand,
  resolveWindowsExecutable: VisualStudioCodeExecutableResolver = findWindowsVisualStudioCodeExecutable,
): (path: string) => Promise<void> {
  return async (path) => {
    try {
      if (platform === "win32") {
        const executable = await resolveWindowsExecutable();
        if (executable === undefined) {
          throw new Error("Visual Studio Code could not be found on this host.");
        }
        await launch(executable, [path], "spawn");
        return;
      }
      if (platform === "darwin") {
        await launch("open", ["-a", "Visual Studio Code", path], "exit");
        return;
      }
      if (platform === "linux") {
        await launch("code", [path], "exit");
        return;
      }
      throw new Error("Opening Visual Studio Code is unavailable on this host.");
    } catch (error) {
      if (error instanceof Error && error.message.includes("Visual Studio Code")) throw error;
      const diagnostic = error instanceof Error ? error.message : "Unknown launcher error.";
      throw new Error(`Visual Studio Code could not be opened. ${diagnostic}`, { cause: error });
    }
  };
}

async function findWindowsVisualStudioCodeExecutable(): Promise<string | undefined> {
  const candidates = [
    process.env.LOCALAPPDATA === undefined
      ? undefined
      : join(process.env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "Code.exe"),
    process.env.ProgramFiles === undefined
      ? undefined
      : join(process.env.ProgramFiles, "Microsoft VS Code", "Code.exe"),
    process.env["ProgramFiles(x86)"] === undefined
      ? undefined
      : join(process.env["ProgramFiles(x86)"], "Microsoft VS Code", "Code.exe"),
  ];
  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next standard installation location.
    }
  }
  return undefined;
}

function hostOpenCommand(platform: NodeJS.Platform): string | undefined {
  switch (platform) {
    case "win32":
      return "explorer.exe";
    case "darwin":
      return "open";
    case "linux":
      return "xdg-open";
    default:
      return undefined;
  }
}

export async function launchHostCommand(
  command: string,
  arguments_: string[],
  confirmation: HostWorkspaceLaunchConfirmation,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, arguments_, {
      stdio: "ignore",
    });
    child.once("error", reject);
    if (confirmation === "spawn") {
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    } else {
      child.once("exit", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(
          code === null
            ? `Host workspace launcher ended with signal ${signal ?? "unknown"}.`
            : `Host workspace launcher exited with code ${code}.`,
        ));
      });
    }
  });
}
