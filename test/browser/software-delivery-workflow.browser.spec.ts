import { expect, test } from "./browser-fixture.ts";

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type {
  AgentRunLifecycle,
  AgentRunOutcome,
  AgentRunRequest,
  AgentRuntime,
} from "../../src/application/runtime-contract.ts";
import { AgentToolScopeRegistry } from "../../src/mcp/agent-tool-scope.ts";
import { startWebServer } from "../../src/web/web-server.ts";

const execFileAsync = promisify(execFile);

test("the software-delivery example completes rework, consultation, approval, and real Git integration", async ({ page }) => {
  test.setTimeout(60_000);
  const fixture = await createRepositoryFixture();
  const scopes = new AgentToolScopeRegistry();
  const runtime = new ScriptedDeliveryRuntime(scopes, fixture.repositoryPath);
  const application = await CoordinationApplication.start({
    processDefinitionPath: resolve("examples/software-delivery/process.yaml"),
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  const server = await startWebServer(application, {
    host: "127.0.0.1",
    port: 0,
    agentToolScopes: scopes,
  });
  runtime.connect(server.baseUrl);
  test.info().annotations.push({ type: "proof-server", description: server.baseUrl });
  try {
    await page.goto(server.baseUrl);
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
    await page.getByRole("button", { name: "Create task in Backlog" }).click();
    await page.getByLabel("Outcome-oriented title").fill("Add prefixes to generated summaries");
    await page.getByLabel("Complete description").fill(
      "Add an optional prefix across formatter and summary modules, preserve empty-prefix behavior, " +
      "verify it through the public summary API, and leave room for future localization. " +
      "Multiple boundary placements are reasonable and the change fits one implementation context.",
    );
    await page.getByRole("button", { name: "Create task", exact: true }).click();
    const taskLink = page.getByRole("link", { name: /T-0001 Add prefixes to generated summaries/ });
    await taskLink.click();
    await page.getByRole("combobox", { name: "Move task" }).selectOption("architecture-design");
    await page.getByRole("link", { name: "Back to board" }).click();
    await page.getByRole("button", { name: "Resume" }).click();

    const approvalColumn = page.getByTestId("column-awaiting-user-approval");
    await expect.poll(() => {
      if (runtime.errors.length > 0) return `runtime error: ${runtime.errors.join("; ")}`;
      const task = application.queryTask("T-0001");
      return task.available ? task.task.columnId : "missing";
    }, { timeout: 20_000 }).toBe("awaiting-user-approval");
    await expect(approvalColumn.getByRole("link", { name: /T-0001 Add prefixes/ }))
      .toBeVisible({ timeout: 20_000 });
    await approvalColumn.getByRole("link", { name: /T-0001 Add prefixes/ }).click();
    const timeline = page.getByRole("region", { name: "Task timeline" });
    await expect(timeline).toContainText("Design plan:");
    await expect(timeline).toContainText("@architecture-designer please clarify");
    await expect(timeline).toContainText("@code-reviewer the stable boundary");
    await expect(timeline).toContainText("Requested revision:");
    await expect(timeline).toContainText("Architecture verified");
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

    const beforeApproval = application.queryTask("T-0001");
    assert.equal(beforeApproval.available, true);
    if (!beforeApproval.available) return;
    assert.equal(beforeApproval.task.columnId, "awaiting-user-approval");
    assert.equal(runtime.agentIds.includes("merge-agent"), false);
    await page.getByRole("combobox", { name: "Move task" }).selectOption("ready-to-merge");

    await expect.poll(() => {
      const task = application.queryTask("T-0001");
      return task.available ? task.task.columnId : "missing";
    }, { timeout: 20_000 }).toBe("completion");
    await application.waitForAutomationIdle();
    await page.goto(server.baseUrl);
    await expect(page.getByTestId("column-completion")
      .getByRole("link", { name: /T-0001 Add prefixes/ })).toBeVisible();

    assert.deepEqual(runtime.agentIds, [
      "architecture-designer",
      "implementation-agent",
      "code-reviewer",
      "architecture-designer",
      "code-reviewer",
      "implementation-agent",
      "code-reviewer",
      "architecture-verifier",
      "merge-agent",
    ]);
    assert.deepEqual(runtime.errors, []);
    const workspacePath = runtime.workspacePath;
    assert.ok(workspacePath);
    assert.equal(await readFile(join(workspacePath, "test.mjs"), "utf8").then((text) => text.includes("blank prefix")), true);
    const { stdout: log } = await execFileAsync("git", ["-C", workspacePath, "log", "-1", "--pretty=%s"]);
    assert.equal(log.trim(), "Integrate optional summary prefixes");
    const { stdout: status } = await execFileAsync("git", ["-C", workspacePath, "status", "--porcelain"]);
    assert.equal(status, "");
    const { stdout: projectLog } = await execFileAsync("git", ["-C", fixture.repositoryPath, "log", "-1", "--pretty=%s"]);
    assert.equal(projectLog.trim(), "Integrate optional summary prefixes");
    assert.match(await readFile(join(fixture.repositoryPath, "test.mjs"), "utf8"), /blank prefix/);
  } finally {
    await server.close();
    application.close();
  }
});

class ScriptedDeliveryRuntime implements AgentRuntime {
  readonly agentIds: string[] = [];
  readonly errors: string[] = [];
  workspacePath: string | undefined;
  readonly #scopes: AgentToolScopeRegistry;
  readonly #projectRepositoryPath: string;
  #baseUrl: string | undefined;
  #reviewRuns = 0;
  #implementationRuns = 0;

  constructor(scopes: AgentToolScopeRegistry, projectRepositoryPath: string) {
    this.#scopes = scopes;
    this.#projectRepositoryPath = projectRepositoryPath;
  }

  connect(baseUrl: string): void {
    this.#baseUrl = baseUrl;
  }

  async run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.agentIds.push(request.agent.id);
    this.workspacePath = request.workspace.path;
    lifecycle.started(`thread-${this.agentIds.length}`);
    try {
      await this.#handle(request);
      return {
        status: "completed",
        summary: `${request.agent.name} completed the scripted proof step.`,
        threadId: `thread-${this.agentIds.length}`,
      };
    } catch (error) {
      const diagnostic = error instanceof Error ? error.message : String(error);
      this.errors.push(diagnostic);
      return { status: "failed", summary: diagnostic, threadId: `thread-${this.agentIds.length}` };
    }
  }

  async #handle(request: AgentRunRequest): Promise<void> {
    switch (request.agent.id) {
      case "architecture-designer":
        if (request.reason.type === "agent-mention") {
          await this.#comment(request, "@code-reviewer the stable boundary is the public summary API; keep normalization in the formatter.");
        } else {
          await this.#comment(request,
            "Design plan: change formatter.mjs and summary.mjs behind the public summary API. " +
            "Keep normalization in the formatter, verify literals through test.mjs, and preserve callers. " +
            "Risk: blank prefixes. Trade-off: one shared helper over duplicated checks. " +
            "Future dimension: localized labels. Stable assumption: string input. Deliberate constraint: no options object.");
          await this.#move(request, "implementation");
        }
        return;
      case "implementation-agent":
        this.#implementationRuns += 1;
        if (this.#implementationRuns === 1) {
          await writeFile(join(request.workspace.path, "formatter.mjs"),
            "export const formatPrefix = (prefix) => prefix.length === 0 ? '' : `${prefix}: `;\n");
          await writeFile(join(request.workspace.path, "summary.mjs"),
            "import { formatPrefix } from './formatter.mjs';\nexport const summary = (value, prefix = '') => `${formatPrefix(prefix)}${value}`;\n");
          await writeFile(join(request.workspace.path, "test.mjs"),
            "import assert from 'node:assert/strict';\nimport { summary } from './summary.mjs';\nassert.equal(summary('ready', 'Build'), 'Build: ready');\n");
          await this.#comment(request, "Implementation complete across formatter and summary modules; focused public-API check passes.");
        } else {
          await writeFile(join(request.workspace.path, "formatter.mjs"),
            "export const formatPrefix = (prefix) => prefix.trim().length === 0 ? '' : `${prefix.trim()}: `;\n");
          await writeFile(join(request.workspace.path, "test.mjs"),
            "import assert from 'node:assert/strict';\nimport { summary } from './summary.mjs';\nassert.equal(summary('ready', 'Build'), 'Build: ready');\nassert.equal(summary('ready', '   '), 'ready', 'blank prefix stays inert');\n");
          await execFileAsync(process.execPath, [join(request.workspace.path, "test.mjs")]);
          await this.#comment(request, "Requested revision addressed: whitespace-only prefixes are inert and the complete repository check passes.");
        }
        await this.#move(request, "code-review");
        return;
      case "code-reviewer":
        this.#reviewRuns += 1;
        if (this.#reviewRuns === 1) {
          await this.#comment(request, "@architecture-designer please clarify whether blank-prefix normalization belongs at the public boundary.");
        } else if (request.reason.type === "agent-mention") {
          await this.#comment(request, "Requested revision: add a public-API regression check for whitespace-only prefixes, then return to Code Review.");
          await this.#move(request, "implementation");
        } else {
          await this.#comment(request, "Code review approved: the requested regression is covered and no further response is required from the Architecture Designer.");
          await this.#move(request, "architecture-verification");
        }
        return;
      case "architecture-verifier":
        await this.#comment(request, "Architecture verified: the public seam and future localization boundary match the plan.");
        await this.#move(request, "awaiting-user-approval");
        return;
      case "merge-agent":
        await execFileAsync("git", ["-C", request.workspace.path, "add", "formatter.mjs", "summary.mjs", "test.mjs"]);
        await execFileAsync("git", ["-C", request.workspace.path, "-c", "user.name=Proof Merge Agent",
          "-c", "user.email=proof@example.invalid", "commit", "-m", "Integrate optional summary prefixes"]);
        const { stdout: approvedCommit } = await execFileAsync("git", ["-C", request.workspace.path, "rev-parse", "HEAD"]);
        await execFileAsync("git", ["-C", this.#projectRepositoryPath, "merge", "--ff-only", approvedCommit.trim()]);
        await execFileAsync(process.execPath, [join(this.#projectRepositoryPath, "test.mjs")]);
        await this.#comment(request, "Integration verified: fast-forwarded main to the approved commit and reran the public summary check.");
        await this.#move(request, "completion");
        return;
      default:
        throw new Error(`Unexpected proof agent ${request.agent.id}`);
    }
  }

  async #comment(request: AgentRunRequest, body: string): Promise<void> {
    const response = await fetch(`${this.#requireBaseUrl()}/agent-api/current-task/comments`, {
      method: "POST",
      headers: this.#headers(request),
      body: JSON.stringify({ body, idempotencyKey: `proof-comment-${this.agentIds.length}` }),
    });
    if (!response.ok) throw new Error(await response.text());
  }

  async #move(request: AgentRunRequest, destinationColumnId: string): Promise<void> {
    const currentResponse = await fetch(`${this.#requireBaseUrl()}/agent-api/current-task`, {
      headers: this.#headers(request),
    });
    if (!currentResponse.ok) throw new Error(await currentResponse.text());
    const current = await currentResponse.json() as { revision: number };
    const response = await fetch(`${this.#requireBaseUrl()}/agent-api/current-task/move`, {
      method: "POST",
      headers: this.#headers(request),
      body: JSON.stringify({
        destinationColumnId,
        expectedRevision: current.revision,
        idempotencyKey: `proof-move-${this.agentIds.length}`,
      }),
    });
    if (!response.ok) throw new Error(await response.text());
  }

  #headers(request: AgentRunRequest): Record<string, string> {
    const token = this.#scopes.issue({
      taskId: request.task.id,
      agentId: request.agent.id,
      attemptId: request.attemptId,
    });
    return { authorization: `Bearer ${token}`, "content-type": "application/json" };
  }

  #requireBaseUrl(): string {
    assert.ok(this.#baseUrl);
    return this.#baseUrl;
  }
}

async function createRepositoryFixture(): Promise<{
  repositoryPath: string;
  workspaceRoot: string;
  databasePath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "coordination-delivery-proof-"));
  const repositoryPath = join(directory, "project");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await Promise.all([
    writeFile(join(repositoryPath, "formatter.mjs"), "export const formatPrefix = () => '';\n"),
    writeFile(join(repositoryPath, "summary.mjs"), "export const summary = (value) => value;\n"),
    writeFile(join(repositoryPath, "test.mjs"), "import assert from 'node:assert/strict';\nassert.ok(true);\n"),
  ]);
  await execFileAsync("git", ["-C", repositoryPath, "add", "."]);
  await execFileAsync("git", ["-C", repositoryPath, "-c", "user.name=Proof Fixture",
    "-c", "user.email=proof@example.invalid", "commit", "-m", "Initial fixture"]);
  return {
    repositoryPath,
    workspaceRoot: join(directory, "workspaces"),
    databasePath: join(directory, "coordination.sqlite3"),
  };
}
