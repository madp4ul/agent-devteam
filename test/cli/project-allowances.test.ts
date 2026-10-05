import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import test from "node:test";
import { createCommittedTestRepository } from "../support/agent-runtime-fixture.ts";
import { stopHost } from "../support/cli-host-lifecycle.ts";

const execFileAsync = promisify(execFile);
const cliPath = resolve("src/cli.ts");

test("invalid launch allowances fail before project state is accessed", async () => {
  for (const arguments_ of [
    ["--additional-allowances"],
    ["--additional-allowances", "--port", "0"],
    ["--additional-allowances", "First", "--additional-allowances=Second"],
  ]) {
    await assert.rejects(execFileAsync(process.execPath, [
      "--experimental-strip-types", cliPath, "start", "--project", "missing-project", ...arguments_,
    ]), (error: unknown) => {
      const failure = error as { code: number; stderr: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr, /--additional-allowances/);
      assert.match(failure.stderr, /requires a text argument|only be specified once/);
      assert.doesNotMatch(failure.stderr, /Project state|not a git repository/);
      return true;
    });
  }
});

test("the Windows launcher forwards quoted allowance text through cmd and PowerShell", {
  skip: process.platform !== "win32",
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "allowance-launcher-"));
  const capturePath = join(directory, "capture.mjs");
  await writeFile(capturePath, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
  // Capture the public launch argv without building or dispatching a real agent.
  await writeFile(join(directory, "pnpm.cmd"), '@echo off\r\nif "%~1"=="run" exit /b 0\r\n"%ALLOWANCE_TEST_NODE%" "%ALLOWANCE_TEST_CAPTURE%" %*\r\n');
  const launcherPath = resolve("examples/software-delivery/start.cmd");
  const guidance = "Run the project's browser validation.";
  const environment = { ...process.env, PATH: `${directory};${process.env.PATH ?? ""}`,
    ALLOWANCE_TEST_NODE: process.execPath, ALLOWANCE_TEST_CAPTURE: capturePath,
    GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "safe.directory", GIT_CONFIG_VALUE_0: resolve(".").replaceAll("\\", "/") };
  const cmd = await execFileAsync("cmd.exe", ["/d", "/s", "/c",
    `""${launcherPath}" --additional-allowances "${guidance}""`], { env: environment, windowsVerbatimArguments: true });
  const powershell = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `& '${launcherPath.replaceAll("'", "''")}' --additional-allowances '${guidance.replaceAll("'", "''")}'`],
  { env: environment });
  for (const output of [cmd.stdout, powershell.stdout]) {
    const argv = JSON.parse(output.trim()) as string[];
    const optionIndex = argv.indexOf("--additional-allowances");
    assert.ok(optionIndex > 0);
    assert.equal(argv[optionIndex + 1], guidance);
    assert.equal(argv[optionIndex + 2], undefined);
  }
});

test("launch argv accepts quoted multiline text, equals syntax and blanks without printing the guidance", async (t) => {
  const fixture = await createCommittedTestRepository("cli-project-allowances-");
  const definitionPath = join(fixture.directory, "process.yaml");
  await writeFile(definitionPath, `schemaVersion: 1
name: CLI allowances
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Launch paused.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Delivery.
    columns:
      - id: backlog
        name: Backlog
`);
  for (const [arguments_, configured] of [
    [["--additional-allowances", 'Keep "secret" data local.\nRun browser validation.'], true],
    [["--additional-allowances=--private text"], true],
    [["--additional-allowances", " \n\t"], false],
    [[], false],
  ] as const) {
    const child = spawn(process.execPath, ["--experimental-strip-types", cliPath, "start",
      "--project", fixture.repositoryPath, "--process", definitionPath, "--port", "0", ...arguments_],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    t.after(() => stopHost(child));
    const output = await new Promise<string>((resolveOutput, reject) => {
      let output = "";
      const finish = (error?: Error) => {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        child.stderr.off("data", onData);
        child.off("exit", onExit);
        if (error !== undefined) reject(error);
        else resolveOutput(output);
      };
      const onData = (data: Buffer) => {
        output += data.toString();
        if (/Project reviewer allowances:/.test(output)) finish();
      };
      const onExit = () => finish(new Error(`Host exited before startup: ${output}`));
      const timer = setTimeout(() => finish(new Error(`Startup timed out: ${output}`)), 10_000);
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      child.on("exit", onExit);
    });
    assert.match(output, configured ? /Project reviewer allowances: configured for this launch/ : /Project reviewer allowances: none/);
    assert.match(output, /Startup mode: paused/);
    assert.doesNotMatch(output, /secret|private text|Run browser validation/);
    await stopHost(child);
  }
});
