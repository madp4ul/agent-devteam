import { spawn } from "node:child_process";

export type HostWorkspaceLaunchConfirmation = "spawn" | "exit";
export type HostWorkspaceLauncher = (
  command: string,
  arguments_: string[],
  confirmation: HostWorkspaceLaunchConfirmation,
) => Promise<void>;

export function createHostWorkspaceOpener(
  platform: NodeJS.Platform = process.platform,
  launch: HostWorkspaceLauncher = launchHostCommand,
): ((path: string) => Promise<void>) | undefined {
  const command = hostOpenCommand(platform);
  if (command === undefined) return undefined;
  return (path) => launch(command, [path], platform === "win32" ? "spawn" : "exit");
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
