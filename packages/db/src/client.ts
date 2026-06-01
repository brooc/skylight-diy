import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { parseEnv } from "@skylight-diy/config";
import * as schema from "./schema";

const env = parseEnv(process.env);

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

export const db = drizzle(pool, { schema });
