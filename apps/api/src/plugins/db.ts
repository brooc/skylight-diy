import fp from "fastify-plugin";
import { db } from "@daymark/db";

declare module "fastify" {
  interface FastifyInstance {
    db: typeof db;
  }
}

export const dbPlugin = fp(async (app) => {
  app.decorate("db", db);
});
