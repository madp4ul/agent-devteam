import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  plugins: [react()],
  define: { "import.meta.env.VITE_FRAMEWORK_VERSION": JSON.stringify(version) },
  root: "web",
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
});
