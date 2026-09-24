import assert from "node:assert/strict";
import test from "node:test";

import react from "@vitejs/plugin-react";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("the shared Markdown renderer supports tables without changing link sanitization", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [react()],
    root: process.cwd(),
    server: { middlewareMode: true },
  });
  try {
    const module = await server.ssrLoadModule("/src/web/client/MarkdownContent.tsx") as {
      MarkdownContent: ComponentType<{ source: string }>;
    };
    const source = [
      "A bare URL stays text: https://example.invalid/plain",
      "",
      "| Work | Result |",
      "| :--- | ---: |",
      "| **Build** | [Passed](https://example.com/result) |",
      "",
      "![Disallowed image](https://example.com/image.png)",
    ].join("\n");

    const markup = renderToStaticMarkup(createElement(module.MarkdownContent, { source }));

    assert.match(markup, /class="markdown-table-scroll"/);
    assert.match(markup, /role="region"/);
    assert.match(markup, /tabindex="0"/);
    assert.match(markup, /<table><thead><tr><th style="text-align:left">Work<\/th><th style="text-align:right">Result<\/th>/);
    assert.match(markup, /<tbody><tr><td style="text-align:left"><strong>Build<\/strong><\/td><td style="text-align:right"><a href="https:\/\/example.com\/result"[^>]*>Passed<\/a>/);
    assert.doesNotMatch(markup, /<a href="https:\/\/example\.invalid\/plain"/);
    assert.doesNotMatch(markup, /<img/);
  } finally {
    await server.close();
  }
});
