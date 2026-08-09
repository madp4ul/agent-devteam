import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CoordinationApplication,
  type ProcessDiagnostic,
  type TaskWorkspaceView,
} from "./application/coordination-application.ts";
import { AgentToolScopeRegistry } from "./mcp/agent-tool-scope.ts";
import { CodexAgentRuntime } from "./runtime/codex-agent-runtime.ts";
import { startWebServer } from "./web/web-server.ts";
import {
  createHostWorkspaceOpener,
  createVisualStudioCodeWorkspaceOpener,
} from "./web/host-workspace-opener.ts";
import { GitTaskWorkspaceManager } from "./application/internal/git-task-workspace.ts";
import { resolveProjectState } from "./application/internal/project-state.ts";

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
    const projectRepositoryPath = resolve(readOption(arguments_, "--project") ?? process.cwd());
    const host = readOption(arguments_, "--host") ?? "127.0.0.1";
    const port = Number(readOption(arguments_, "--port") ?? "3000");
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      console.error("--port must be an integer from 0 through 65535");
      process.exitCode = 2;
      return;
    }
    let projectState: Awaited<ReturnType<typeof resolveProjectState>> | undefined;
    let projectStateDiagnostic: ProcessDiagnostic | undefined;
    try {
      projectState = await resolveProjectState(
        projectRepositoryPath,
        readOption(arguments_, "--state-root"),
      );
    } catch (error) {
      projectStateDiagnostic = {
        file: projectRepositoryPath,
        line: 1,
        column: 1,
        invalidValue: error instanceof Error ? error.message : String(error),
        rule: "The repository must retain one available and internally consistent project state binding",
        consequence: "Startup is blocked without creating, adopting, deleting, or relocating durable state.",
        correction: "Restore the bound project state root and its Git metadata from one verified backup generation.",
      };
    }
    const agentToolScopes = new AgentToolScopeRegistry();
    const activationTokens = new Map<string, string>();
    let agentApiBaseUrl: string | undefined;
    const mcpServerPath = fileURLToPath(new URL("./mcp/stdio-server.ts", import.meta.url));
    const agentRuntime = new CodexAgentRuntime({
      mcpServer: {
        command: process.execPath,
        args: (request) => {
          if (agentApiBaseUrl === undefined) {
            throw new Error("The agent tool endpoint is not ready");
          }
          const token = agentToolScopes.issue({
            taskId: request.task.id,
            agentId: request.agent.id,
          });
          activationTokens.set(request.activationId, token);
          return [
            "--experimental-strip-types",
            mcpServerPath,
          ];
        },
        environment: (request) => {
          const token = activationTokens.get(request.activationId);
          if (agentApiBaseUrl === undefined || token === undefined) {
            throw new Error("The agent tool scope is not ready");
          }
          return {
            COORDINATION_AGENT_API_BASE_URL: agentApiBaseUrl,
            COORDINATION_AGENT_TOOL_TOKEN: token,
          };
        },
        release: (request) => {
          const token = activationTokens.get(request.activationId);
          if (token !== undefined) agentToolScopes.revoke(token);
          activationTokens.delete(request.activationId);
        },
      },
    });
    const application = projectState === undefined
      ? CoordinationApplication.configurationError([projectStateDiagnostic!], agentRuntime)
      : await CoordinationApplication.start({
          processDefinitionPath: definitionPath,
          databasePath: projectState.databasePath,
          transcriptAccess: agentRuntime,
          runtimeDispatch: {
            projectRepositoryPath,
            taskWorkspaceRoot: projectState.taskWorkspaceRoot,
            agentRuntime,
          },
          runtimeDiagnostic: (diagnostic) => {
            console.error(
              `[runtime-start-failed] task=${diagnostic.taskId} activation=${diagnostic.activationId} boundary=${diagnostic.boundary} occurredAt=${diagnostic.occurredAt} diagnostic=${diagnostic.diagnostic}`,
            );
          },
        });
    const openWorkspaceInHost = createHostWorkspaceOpener();
    const openWorkspaceInVisualStudioCode = createVisualStudioCodeWorkspaceOpener();
    const taskWorkspaceManager = projectState === undefined
      ? undefined
      : new GitTaskWorkspaceManager(projectRepositoryPath, projectState.taskWorkspaceRoot);
    const server = await startWebServer(application, {
      host,
      port,
      agentToolScopes,
      ...(taskWorkspaceManager === undefined || openWorkspaceInHost === undefined
        ? {}
        : {
            openWorkspace: createVerifiedWorkspaceOpener(taskWorkspaceManager, openWorkspaceInHost),
            openWorkspaceInVisualStudioCode: createVerifiedWorkspaceOpener(
              taskWorkspaceManager,
              openWorkspaceInVisualStudioCode,
            ),
          }),
    });
    agentApiBaseUrl = server.baseUrl;
    console.log(`Coordination application listening at ${server.baseUrl}`);
    console.log(`Startup mode: ${application.queryStartup().mode}`);
    console.log(`Project repository: ${projectRepositoryPath}`);
    if (projectState === undefined) {
      console.log("Project state root: unavailable");
    } else {
      console.log(`Project state root: ${projectState.root}`);
      console.log(`Task workspaces: ${projectState.taskWorkspaceRoot}`);
    }
    const startup = application.queryStartup();
    if (startup.mode === "configuration-error") {
      for (const diagnostic of startup.diagnostics) console.error(formatDiagnostic(diagnostic));
    }

    const close = async (): Promise<void> => {
      await server.close();
      application.close();
    };
    process.once("SIGINT", () => void close());
    process.once("SIGTERM", () => void close());
    return;
  }

  console.error(
    "Usage:\n  coordination validate <process-definition.yaml>\n  coordination start [--process path] [--project repository] [--state-root path] [--host address] [--port number]",
  );
  process.exitCode = 2;
}

function readOption(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index === -1 ? undefined : arguments_[index + 1];
}

function createVerifiedWorkspaceOpener(
  workspaceManager: GitTaskWorkspaceManager,
  openPath: (path: string) => Promise<void>,
): (taskId: string, workspace: TaskWorkspaceView) => Promise<void> {
  return async (taskId, workspace) => {
    await workspaceManager.verify(taskId, workspace);
    await openPath(workspace.path);
  };
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
