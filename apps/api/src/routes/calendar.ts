import { calendarSources, connectedAccounts, households, people } from "@daymark/db";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../env";
import {
  buildCalendarCacheKey,
  buildSourceFingerprint,
  readCalendarCache,
  writeCalendarCache
} from "../modules/calendar/cache";
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
    if (!account) {
      return reply.status(500).send({ error: "failed_to_initialize_google_account" });
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

    const demoSourceAt = (index: number) => demoSources[index % demoSources.length] ?? demoSources[0]!;

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
              color: item.backgroundColor ?? demoSourceAt(index).color,
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
    if (!household) {
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
            code: "SETUP_NOT_COMPLETED",
            message: "Setup not completed yet."
          }
        ]
      };
    }

    const sourceRows = await app.db
      .select({
        id: calendarSources.id,
        connectedAccountId: calendarSources.connectedAccountId,
        externalCalendarId: calendarSources.externalCalendarId,
        displayName: calendarSources.displayName,
        color: calendarSources.color,
        enabled: calendarSources.enabled,
        personId: calendarSources.personId,
        personName: people.displayName,
        encryptedAccessToken: connectedAccounts.encryptedAccessToken
      })
      .from(calendarSources)
      .leftJoin(people, eq(calendarSources.personId, people.id))
      .leftJoin(connectedAccounts, eq(calendarSources.connectedAccountId, connectedAccounts.id))
      .where(eq(calendarSources.householdId, household.id))
      .orderBy(asc(calendarSources.sortOrder), asc(calendarSources.createdAt));

    const sources = sourceRows.map((source) => ({
      id: source.id,
      connectedAccountId: source.connectedAccountId,
      externalCalendarId: source.externalCalendarId,
      displayName: source.displayName,
      color: source.color,
      enabled: source.enabled,
      personId: source.personId
    }));

    const enabledSources = sourceRows.filter((source) => source.enabled);
    const sourceFingerprint = buildSourceFingerprint(
      sourceRows.map((source) => ({
        id: source.id,
        enabled: source.enabled,
        externalCalendarId: source.externalCalendarId
      }))
    );
    const cacheKey = buildCalendarCacheKey({
      rangeStart: parsed.data.start,
      rangeEnd: parsed.data.end,
      timezone: parsed.data.timezone,
      sourceFingerprint
    });
    const cacheHit = await readCalendarCache(app.db, household.id, cacheKey);
    if (cacheHit.status === "fresh") {
      return {
        rangeStart: parsed.data.start,
        rangeEnd: parsed.data.end,
        timezone: parsed.data.timezone,
        events: cacheHit.payload.events,
        sources: cacheHit.payload.sources,
        cacheStatus: "fresh",
        degraded: cacheHit.payload.warnings.length > 0,
        warnings: cacheHit.payload.warnings
      };
    }

    const warnings: Array<{ code: string; message: string; sourceId?: string }> = [];
    const staleCachePayload = cacheHit.status === "stale" ? cacheHit.payload : null;
    const googleEvents: Array<{
      id: string;
      title: string;
      start: string;
      end: string;
      isAllDay: boolean;
      sourceName: string;
      color: string | null;
    }> = [];

    for (const source of enabledSources) {
      if (!source.encryptedAccessToken) {
        warnings.push({
          code: "SOURCE_MISSING_TOKEN",
          message: `Source "${source.displayName}" is missing an access token.`,
          sourceId: source.id
        });
        continue;
      }

      let accessToken = "";
      try {
        accessToken = decryptToken(source.encryptedAccessToken);
      } catch {
        warnings.push({
          code: "SOURCE_TOKEN_DECRYPT_FAILED",
          message: `Could not decrypt token for "${source.displayName}".`,
          sourceId: source.id
        });
        continue;
      }

      try {
        const eventsUrl = new URL(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.externalCalendarId)}/events`
        );
        eventsUrl.searchParams.set("singleEvents", "true");
        eventsUrl.searchParams.set("orderBy", "startTime");
        eventsUrl.searchParams.set("timeMin", parsed.data.start);
        eventsUrl.searchParams.set("timeMax", parsed.data.end);

        const providerResponse = await fetch(eventsUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });

        if (!providerResponse.ok) {
          warnings.push({
            code: "SOURCE_FETCH_FAILED",
            message: `Failed to fetch events for "${source.displayName}".`,
            sourceId: source.id
          });
          continue;
        }

        const payload = (await providerResponse.json()) as {
          items?: Array<{
            id?: string;
            summary?: string;
            start?: { date?: string; dateTime?: string };
            end?: { date?: string; dateTime?: string };
          }>;
        };

        for (const item of payload.items ?? []) {
          const start = item.start?.dateTime ?? item.start?.date;
          const end = item.end?.dateTime ?? item.end?.date;
          if (!start || !end) {
            continue;
          }
          const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
          googleEvents.push({
            id: `${source.id}:${item.id ?? start}`,
            title: item.summary || "Untitled event",
            start,
            end,
            isAllDay,
            sourceName: source.personName || source.displayName,
            color: source.color
          });
        }
      } catch {
        warnings.push({
          code: "SOURCE_REQUEST_ERROR",
          message: `Unexpected error while fetching "${source.displayName}".`,
          sourceId: source.id
        });
      }
    }

    if (googleEvents.length > 0) {
      googleEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      const payload = {
        rangeStart: parsed.data.start,
        rangeEnd: parsed.data.end,
        timezone: parsed.data.timezone,
        events: googleEvents,
        sources,
        warnings
      };
      await writeCalendarCache(app.db, {
        householdId: household.id,
        cacheKey,
        rangeStart: parsed.data.start,
        rangeEnd: parsed.data.end,
        timezone: parsed.data.timezone,
        sourceFingerprint,
        payload,
        freshTtlSeconds: env.CALENDAR_CACHE_FRESH_TTL_SECONDS,
        staleTtlSeconds: env.CALENDAR_CACHE_STALE_TTL_SECONDS
      });
      return {
        rangeStart: parsed.data.start,
        rangeEnd: parsed.data.end,
        timezone: parsed.data.timezone,
        events: googleEvents,
        sources,
        cacheStatus: "refreshed",
        degraded: warnings.length > 0,
        warnings
      };
    }

    if (staleCachePayload) {
      return {
        rangeStart: parsed.data.start,
        rangeEnd: parsed.data.end,
        timezone: parsed.data.timezone,
        events: staleCachePayload.events,
        sources: staleCachePayload.sources,
        cacheStatus: "stale",
        degraded: true,
        warnings: [...staleCachePayload.warnings, ...warnings]
      };
    }

    if (enabledSources.length === 0) {
      warnings.push({
        code: "NO_ENABLED_SOURCES",
        message: "No enabled calendar sources yet."
      });
    } else {
      warnings.push({
        code: "DEMO_CALENDAR_FALLBACK",
        message: "Using demo calendar events while Google source fetch is unavailable."
      });
    }

    return {
      rangeStart: parsed.data.start,
      rangeEnd: parsed.data.end,
      timezone: parsed.data.timezone,
      events: demoEvents,
      sources,
      cacheStatus: "miss",
      degraded: true,
      warnings
    };
  });
};
