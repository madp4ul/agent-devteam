import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./schema-v2.ts",
  out: "./drizzle-modeled",
});
