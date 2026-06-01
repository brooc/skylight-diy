import { defineConfig } from "drizzle-kit";
import { parseEnv } from "@skylight-diy/config";

const env = parseEnv(process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: env.DATABASE_URL
  }
});
