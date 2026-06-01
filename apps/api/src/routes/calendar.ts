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

    const rangeStart = new Date(parsed.data.start);
    const startDay = new Date(rangeStart);
    startDay.setHours(0, 0, 0, 0);
    const toIsoAt = (dayOffset: number, hours = 0, minutes = 0): string => {
      const value = new Date(startDay);
      value.setDate(startDay.getDate() + dayOffset);
      value.setHours(hours, minutes, 0, 0);
      return value.toISOString();
    };

    const demoEvents = [
      {
        id: "evt-1",
        title: "Coffee With Diane",
        start: toIsoAt(1, 9, 45),
        end: toIsoAt(1, 11, 0),
        isAllDay: false,
        sourceName: "Kiddo",
        color: "#f3cfd0"
      },
      {
        id: "evt-2",
        title: "Pickup Dry Cleaning",
        start: toIsoAt(2, 9, 30),
        end: toIsoAt(2, 10, 15),
        isAllDay: false,
        sourceName: "Parent",
        color: "#bee8ea"
      },
      {
        id: "evt-3",
        title: "History Test",
        start: toIsoAt(2, 10, 30),
        end: toIsoAt(2, 11, 0),
        isAllDay: false,
        sourceName: "Kiddo",
        color: "#f7d8d4"
      },
      {
        id: "evt-4",
        title: "Birthday Party",
        start: toIsoAt(3, 10, 30),
        end: toIsoAt(3, 12, 0),
        isAllDay: false,
        sourceName: "Parent",
        color: "#e4daf0"
      },
      {
        id: "evt-5",
        title: "Grocery Run",
        start: toIsoAt(0, 10, 0),
        end: toIsoAt(0, 11, 30),
        isAllDay: false,
        sourceName: "Parent",
        color: "#bee8ea"
      },
      {
        id: "evt-6",
        title: "Dog's Big Bath Day!",
        start: toIsoAt(1, 11, 0),
        end: toIsoAt(1, 12, 0),
        isAllDay: false,
        sourceName: "Parent, Kiddo",
        color: "#d6efd8"
      },
      {
        id: "evt-7",
        title: "Camping Trip",
        start: toIsoAt(0, 0, 0),
        end: toIsoAt(1, 0, 0),
        isAllDay: true,
        sourceName: "Family",
        color: "#d6efd8"
      },
      {
        id: "evt-8",
        title: "Cousins Visit",
        start: toIsoAt(5, 0, 0),
        end: toIsoAt(7, 0, 0),
        isAllDay: true,
        sourceName: "Family",
        color: "#e4daf0"
      }
    ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return {
      rangeStart: parsed.data.start,
      rangeEnd: parsed.data.end,
      timezone: parsed.data.timezone,
      events: demoEvents,
      sources: [],
      cacheStatus: "refreshed",
      degraded: false,
      warnings: [
        {
          code: "DEMO_CALENDAR_DATA",
          message: "Showing demo calendar data until Google Calendar is connected."
        }
      ]
    };
  });
};
