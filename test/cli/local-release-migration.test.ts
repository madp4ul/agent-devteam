import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { promisify } from "node:util";
import { initialReleasedMigration } from "../../src/application/internal/migrations/0001-initial-released-schema.ts";
import { stopHost } from "../support/cli-host-lifecycle.ts";

const exec = promisify(execFile);

test("installed startup preserves retained data and recovery evidence on successful and rejected upgrades", { timeout: 180_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-installed-upgrade-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "installations");
  const build = await exec(process.execPath, [resolve("scripts/create-local-release.mjs"), "--root", root, "--id", "upgrade-proof"], { timeout: 140_000, maxBuffer: 4 * 1024 * 1024 });
  const installation = JSON.parse(build.stdout.trim().split("\n").at(-1)!) as { directory: string };
  const definition = join(directory, "process.yaml");
  await writeFile(definition, `schemaVersion: 1
name: Installed upgrade proof
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Preserve retained work.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Preserve evidence.
    columns:
      - id: backlog
        name: Backlog
`);

  for (const rejected of [false, true]) {
    const project = join(directory, rejected ? "rejected" : "upgraded");
    await exec("git", ["init", "--initial-branch=main", project]);
    const state = `${project}-agent-coordination-state`;
    await mkdir(state);
    const databasePath = join(state, "coordination.sqlite3");
    const legacy = new DatabaseSync(databasePath);
    initialReleasedMigration.apply(legacy);
    legacy.prepare("INSERT INTO coordination_migrations VALUES (1, ?)").run(initialReleasedMigration.id);
    legacy.exec(`INSERT INTO boards VALUES ('delivery', 'Delivery', 'Preserve evidence.', 0, 1);
      INSERT INTO columns VALUES ('delivery', 'backlog', 'Backlog', 0, NULL, 0, 1);
      INSERT INTO task_numbers VALUES (1);
      INSERT INTO tasks(id, sequence, board_id, column_id, title, description, revision)
        VALUES ('retained-task', 1, 'delivery', 'backlog', 'Retained incident evidence', 'Keep this exact description', 1);
      INSERT INTO agents VALUES ('retained-agent', 'Retained Agent', 'Inspect evidence', 'Historical agent', 'retained.md', 'Preserve evidence.', NULL, NULL, 0);
      INSERT INTO activity_ledger(id, task_id, type, actor_kind, actor_id, occurred_at, details_json)
        VALUES ('retained-event', 'retained-task', 'task.created', 'user', 'user', '2026-01-01T00:00:00.000Z', '{}');
      INSERT INTO activations(id, task_id, target_agent_id, reason_type, source_event_id, status, created_at, definition_version)
        VALUES ('retained-activation', 'retained-task', 'retained-agent', 'column-entry', 'retained-event', 'completed', '2026-01-01T00:01:00.000Z', 'retained-definition');
      INSERT INTO agent_conversations(id, task_id, owning_agent_id, owning_agent_name_snapshot, generated_label, originating_activation_id, current_thread_id, created_at, latest_activity_at, latest_activity_sequence, delivered_description, delivered_comment_sequence, delivered_activity_sequence)
        VALUES ('retained-conversation', 'retained-task', 'retained-agent', 'Retained Agent', 'Incident conversation', 'retained-activation', 'retained-thread', '2026-01-01T00:01:00.000Z', '2026-01-01T00:03:00.000Z', 1, 'Keep this exact description', 0, 1);
      UPDATE activations SET conversation_id = 'retained-conversation' WHERE id = 'retained-activation';
      INSERT INTO attempts(id, activation_id, status, workspace_path, started_at, completed_at, outcome_status, outcome_summary, thread_id, outcome_kind)
        VALUES ('retained-attempt', 'retained-activation', 'completed', 'historical-workspace', '2026-01-01T00:01:00.000Z', '2026-01-01T00:03:00.000Z', 'completed', 'Retained incident outcome', 'retained-thread', 'completed');
      INSERT INTO attempt_transcripts VALUES ('retained-attempt', '[{"kind":"message","role":"agent","text":"Retained diagnostic transcript"}]', NULL, NULL);`);
    if (rejected) legacy.exec(`CREATE TRIGGER reject_fixture_upgrade BEFORE INSERT ON coordination_migrations
      WHEN NEW.position = 2 BEGIN SELECT RAISE(ABORT, 'fixture-upgrade-rejected'); END;`);
    legacy.close();

    const host = spawn(process.execPath, [join(installation.directory, "launch.mjs"), "start", "--project", project, "--process", definition, "--port", "0"], { stdio: ["ignore", "pipe", "pipe"] });
    try {
      let output = "";
      await new Promise<void>((accept, reject) => {
        const timeout = setTimeout(() => finish(new Error(`Installed startup timed out: ${output}`)), 25_000);
        const observe = (chunk: Buffer): void => {
          output += chunk.toString();
          if (rejected ? output.includes("fixture-upgrade-rejected") : output.includes("Startup mode: paused")) finish();
        };
        const exited = (): void => finish(new Error(`Installed host exited early: ${output}`));
        const finish = (error?: Error): void => {
          clearTimeout(timeout);
          host.stdout.off("data", observe); host.stderr.off("data", observe); host.off("exit", exited);
          if (error) reject(error); else accept();
        };
        host.stdout.on("data", observe); host.stderr.on("data", observe); host.once("exit", exited);
      });
      assert.match(output, /Framework release: upgrade-proof/);
      assert.match(output, rejected ? /Startup mode: configuration-error/ : /Startup mode: paused/);
      if (!rejected) {
        const baseUrl = output.match(/Coordination application listening at (http:\/\/[^\s]+)/)?.[1];
        assert.ok(baseUrl);
        const task = await fetch(`${baseUrl}/api/tasks/retained-task`);
        assert.equal(task.status, 200);
        assert.match(await task.text(), /Retained incident evidence/);
      }
    } finally {
      await stopHost(host);
    }

    // Outside-agent inspection intentionally uses retained files, not application internals.
    const backups = (await readdir(state)).filter(name => name.startsWith("coordination.sqlite3.pre-migration-"));
    assert.equal(backups.length, 1, "the normal verified pre-upgrade recovery copy remains discoverable");
    for (const [path, oldHistory] of [[databasePath, rejected], [join(state, backups[0]!), true]] as const) {
      const evidence = new DatabaseSync(path, { readOnly: true });
      try {
        assert.equal(evidence.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
        assert.equal(evidence.prepare("SELECT description FROM tasks WHERE id = 'retained-task'").get()?.description, "Keep this exact description");
        assert.equal(evidence.prepare("SELECT thread_id FROM attempts WHERE id = 'retained-attempt'").get()?.thread_id, "retained-thread");
        assert.equal(evidence.prepare("SELECT current_thread_id FROM agent_conversations WHERE id = 'retained-conversation'").get()?.current_thread_id, "retained-thread");
        assert.match(String(evidence.prepare("SELECT items_json FROM attempt_transcripts WHERE attempt_id = 'retained-attempt'").get()?.items_json), /Retained diagnostic transcript/);
        const count = evidence.prepare("SELECT count(*) AS count FROM coordination_migrations").get()?.count;
        if (oldHistory) assert.equal(count, 1); else assert.ok(Number(count) > 1);
      } finally { evidence.close(); }
    }
    assert.match(await readFile(join(installation.directory, "src/application/internal/migrations/0001-initial-released-schema.ts"), "utf8"), /0001_initial_released_schema/);
  }
});
