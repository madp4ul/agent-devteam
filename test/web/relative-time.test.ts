import assert from "node:assert/strict";
import test from "node:test";

import { formatRelativeTime } from "../../src/web/client/relative-time.ts";

const now = Date.parse("2026-08-10T12:00:00.000Z");

test("relative timeline time adapts its precision to elapsed time", () => {
  assert.equal(formatRelativeTime(new Date(now - 2_000), now), "just now");
  assert.equal(formatRelativeTime(new Date(now - 5 * 60_000), now), "5 minutes ago");
  assert.equal(formatRelativeTime(new Date(now - 60 * 60_000), now), "1 hour ago");
  assert.equal(formatRelativeTime(new Date(now - 24 * 60 * 60_000), now), "1 day ago");
});
