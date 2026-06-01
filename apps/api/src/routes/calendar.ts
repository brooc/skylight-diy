import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const eventsQuerySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  timezone: z.string().min(1)
});

export const calendarRoutes: FastifyPluginAsync = async (app) => {
  app.get("/calendar/accounts", async () => {
    return { accounts: [] };
  });

  app.get("/calendar/sources", async () => {
    return { sources: [] };
  });

  app.post("/calendar/sources/import-from-google", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    return { imported: 0, sources: [] };
  });

  app.patch("/calendar/sources/:sourceId", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    return { updated: false, sourceId: (request.params as { sourceId: string }).sourceId };
  });

  app.get("/calendar/events", async (request, reply) => {
    const parsed = eventsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_calendar_query",
        details: parsed.error.flatten()
      });
    }

    return {
      rangeStart: parsed.data.start,
      rangeEnd: parsed.data.end,
      timezone: parsed.data.timezone,
      events: [],
      sources: [],
      cacheStatus: "miss",
      degraded: true,
      warnings: [
        {
          code: "NO_ACCOUNT_CONNECTED",
          message: "No calendar account connected yet."
        }
      ]
    };
  });
};
