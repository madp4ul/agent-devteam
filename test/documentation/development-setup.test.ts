import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../../", import.meta.url);

test("the source setup guide bootstraps a clean Windows environment", async () => {
  const [readme, setupGuide] = await Promise.all([
    readFile(new URL("README.md", repositoryRoot), "utf8"),
    readFile(new URL("docs/development-setup.md", repositoryRoot), "utf8"),
  ]);

  assert.match(
    readme,
    /\[development setup guide\]\(docs\/development-setup\.md\)/i,
  );
  assert.match(setupGuide, /Node\.js 24 LTS/i);
  assert.match(setupGuide, /npm install --global pnpm@11\.9\.0/);
  assert.match(setupGuide, /pnpm --version/);
  assert.match(setupGuide, /pnpm install --frozen-lockfile/);
  assert.match(setupGuide, /Codex.+private.+runtime/is);
});
