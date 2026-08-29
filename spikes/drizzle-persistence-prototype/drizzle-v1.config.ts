import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./schema-v1.ts",
  out: "./drizzle-modeled",
});
