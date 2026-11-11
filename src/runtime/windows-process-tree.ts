import { execFile } from "node:child_process";

interface ProcessIdentity { pid: number; parent: number; created: string }

async function processes(): Promise<ProcessIdentity[]> {
  const script = "@(Get-CimInstance Win32_Process -ErrorAction Stop | ForEach-Object { @{ pid = [int]$_.ProcessId; parent = [int]$_.ParentProcessId; created = $_.CreationDate.ToUniversalTime().ToString('o') } }) | ConvertTo-Json -Compress";
  const output = await new Promise<string>((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 5000, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" },
      (error, stdout) => error ? reject(error) : resolve(stdout));
  });
  const rows: unknown = JSON.parse(output);
  if (!Array.isArray(rows) || rows.some((row) => !row || !Number.isSafeInteger(row.pid)
    || !Number.isSafeInteger(row.parent) || typeof row.created !== "string" || !Number.isFinite(Date.parse(row.created)))) {
    throw new Error("Windows process identity inspection returned incomplete evidence");
  }
  return rows;
}

/** Retain identities before taskkill can remove the tree's parent links. */
export async function captureWindowsProcessTree(pid: number): Promise<ProcessIdentity[]> {
  const rows = await processes();
  const root = rows.find((row) => row.pid === pid);
  if (!root) throw new Error("Codex worker disappeared before process-tree inspection");
  const owned = [root];
  retainDescendants(owned, rows);
  return owned;
}

function retainDescendants(owned: ProcessIdentity[], rows: ProcessIdentity[]): void {
  for (let index = 0; index < owned.length; index++) {
    const parent = owned[index]!;
    // A reused PID must not hide an older surviving child of the original
    // parent, nor make the replacement process's children part of our tree.
    const replacement = rows.find((row) => row.pid === parent.pid && row.created !== parent.created);
    for (const row of rows) {
      if (row.parent === parent.pid && row.created >= parent.created
        && (replacement === undefined || row.created < replacement.created)
        && !owned.some((known) => known.pid === row.pid && known.created === row.created)) owned.push(row);
    }
  }
}

export async function windowsProcessTreeHasExited(owned: ProcessIdentity[]): Promise<boolean> {
  const current = await processes();
  // Keep parent identities after exit so a new child of a departed process is
  // still discoverable. Every later inspection expands this retained lineage.
  retainDescendants(owned, current);
  return owned.every((process) => !current.some((row) => row.pid === process.pid && row.created === process.created));
}
