import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function retentionFixture(t: test.TestContext, changed = false, invalidLatest = false) {
  const framework = Array.from({ length: 8 }, (_, index) => {
    const id = index + 1;
    return { id, tag_name: `v0.0.${id}`, draft: false, prerelease: false,
      published_at: `2026-01-${String(id).padStart(2, "0")}T00:00:00Z`, updated_at: "2026-02-01T00:00:00Z",
      assets: [{ id: id + 1000, name: `agent-coordination-framework-v0.0.${id}-win32-x64.zip`, state: "uploaded", size: 220, digest: "sha256:" + "a".repeat(64) }] };
  });
  const unrelated = Array.from({ length: 97 }, (_, index) => ({ ...framework[0]!, id: index + 100, tag_name: `v9.0.${index}`, assets: [] }));
  const releases = [...unrelated, ...framework, { ...framework[0]!, id: 501, draft: true }, { ...framework[0]!, id: 502, prerelease: true }];
  const deleted: number[] = [];
  const requests: string[] = [];
  let latestReads = 0;
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer fixture-retention-token");
    const url = new URL(request.url!, "http://fixture");
    requests.push(`${request.method} ${url.pathname}${url.search}`);
    if (request.method === "GET" && url.pathname.endsWith("/releases/latest")) {
      latestReads++;
      response.end(JSON.stringify(invalidLatest && latestReads > 1 ? { id: 0 } : framework[changed && latestReads > 1 ? 0 : 5]));
    } else if (request.method === "GET" && url.pathname.endsWith("/releases/tags/v0.0.8")) {
      response.end(JSON.stringify(framework[7]));
    } else if (request.method === "GET" && url.pathname.endsWith("/releases")) {
      const page = Number(url.searchParams.get("page") ?? 1);
      response.end(JSON.stringify(releases.slice((page - 1) * 100, page * 100)));
    } else if (/\/releases\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split("/").at(-1));
      const item = framework.find(item => item.id === id);
      if (!item) { response.writeHead(404).end(); return; }
      if (request.method === "DELETE") {
        assert.notEqual(id, 8, "just published release must survive");
        assert.notEqual(id, changed ? 1 : 6, "server designated latest must survive");
        deleted.push(id); response.writeHead(204).end();
      } else response.end(JSON.stringify(changed && id === 2 ? { ...item, updated_at: "2026-03-01T00:00:00Z" } : item));
    } else response.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const execution = exec(process.execPath, [resolve("scripts/prune-github-releases.mjs"), "--repository", "fixture/framework", "--published-tag", "v0.0.8", "--keep", "5", "--api-base", `http://127.0.0.1:${address.port}`], {
    env: { ...process.env, GH_TOKEN: "fixture-retention-token", GITHUB_TOKEN: "" }, timeout: 20_000,
  });
  if (invalidLatest) {
    await assert.rejects(execution, /Cannot reconfirm GitHub latest/);
    assert.deepEqual(deleted, [], "uncertain latest identity cannot authorize deletion");
    return { deleted, requests, result: undefined };
  }
  const result = await execution;
  return { deleted, requests, result: JSON.parse(result.stdout.trim()) };
}

test("hosted retention keeps five framework versions and preserves source tags and other releases", async (t) => {
  const fixture = await retentionFixture(t);
  assert.deepEqual(fixture.deleted, [1, 2, 3]);
  assert.ok(fixture.requests.some(request => request.includes("page=2")), "the complete paginated release population is considered");
  assert.ok(fixture.requests.filter(request => request.startsWith("DELETE")).every(request => /\/releases\/\d+$/.test(request)));
  assert.deepEqual(fixture.result.deleted, [1, 2, 3]);
});

test("hosted retention preserves a newly designated latest and a changed deletion target", async (t) => {
  const fixture = await retentionFixture(t, true);
  assert.deepEqual(fixture.deleted, [3]);
  assert.deepEqual(fixture.result.skipped.sort((a: number, b: number) => a - b), [1, 2]);
});

test("hosted retention stops without deletion if latest identity becomes invalid", async (t) => {
  await retentionFixture(t, false, true);
});
