import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  CoordinationApplication,
  type ProcessDiagnostic,
} from "./application/coordination-application.ts";
import { startWebServer } from "./web/web-server.ts";

await run(process.argv.slice(2));

async function run(arguments_: string[]): Promise<void> {
  const command = arguments_[0];
  if (command === "validate") {
    const definitionPath = arguments_[1];
    if (definitionPath === undefined) {
      console.error("Usage: coordination validate <process-definition.yaml>");
      process.exitCode = 2;
      return;
    }
    const resolvedPath = resolve(definitionPath);
    const validation =
      await CoordinationApplication.validateProcessDefinition(resolvedPath);
    if (validation.valid) {
      console.log("Valid process definition");
      console.log(`Semantic version: ${validation.processDefinitionVersion}`);
      return;
    }
    for (const diagnostic of validation.diagnostics) {
      console.log(formatDiagnostic(diagnostic));
    }
    process.exitCode = 1;
    return;
  }

  if (command === "start") {
    const definitionPath = resolve(
      readOption(arguments_, "--process") ?? "examples/software-delivery/process.yaml",
    );
    const databasePath = resolve(
      readOption(arguments_, "--database") ?? ".data/coordination.sqlite3",
    );
    const host = readOption(arguments_, "--host") ?? "127.0.0.1";
    const port = Number(readOption(arguments_, "--port") ?? "3000");
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      console.error("--port must be an integer from 0 through 65535");
      process.exitCode = 2;
      return;
    }
    await mkdir(dirname(databasePath), { recursive: true });
    const application = await CoordinationApplication.start({
      processDefinitionPath: definitionPath,
      databasePath,
    });
    const server = await startWebServer(application, { host, port });
    console.log(`Coordination application listening at ${server.baseUrl}`);
    console.log(`Startup mode: ${application.queryStartup().mode}`);

    const close = async (): Promise<void> => {
      await server.close();
      application.close();
    };
    process.once("SIGINT", () => void close());
    process.once("SIGTERM", () => void close());
    return;
  }

  console.error(
    "Usage:\n  coordination validate <process-definition.yaml>\n  coordination start [--process path] [--database path] [--host address] [--port number]",
  );
  process.exitCode = 2;
}

function readOption(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index === -1 ? undefined : arguments_[index + 1];
}

function formatDiagnostic(diagnostic: ProcessDiagnostic): string {
  const correction =
    diagnostic.correction === undefined
      ? ""
      : `\nCorrection: ${diagnostic.correction}`;
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}
Invalid value: ${JSON.stringify(diagnostic.invalidValue)}
Rule: ${diagnostic.rule}
Consequence: ${diagnostic.consequence}${correction}`;
}
