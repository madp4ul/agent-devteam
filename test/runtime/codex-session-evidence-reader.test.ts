import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalCodexSessionEvidenceReader } from "../../src/runtime/codex-session-evidence-reader.ts";

// Contract fixtures are pinned to @openai/codex-sdk and @openai/codex 0.146.0.
test("discovers a nested matching rollout and returns its newest valid token-count record", async (t) => {
  const root = await temporarySessionsRoot(t);
  const path = await rolloutPath(root, "nested-thread");
  await writeFile(path, [
    "",
    JSON.stringify(tokenCountRecord(24_000, 112_000)),
    JSON.stringify({ type: "event_msg", payload: { type: "unrelated" } }),
    JSON.stringify(tokenCountRecord(62_000, 112_000)),
    "{ malformed newest record",
    "",
  ].join("\n"));

  const usage = await new LocalCodexSessionEvidenceReader({ sessionsRoot: root })
    .readLatestContextWindowUsage("nested-thread");

  assert.deepEqual(usage, {
    usedTokens: 62_000,
    contextWindowTokens: 112_000,
    usedPercent: 50,
  });
});

test("reuses the discovered thread path and fails optionally when that cached file disappears", async (t) => {
  const root = await temporarySessionsRoot(t);
  const path = await rolloutPath(root, "cached-thread");
  const reader = new LocalCodexSessionEvidenceReader({ sessionsRoot: root });
  await writeFile(path, `${JSON.stringify(tokenCountRecord(20_000, 112_000))}\n`);
  assert.notEqual(await reader.readLatestContextWindowUsage("cached-thread"), null);

  await unlink(path);
  const replacement = join(root, "replacement-cached-thread.jsonl");
  await writeFile(replacement, `${JSON.stringify(tokenCountRecord(80_000, 112_000))}\n`);

  assert.equal(await reader.readLatestContextWindowUsage("cached-thread"), null);
});

test("scans across a chunk boundary and ignores a partial trailing line", async (t) => {
  const root = await temporarySessionsRoot(t);
  const path = await rolloutPath(root, "chunk-thread");
  const valid = JSON.stringify(tokenCountRecord(132_000, 258_400));
  const partialTrailingLine = `{"partial":"${"x".repeat(65_440)}`;
  await writeFile(path, `${valid}\n${partialTrailingLine}`);

  assert.deepEqual(
    await new LocalCodexSessionEvidenceReader({ sessionsRoot: root })
      .readLatestContextWindowUsage("chunk-thread"),
    { usedTokens: 132_000, contextWindowTokens: 258_400, usedPercent: 49 },
  );
});

test("returns null for missing roots and files containing only unreadable or unrelated evidence", async (t) => {
  const root = await temporarySessionsRoot(t);
  assert.equal(
    await new LocalCodexSessionEvidenceReader({ sessionsRoot: join(root, "missing") })
      .readLatestContextWindowUsage("missing-thread"),
    null,
  );

  const path = await rolloutPath(root, "unrelated-thread");
  await writeFile(path, "not json\n\n{\"type\":\"event_msg\",\"payload\":{\"type\":\"other\"}}\n");
  assert.equal(
    await new LocalCodexSessionEvidenceReader({ sessionsRoot: root })
      .readLatestContextWindowUsage("unrelated-thread"),
    null,
  );
  assert.equal(
    await new LocalCodexSessionEvidenceReader({ sessionsRoot: root })
      .readLatestContextWindowUsage("no-matching-file-thread"),
    null,
  );
});

test("returns null when a matching rollout cannot be read", {
  skip: process.platform === "win32" ? "Windows file ACLs are not represented by chmod mode bits" : false,
}, async (t) => {
  const root = await temporarySessionsRoot(t);
  const path = await rolloutPath(root, "unreadable-thread");
  await writeFile(path, `${JSON.stringify(tokenCountRecord(20_000, 112_000))}\n`);
  await chmod(path, 0o000);
  t.after(() => chmod(path, 0o600));

  assert.equal(
    await new LocalCodexSessionEvidenceReader({ sessionsRoot: root })
      .readLatestContextWindowUsage("unreadable-thread"),
    null,
  );
});

test("rejects invalid pinned token-count values", async (t) => {
  const root = await temporarySessionsRoot(t);
  const path = await rolloutPath(root, "invalid-thread");
  const invalidValues = [
    tokenCountRecord(-1, 112_000),
    tokenCountRecord(1.5, 112_000),
    tokenCountRecord(Number.MAX_SAFE_INTEGER + 1, 112_000),
    tokenCountRecord(20_000, 0),
    tokenCountRecord(20_000, -1),
    tokenCountRecord("20000", 112_000),
    { type: "event_msg", payload: { type: "token_count", info: {} } },
  ];
  const reader = new LocalCodexSessionEvidenceReader({ sessionsRoot: root });

  for (const record of invalidValues) {
    await writeFile(path, `${JSON.stringify(record)}\n`);
    assert.equal(await reader.readLatestContextWindowUsage("invalid-thread"), null);
  }
});

test("preserves the 12,000-token display baseline and percentage clamps", async (t) => {
  const root = await temporarySessionsRoot(t);
  const path = await rolloutPath(root, "percentage-thread");
  const reader = new LocalCodexSessionEvidenceReader({ sessionsRoot: root });
  const cases = [
    { usedTokens: 0, windowTokens: 12_000, usedPercent: 100 },
    { usedTokens: 0, windowTokens: 8_000, usedPercent: 100 },
    { usedTokens: 0, windowTokens: 112_000, usedPercent: 0 },
    { usedTokens: 12_000, windowTokens: 112_000, usedPercent: 0 },
    { usedTokens: 62_000, windowTokens: 112_000, usedPercent: 50 },
    { usedTokens: 200_000, windowTokens: 112_000, usedPercent: 100 },
  ];

  for (const value of cases) {
    await writeFile(path, `${JSON.stringify(tokenCountRecord(value.usedTokens, value.windowTokens))}\n`);
    assert.deepEqual(await reader.readLatestContextWindowUsage("percentage-thread"), {
      usedTokens: value.usedTokens,
      contextWindowTokens: value.windowTokens,
      usedPercent: value.usedPercent,
    });
  }
});

test("resolves the default sessions root through CODEX_HOME, USERPROFILE, and the platform home", async (t) => {
  const root = await temporarySessionsRoot(t);
  const codexHome = join(root, "configured-codex-home");
  const profile = join(root, "profile");
  const platformHome = join(root, "platform-home");

  await writeDefaultRollout(codexHome, "codex-home-thread", 30_000);
  assert.notEqual(
    await new LocalCodexSessionEvidenceReader({
      environment: { CODEX_HOME: codexHome, USERPROFILE: profile },
      platformHome: () => platformHome,
    }).readLatestContextWindowUsage("codex-home-thread"),
    null,
  );

  await writeDefaultRollout(join(profile, ".codex"), "profile-thread", 40_000);
  assert.notEqual(
    await new LocalCodexSessionEvidenceReader({
      environment: { USERPROFILE: profile },
      platformHome: () => platformHome,
    }).readLatestContextWindowUsage("profile-thread"),
    null,
  );

  await writeDefaultRollout(join(platformHome, ".codex"), "platform-home-thread", 50_000);
  assert.notEqual(
    await new LocalCodexSessionEvidenceReader({
      environment: {},
      platformHome: () => platformHome,
    }).readLatestContextWindowUsage("platform-home-thread"),
    null,
  );
});

async function temporarySessionsRoot(t: test.TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "coordination-codex-evidence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function rolloutPath(root: string, threadId: string): Promise<string> {
  const directory = join(root, "2026", "08", "31");
  await mkdir(directory, { recursive: true });
  return join(directory, `rollout-2026-08-31T12-00-00-${threadId}.jsonl`);
}

async function writeDefaultRollout(codexHome: string, threadId: string, usedTokens: number): Promise<void> {
  const sessionsRoot = join(codexHome, "sessions");
  const path = await rolloutPath(sessionsRoot, threadId);
  await writeFile(path, `${JSON.stringify(tokenCountRecord(usedTokens, 112_000))}\n`);
}

function tokenCountRecord(usedTokens: unknown, windowTokens: unknown): unknown {
  return {
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: { total_tokens: 932_000 },
        last_token_usage: { total_tokens: usedTokens },
        model_context_window: windowTokens,
      },
    },
  };
}
