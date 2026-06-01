import { households, people } from "@skylight-diy/db";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

export const householdRoutes: FastifyPluginAsync = async (app) => {
  app.get("/household/current", async (_request, reply) => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const members = await app.db
      .select()
      .from(people)
      .where(eq(people.householdId, household.id));

    return {
      household,
      people: members
    };
  });
};
