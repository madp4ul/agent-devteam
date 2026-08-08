import { resolve } from "node:path";

export function normalizedPath(path: string): string {
  const value = resolve(path);
  return process.platform === "win32" ? value.toLowerCase() : value;
}

export function samePath(left: string, right: string): boolean {
  return normalizedPath(left) === normalizedPath(right);
}
