import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import type { AgentRunRequest } from "../application/runtime-contract.ts";
import type { NativeReviewerPolicyState } from "./codex-reviewer-allowances.ts";

/** Read-only app-server/config boundary audited against bundled Codex 0.160.0. No model turns. */
export async function inspectNativeReviewerPolicy(
  request: AgentRunRequest, signal?: AbortSignal,
): Promise<NativeReviewerPolicyState> {
  const sdkRequire = createRequire(import.meta.resolve("@openai/codex-sdk"));
  const packagePath = sdkRequire.resolve("@openai/codex/package.json");
  const metadata = JSON.parse(await readFile(packagePath, "utf8")) as { version: string };
  if (metadata.version !== "0.160.0") throw new Error("Unverified native configuration protocol");
  const targets: Record<string, string> = {
    "linux-x64": "x86_64-unknown-linux-musl", "linux-arm64": "aarch64-unknown-linux-musl",
    "darwin-x64": "x86_64-apple-darwin", "darwin-arm64": "aarch64-apple-darwin",
    "win32-x64": "x86_64-pc-windows-msvc", "win32-arm64": "aarch64-pc-windows-msvc",
  };
  const platform = `${process.platform}-${process.arch}`;
  const target = targets[platform];
  if (target === undefined) throw new Error("Unverified native package layout");
  const nativeMetadata = createRequire(packagePath).resolve(`@openai/codex-${platform}/package.json`);
  const executable = join(dirname(nativeMetadata), "vendor", target, "bin", process.platform === "win32" ? "codex.exe" : "codex");
  const effective = await readNativeConfiguration(executable, request.workspace.path, false, signal);
  // A separate strict load checks key acceptance without overwriting inherited guidance.
  await readNativeConfiguration(executable, request.workspace.path, true, signal);
  const codexHome = process.env.CODEX_HOME ?? join(process.env.USERPROFILE ?? homedir(), ".codex");
  const catalog = JSON.parse(await readFile(join(codexHome, "models_cache.json"), "utf8")) as {
    models: Array<{ slug: string; model_messages?: { auto_review?: { policy_template?: string | null } } }>;
  };
  if (!catalog.models.some(({ slug }) => slug === "codex-auto-review")) throw new Error("Reviewer catalog unavailable");
  const templates = catalog.models.flatMap((model) => {
    const template = model.model_messages?.auto_review?.policy_template;
    return typeof template === "string" ? [template] : [];
  });
  return { version: metadata.version, config: effective.config, requirements: effective.requirements, templates };
}

async function readNativeConfiguration(
  executable: string, cwd: string, probe: boolean, signal?: AbortSignal,
): Promise<{ config: Record<string, unknown>; requirements: unknown }> {
  if (signal?.aborted) throw new Error("Inspection interrupted");
  const child = spawn(executable, [...(probe ? ["--strict-config", "-c",
    'auto_review.extra_policy="framework compatibility probe"'] : []), "app-server"], {
    cwd, env: process.env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let unavailable = false;
  const fail = () => {
    unavailable = true;
    for (const waiter of pending.values()) waiter.reject(new Error("Native configuration inspection unavailable"));
    pending.clear();
    child.kill();
  };
  const timer = setTimeout(fail, 5_000);
  const lines = createInterface({ input: child.stdout });
  let sequence = 0;
  child.stderr.resume(); // Do not disclose config/authentication diagnostics or private policy text.
  child.stdin.on("error", fail);
  child.on("error", fail);
  child.on("exit", fail);
  signal?.addEventListener("abort", fail, { once: true });
  const rpc = (method: string, params: unknown): Promise<unknown> => new Promise((resolve, reject) => {
    if (unavailable || signal?.aborted) { reject(new Error("Native inspection interrupted")); return; }
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, params }) + "\n", (error) => { if (error) fail(); });
  });
  lines.on("line", (line) => {
    try {
      const message = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown };
      if (message.id === undefined) return;
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error !== undefined) waiter?.reject(new Error("Native configuration inspection rejected"));
      else waiter?.resolve(message.result);
    } catch { fail(); }
  });
  try {
    await rpc("initialize", { clientInfo: { name: "framework_reviewer_policy", version: "1.0.0" } });
    child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
    const config = await rpc("config/read", { includeLayers: false, cwd }) as { config: Record<string, unknown> };
    const requirements = await rpc("configRequirements/read", {}) as { requirements: unknown };
    if (config.config === undefined || !("requirements" in requirements)) throw new Error("Unverified config response");
    return { config: config.config, requirements: requirements.requirements };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", fail);
    lines.close();
    child.stdin.destroy();
    child.kill();
  }
}
