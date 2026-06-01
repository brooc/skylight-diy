import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client";

async function run(): Promise<void> {
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  await pool.end();
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Migration failed", error);
  process.exit(1);
});
