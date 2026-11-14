import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";

export async function readGitRecords(
  arguments_: string[], environment: NodeJS.ProcessEnv, separator: "line" | "nul", consume: (record: string) => void,
): Promise<void> {
  const child = spawn("git", arguments_, { env: environment, windowsHide: true });
  let diagnostic = "";
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { diagnostic = (diagnostic + chunk).slice(-16384); });
  const completion = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => code === 0 ? resolve() : reject(new Error(
      `Git ${arguments_[2]} failed (${code ?? signal}): ${diagnostic.trim()}`,
    )));
  });
  const read = async (): Promise<void> => {
    if (separator === "line") {
      for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) consume(line);
      return;
    }
    let remainder = "";
    for await (const chunk of child.stdout.setEncoding("utf8")) {
      const records = (remainder + chunk).split("\0");
      remainder = records.pop()!;
      for (const record of records) consume(record);
    }
    if (remainder !== "") throw new Error(`Git ${arguments_[2]} produced an incomplete record.`);
  };
  try {
    await Promise.all([completion, read()]);
  } catch (error) {
    child.kill();
    throw error;
  }
}

export function runGit(arguments_: string[], environment?: NodeJS.ProcessEnv, onStderr?: (chunk: string) => void): Promise<string> {
  if (onStderr !== undefined) return new Promise((resolve, reject) => {
    const child = spawn("git", arguments_, { env: { ...process.env, ...environment, LC_ALL: "C", GIT_PROGRESS_DELAY: "0" }, windowsHide: true });
    let stdout = "";
    let diagnostic = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout = (stdout + chunk).slice(-65536); });
    child.stderr.on("data", (chunk: string) => {
      diagnostic = (diagnostic + chunk).slice(-16384);
      onStderr(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`Git exited ${code}: ${diagnostic}`)));
  });
  return new Promise((resolve, reject) => {
    execFile("git", arguments_, { encoding: "utf8", env: environment }, (error, stdout) => {
      if (error !== null) reject(error);
      else resolve(stdout);
    });
  });
}

export function gitSafeDirectoryEnvironment(path: string): NodeJS.ProcessEnv {
  const configuration: Array<[string, string]> = [];
  const inheritedCount = Number.parseInt(process.env.GIT_CONFIG_COUNT ?? "0", 10);
  for (let index = 0; index < inheritedCount; index += 1) {
    const key = process.env[`GIT_CONFIG_KEY_${index}`];
    const value = process.env[`GIT_CONFIG_VALUE_${index}`];
    if (key !== undefined && value !== undefined && key.toLocaleLowerCase() !== "safe.directory") {
      configuration.push([key, value]);
    }
  }
  configuration.push([
    "safe.directory",
    /^(?:[A-Za-z]:\\|\\\\)/u.test(path) ? path.replaceAll("\\", "/") : path,
  ]);
  const environment: NodeJS.ProcessEnv = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/iu.test(key),
      ),
    ),
    GIT_CONFIG_COUNT: configuration.length.toString(),
  };
  for (const [index, [key, value]] of configuration.entries()) {
    environment[`GIT_CONFIG_KEY_${index}`] = key;
    environment[`GIT_CONFIG_VALUE_${index}`] = value;
  }
  return environment;
}

export function runGitForExitCode(arguments_: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile("git", arguments_, { encoding: "utf8" }, (error) => {
      if (error === null) resolve(0);
      else if (typeof error.code === "number") resolve(error.code);
      else reject(error);
    });
  });
}
