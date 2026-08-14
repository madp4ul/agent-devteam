import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import test from "node:test";

const textExtensions = new Set([".css", ".html", ".ts", ".tsx"]);
const mojibakeMarkers = [
  { name: "U+00C2 UTF-8 mojibake lead", pattern: /\u00c2/gu },
  { name: "U+00C3 UTF-8 mojibake lead", pattern: /\u00c3/gu },
  { name: "C1 control character", pattern: /[\u0080-\u009f]/gu },
  { name: "misdecoded punctuation", pattern: /\u00e2(?:\u20ac|[\u0080-\u009f])/gu },
  { name: "misdecoded emoji", pattern: /\u00f0(?:\u0178|[\u0080-\u009f])/gu },
  { name: "Unicode replacement character", pattern: /\ufffd/gu },
] as const;

test("browser UI source contains no mojibake markers", async () => {
  const repositoryRoot = resolve(import.meta.dirname, "../..");
  const files = (
    await Promise.all([
      collectTextFiles(join(repositoryRoot, "src", "web")),
      collectTextFiles(join(repositoryRoot, "web")),
    ])
  ).flat();
  const offenses: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const marker of mojibakeMarkers) {
      for (const match of text.matchAll(marker.pattern)) {
        const index = match.index;
        const line = text.slice(0, index).split("\n").length;
        offenses.push(`${relative(repositoryRoot, file)}:${line}: ${marker.name}`);
      }
    }
  }

  assert.deepEqual(offenses, []);
});

async function collectTextFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTextFiles(path);
    return entry.isFile() && textExtensions.has(extname(entry.name)) ? [path] : [];
  }));
  return files.flat();
}
