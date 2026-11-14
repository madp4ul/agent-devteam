import assert from "node:assert/strict";
import test from "node:test";
import { retainOlderMenuEntries, uniqueMenuEntries } from "../../src/web/client/menu-history-retention.ts";

test("a new first page cannot remove the boundary of already requested menu history", () => {
  const entries = (highest: number, lowest: number) => Array.from({ length: highest - lowest + 1 }, (_, index) => ({ id: String(highest - index) }));
  const previous = entries(100, 51);
  const older = entries(50, 1);
  const latest = entries(101, 52);
  const retained = retainOlderMenuEntries(latest, previous, older);
  assert.deepEqual(retained, entries(51, 1));
  assert.equal(uniqueMenuEntries([...latest, ...retained]).length, 101);
  assert.deepEqual(retainOlderMenuEntries(latest, previous, []), []);
});
