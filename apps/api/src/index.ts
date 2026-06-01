import { buildServer } from "./server";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

async function run(): Promise<void> {
  const app = buildServer();

  try {
    await app.listen({ port, host });
    app.log.info(`API running at http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

run();
