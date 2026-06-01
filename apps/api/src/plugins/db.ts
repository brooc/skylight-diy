import fp from "fastify-plugin";
import { db } from "@skylight-diy/db";

declare module "fastify" {
  interface FastifyInstance {
    db: typeof db;
  }
}

export const dbPlugin = fp(async (app) => {
  app.decorate("db", db);
});
