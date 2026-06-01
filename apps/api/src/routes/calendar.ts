import { calendarSources, connectedAccounts, households, people } from "@skylight-diy/db";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { decryptToken } from "../modules/integrations/token-crypto";

const eventsQuerySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  timezone: z.string().min(1)
});

const patchSourceBodySchema = z.object({
  enabled: z.boolean().optional(),
  personId: z.string().uuid().nullable().optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional()
});

export const calendarRoutes: FastifyPluginAsync = async (app) => {
  app.get("/calendar/accounts", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return { accounts: [] };
    }

    const accounts = await app.db
      .select({
        id: connectedAccounts.id,
        provider: connectedAccounts.provider,
        displayName: connectedAccounts.displayName,
        email: connectedAccounts.email,
        reauthorizationRequired: connectedAccounts.reauthorizationRequired,
        createdAt: connectedAccounts.createdAt
      })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.householdId, household.id))
      .orderBy(asc(connectedAccounts.createdAt));

    return { accounts };
  });

  app.get("/calendar/sources", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return { sources: [] };
    }

    const sources = await app.db
      .select({
        id: calendarSources.id,
        connectedAccountId: calendarSources.connectedAccountId,
        externalCalendarId: calendarSources.externalCalendarId,
        displayName: calendarSources.displayName,
        color: calendarSources.color,
        enabled: calendarSources.enabled,
        personId: calendarSources.personId,
        personName: people.displayName
      })
      .from(calendarSources)
      .leftJoin(people, eq(calendarSources.personId, people.id))
      .where(eq(calendarSources.householdId, household.id))
      .orderBy(asc(calendarSources.sortOrder), asc(calendarSources.createdAt));

    return { sources };
  });

  app.post("/calendar/sources/import-from-google", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    let [account] = await app.db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.householdId, household.id), eq(connectedAccounts.provider, "google")))
      .limit(1);

    if (!account) {
      [account] = await app.db
        .insert(connectedAccounts)
        .values({
          householdId: household.id,
          provider: "google",
          providerAccountId: "demo-google-account",
          displayName: "Demo Google Account",
          email: "demo@local.invalid",
          scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
        })
        .returning();
    }

    const demoSources = [
      {
        externalCalendarId: "family-primary",
        displayName: "Family Calendar",
        color: "#8ec5b8",
        sortOrder: 0
      },
      {
        externalCalendarId: "school-kids",
        displayName: "School Events",
        color: "#dca1b4",
        sortOrder: 1
      },
      {
        externalCalendarId: "activities",
        displayName: "Activities",
        color: "#b7abd8",
        sortOrder: 2
      }
    ];

    const fetchedGoogleSources: Array<{
      externalCalendarId: string;
      displayName: string;
      color: string;
      sortOrder: number;
    }> = [];
    if (account.encryptedAccessToken) {
      try {
        const accessToken = decryptToken(account.encryptedAccessToken);
        const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });
        if (response.ok) {
          const payload = (await response.json()) as {
            items?: Array<{
              id?: string;
              summary?: string;
              backgroundColor?: string;
            }>;
          };
          for (const [index, item] of (payload.items ?? []).entries()) {
            if (!item.id || !item.summary) {
              continue;
            }
            fetchedGoogleSources.push({
              externalCalendarId: item.id,
              displayName: item.summary,
              color: item.backgroundColor ?? demoSources[index % demoSources.length].color,
              sortOrder: index
            });
          }
        }
      } catch {
        // Fall back to demo sources when token decryption/fetch fails.
      }
    }

    const importCandidates = fetchedGoogleSources.length > 0 ? fetchedGoogleSources : demoSources;

    let imported = 0;
    for (const source of importCandidates) {
      const [existing] = await app.db
        .select({ id: calendarSources.id })
        .from(calendarSources)
        .where(
          and(
            eq(calendarSources.connectedAccountId, account.id),
            eq(calendarSources.externalCalendarId, source.externalCalendarId)
          )
        )
        .limit(1);
      if (existing) {
        continue;
      }
      imported += 1;
      await app.db.insert(calendarSources).values({
        householdId: household.id,
        connectedAccountId: account.id,
        provider: "google",
        externalCalendarId: source.externalCalendarId,
        displayName: source.displayName,
        color: source.color,
        enabled: true,
        sortOrder: source.sortOrder
      });
    }

    const sources = await app.db
      .select({
        id: calendarSources.id,
        displayName: calendarSources.displayName,
        color: calendarSources.color,
        enabled: calendarSources.enabled,
        externalCalendarId: calendarSources.externalCalendarId,
        personId: calendarSources.personId
      })
      .from(calendarSources)
      .where(eq(calendarSources.householdId, household.id))
      .orderBy(asc(calendarSources.sortOrder), asc(calendarSources.createdAt));

    return { imported, sources };
  });

  app.patch("/calendar/sources/:sourceId", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    const parsed = patchSourceBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_body",
        details: parsed.error.flatten()
      });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const sourceId = (request.params as { sourceId: string }).sourceId;
    const [source] = await app.db
      .select({ id: calendarSources.id })
      .from(calendarSources)
      .where(and(eq(calendarSources.id, sourceId), eq(calendarSources.householdId, household.id)))
      .limit(1);
    if (!source) {
      return reply.status(404).send({ error: "source_not_found" });
    }

    if (typeof parsed.data.personId !== "undefined" && parsed.data.personId !== null) {
      const [person] = await app.db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, parsed.data.personId), eq(people.householdId, household.id)))
        .limit(1);
      if (!person) {
        return reply.status(400).send({ error: "invalid_person_id" });
      }
    }

    const updatePayload: {
      enabled?: boolean;
      personId?: string | null;
      displayName?: string;
      color?: string | null;
      updatedAt: Date;
    } = {
      updatedAt: new Date()
    };
    if (typeof parsed.data.enabled === "boolean") {
      updatePayload.enabled = parsed.data.enabled;
    }
    if (typeof parsed.data.personId !== "undefined") {
      updatePayload.personId = parsed.data.personId;
    }
    if (typeof parsed.data.displayName === "string") {
      updatePayload.displayName = parsed.data.displayName;
    }
    if (typeof parsed.data.color !== "undefined") {
      updatePayload.color = parsed.data.color;
    }
    const [updated] = await app.db
      .update(calendarSources)
      .set(updatePayload)
      .where(eq(calendarSources.id, sourceId))
      .returning({
        id: calendarSources.id,
        displayName: calendarSources.displayName,
        enabled: calendarSources.enabled,
        personId: calendarSources.personId,
        color: calendarSources.color
      });

    return { updated: true, source: updated };
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

    const [household] = await app.db.select().from(households).limit(1);
    const sources = household
      ? await app.db
          .select({
            id: calendarSources.id,
            displayName: calendarSources.displayName,
            color: calendarSources.color,
            enabled: calendarSources.enabled,
            personId: calendarSources.personId
          })
          .from(calendarSources)
          .where(eq(calendarSources.householdId, household.id))
          .orderBy(asc(calendarSources.sortOrder), asc(calendarSources.createdAt))
      : [];

    return {
      rangeStart: parsed.data.start,
      rangeEnd: parsed.data.end,
      timezone: parsed.data.timezone,
      events: demoEvents,
      sources,
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
