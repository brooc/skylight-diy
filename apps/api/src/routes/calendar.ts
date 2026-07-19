import {
  calendarEventCache,
  calendarFetchLogs,
  calendarSources,
  connectedAccounts,
  households,
  people
} from "@daymark/db";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../env";
import {
  buildCalendarCacheKey,
  buildSourceFingerprint,
  readCalendarCache,
  writeCalendarCache
} from "../modules/calendar/cache";
import { decryptToken, encryptToken } from "../modules/integrations/token-crypto";
import {
  mergeSharedEvents,
  type SourceCalendarEvent
} from "../modules/calendar/merge-shared-events";

const eventsQuerySchema = z
  .object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    timezone: z.string().min(1).refine((timezone) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
        return true;
      } catch {
        return false;
      }
    }, "Invalid IANA timezone."),
    refresh: z.enum(["true", "false"]).optional().transform((value) => value === "true")
  })
  .refine((query) => new Date(query.end).getTime() > new Date(query.start).getTime(), {
    message: "End must be after start.",
    path: ["end"]
  });

const patchSourceBodySchema = z.object({
  enabled: z.boolean().optional(),
  personId: z.string().uuid().nullable().optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional()
});

const importSourcesBodySchema = z.object({
  externalCalendarIds: z.array(z.string().min(1)).max(250)
});

type GoogleCalendarCandidate = {
  externalCalendarId: string;
  displayName: string;
  color: string;
  sortOrder: number;
};

type GoogleCalendarLoadResult =
  | { ok: true; calendars: GoogleCalendarCandidate[] }
  | {
      ok: false;
      statusCode: 400 | 502;
      body: {
        error: string;
        message: string;
        statusCode?: number;
        details?: string;
      };
    };

type GoogleEventItem = {
  id?: string;
  iCalUID?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

type GoogleEventLoadResult =
  | { ok: true; items: GoogleEventItem[] }
  | { ok: false; statusCode: number };

type GoogleTokenAccount = {
  id: string;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  scopes: string[];
};

type GoogleAccessTokenResult =
  | { ok: true; accessToken: string; refreshed: boolean }
  | { ok: false; error: string; message: string; reauthorizationRequired: boolean };

const GOOGLE_TOKEN_REFRESH_MARGIN_MS = 60_000;

async function requireGoogleAccessToken(
  app: FastifyInstance,
  account: GoogleTokenAccount
): Promise<GoogleAccessTokenResult> {
  const tokenIsFresh =
    !account.accessTokenExpiresAt ||
    account.accessTokenExpiresAt.getTime() > Date.now() + GOOGLE_TOKEN_REFRESH_MARGIN_MS;
  if (account.encryptedAccessToken && tokenIsFresh) {
    try {
      return {
        ok: true,
        accessToken: decryptToken(account.encryptedAccessToken),
        refreshed: false
      };
    } catch {
      // A usable refresh token can still recover a malformed access token.
    }
  }

  const markReauthorizationRequired = async (): Promise<void> => {
    await app.db
      .update(connectedAccounts)
      .set({ reauthorizationRequired: true, updatedAt: new Date() })
      .where(eq(connectedAccounts.id, account.id));
  };
  if (!account.encryptedRefreshToken || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    await markReauthorizationRequired();
    return {
      ok: false,
      error: "google_reauthorization_required",
      message: "Reconnect Google Calendar to continue syncing.",
      reauthorizationRequired: true
    };
  }

  let refreshToken = "";
  try {
    refreshToken = decryptToken(account.encryptedRefreshToken);
  } catch {
    await markReauthorizationRequired();
    return {
      ok: false,
      error: "google_refresh_token_decrypt_failed",
      message: "Stored Google refresh credentials are unreadable. Reconnect Google Calendar.",
      reauthorizationRequired: true
    };
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });
    if (!response.ok) {
      await markReauthorizationRequired();
      return {
        ok: false,
        error: "google_token_refresh_failed",
        message: "Google authorization expired or was revoked. Reconnect Google Calendar.",
        reauthorizationRequired: true
      };
    }

    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!payload.access_token) {
      await markReauthorizationRequired();
      return {
        ok: false,
        error: "google_token_refresh_failed",
        message: "Google did not return a refreshed access token. Reconnect Google Calendar.",
        reauthorizationRequired: true
      };
    }

    const expiresAt = typeof payload.expires_in === "number"
      ? new Date(Date.now() + payload.expires_in * 1000)
      : null;
    const refreshedScopes = payload.scope?.split(/\s+/).filter(Boolean);
    await app.db
      .update(connectedAccounts)
      .set({
        encryptedAccessToken: encryptToken(payload.access_token),
        accessTokenExpiresAt: expiresAt,
        scopes: refreshedScopes?.length ? refreshedScopes : account.scopes,
        reauthorizationRequired: false,
        updatedAt: new Date()
      })
      .where(eq(connectedAccounts.id, account.id));
    return { ok: true, accessToken: payload.access_token, refreshed: true };
  } catch {
    return {
      ok: false,
      error: "google_token_refresh_request_failed",
      message: "Google token refresh could not be reached. Daymark will retry later.",
      reauthorizationRequired: false
    };
  }
}

async function loadGoogleCalendars(accessToken: string): Promise<GoogleCalendarLoadResult> {
  try {
    const fallbackColors = ["#8ec5b8", "#dca1b4", "#b7abd8"] as const;
    const calendars: GoogleCalendarCandidate[] = [];
    const seenPageTokens = new Set<string>();
    let pageToken: string | undefined;

    do {
      const calendarsUrl = new URL(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList"
      );
      if (pageToken) calendarsUrl.searchParams.set("pageToken", pageToken);
      const response = await fetch(calendarsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) {
        return {
          ok: false,
          statusCode: 502,
          body: {
            error: "google_calendar_list_failed",
            message: "Failed to load calendars from Google.",
            statusCode: response.status,
            details: await response.text()
          }
        };
      }

      const payload = (await response.json()) as {
        items?: Array<{ id?: string; summary?: string; backgroundColor?: string }>;
        nextPageToken?: string;
      };
      for (const item of payload.items ?? []) {
        if (!item.id || !item.summary) continue;
        const index = calendars.length;
        calendars.push({
          externalCalendarId: item.id,
          displayName: item.summary,
          color: item.backgroundColor ?? fallbackColors[index % fallbackColors.length]!,
          sortOrder: index
        });
      }

      pageToken = payload.nextPageToken;
      if (pageToken && seenPageTokens.has(pageToken)) {
        throw new Error("Google Calendar returned a repeated calendar-list page token.");
      }
      if (pageToken) seenPageTokens.add(pageToken);
    } while (pageToken);

    return { ok: true, calendars };
  } catch {
    return {
      ok: false,
      statusCode: 502,
      body: {
        error: "google_calendar_list_request_failed",
        message: "Unexpected error while loading calendars from Google."
      }
    };
  }
}

async function loadGoogleEvents(input: {
  accessToken: string;
  externalCalendarId: string;
  start: string;
  end: string;
  timezone: string;
}): Promise<GoogleEventLoadResult> {
  const items: GoogleEventItem[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken: string | undefined;

  do {
    const eventsUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.externalCalendarId)}/events`
    );
    eventsUrl.searchParams.set("singleEvents", "true");
    eventsUrl.searchParams.set("orderBy", "startTime");
    eventsUrl.searchParams.set("timeMin", input.start);
    eventsUrl.searchParams.set("timeMax", input.end);
    eventsUrl.searchParams.set("timeZone", input.timezone);
    if (pageToken) eventsUrl.searchParams.set("pageToken", pageToken);

    const response = await fetch(eventsUrl, {
      headers: { Authorization: `Bearer ${input.accessToken}` }
    });
    if (!response.ok) return { ok: false, statusCode: response.status };

    const payload = (await response.json()) as {
      items?: GoogleEventItem[];
      nextPageToken?: string;
    };
    items.push(...(payload.items ?? []));
    pageToken = payload.nextPageToken;
    if (pageToken && seenPageTokens.has(pageToken)) {
      throw new Error("Google Calendar returned a repeated event page token.");
    }
    if (pageToken) seenPageTokens.add(pageToken);
  } while (pageToken);

  return { ok: true, items };
}

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
        scopes: connectedAccounts.scopes,
        reauthorizationRequired: connectedAccounts.reauthorizationRequired,
        createdAt: connectedAccounts.createdAt
      })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.householdId, household.id))
      .orderBy(asc(connectedAccounts.createdAt));

    return {
      accounts: accounts.map((account) => ({
        ...account,
        calendarAccessGranted: account.scopes.includes(
          "https://www.googleapis.com/auth/calendar.readonly"
        )
      }))
    };
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

  app.post("/calendar/sources/discover-from-google", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const [account] = await app.db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.householdId, household.id), eq(connectedAccounts.provider, "google")))
      .limit(1);

    if (!account) {
      return reply.status(409).send({
        error: "google_account_not_connected",
        message: "Connect Google Calendar before importing calendars."
      });
    }
    if (!account.encryptedAccessToken && !account.encryptedRefreshToken) {
      return reply.status(409).send({
        error: "google_account_not_connected",
        message: "Reconnect Google Calendar before importing calendars."
      });
    }

    const token = await requireGoogleAccessToken(app, account);
    if (!token.ok) {
      return reply
        .status(token.reauthorizationRequired ? 409 : 502)
        .send({ error: token.error, message: token.message });
    }
    const loaded = await loadGoogleCalendars(token.accessToken);
    if (!loaded.ok) {
      if (loaded.body.statusCode === 401) {
        await app.db
          .update(connectedAccounts)
          .set({ reauthorizationRequired: true, updatedAt: new Date() })
          .where(eq(connectedAccounts.id, account.id));
      }
      return reply.status(loaded.statusCode).send(loaded.body);
    }

    const trackedSources = await app.db
      .select({
        id: calendarSources.id,
        externalCalendarId: calendarSources.externalCalendarId,
        enabled: calendarSources.enabled
      })
      .from(calendarSources)
      .where(eq(calendarSources.connectedAccountId, account.id));
    const trackedByExternalId = new Map(
      trackedSources.map((source) => [source.externalCalendarId, source])
    );

    return {
      calendars: loaded.calendars.map((calendar) => {
        const trackedSource = trackedByExternalId.get(calendar.externalCalendarId);
        return {
          ...calendar,
          tracked: Boolean(trackedSource),
          sourceId: trackedSource?.id ?? null,
          enabled: trackedSource?.enabled ?? false
        };
      })
    };
  });

  app.post("/calendar/sources/import-from-google", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    const parsed = importSourcesBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const [account] = await app.db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.householdId, household.id), eq(connectedAccounts.provider, "google")))
      .limit(1);
    if (!account || (!account.encryptedAccessToken && !account.encryptedRefreshToken)) {
      return reply.status(409).send({
        error: "google_account_not_connected",
        message: "Connect or reconnect Google Calendar before adding calendars."
      });
    }

    const token = await requireGoogleAccessToken(app, account);
    if (!token.ok) {
      return reply
        .status(token.reauthorizationRequired ? 409 : 502)
        .send({ error: token.error, message: token.message });
    }
    const loaded = await loadGoogleCalendars(token.accessToken);
    if (!loaded.ok) {
      if (loaded.body.statusCode === 401) {
        await app.db
          .update(connectedAccounts)
          .set({ reauthorizationRequired: true, updatedAt: new Date() })
          .where(eq(connectedAccounts.id, account.id));
      }
      return reply.status(loaded.statusCode).send(loaded.body);
    }
    const selectedIds = new Set(parsed.data.externalCalendarIds);
    const importCandidates = loaded.calendars.filter((calendar) => selectedIds.has(calendar.externalCalendarId));

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

  app.delete("/calendar/sources/:sourceId", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const sourceId = (request.params as { sourceId: string }).sourceId;
    const [deleted] = await app.db
      .delete(calendarSources)
      .where(and(eq(calendarSources.id, sourceId), eq(calendarSources.householdId, household.id)))
      .returning({ id: calendarSources.id });
    if (!deleted) {
      return reply.status(404).send({ error: "source_not_found" });
    }

    await app.db
      .delete(calendarEventCache)
      .where(eq(calendarEventCache.householdId, household.id));

    return { untracked: true, sourceId: deleted.id };
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
        encryptedAccessToken: connectedAccounts.encryptedAccessToken,
        encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
        accessTokenExpiresAt: connectedAccounts.accessTokenExpiresAt,
        accountScopes: connectedAccounts.scopes
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
        externalCalendarId: source.externalCalendarId,
        displayName: source.displayName,
        color: source.color,
        personId: source.personId,
        personName: source.personName
      }))
    );
    const cacheKey = buildCalendarCacheKey({
      rangeStart: parsed.data.start,
      rangeEnd: parsed.data.end,
      timezone: parsed.data.timezone,
      sourceFingerprint
    });
    const cacheHit = await readCalendarCache(app.db, household.id, cacheKey);
    if (cacheHit.status === "fresh" && !parsed.data.refresh) {
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
    const fallbackCachePayload = cacheHit.status === "miss" ? null : cacheHit.payload;
    const sourceEvents: SourceCalendarEvent[] = [];
    let successfulProviderFetches = 0;
    const accountTokens = new Map<string, GoogleAccessTokenResult>();

    const logFetch = async (
      sourceId: string,
      status: "success" | "skipped" | "error",
      errorMessage?: string
    ): Promise<void> => {
      await app.db.insert(calendarFetchLogs).values({
        householdId: household.id,
        calendarSourceId: sourceId,
        rangeStart: rangeStart,
        rangeEnd: new Date(parsed.data.end),
        status,
        errorMessage
      });
    };

    for (const source of enabledSources) {
      if (!source.encryptedAccessToken && !source.encryptedRefreshToken) {
        await logFetch(source.id, "skipped", "Source is missing an access token.");
        warnings.push({
          code: "SOURCE_MISSING_TOKEN",
          message: `Source "${source.displayName}" is missing an access token.`,
          sourceId: source.id
        });
        continue;
      }

      let token = accountTokens.get(source.connectedAccountId);
      if (!token) {
        token = await requireGoogleAccessToken(app, {
          id: source.connectedAccountId,
          encryptedAccessToken: source.encryptedAccessToken,
          encryptedRefreshToken: source.encryptedRefreshToken,
          accessTokenExpiresAt: source.accessTokenExpiresAt,
          scopes: source.accountScopes ?? []
        });
        accountTokens.set(source.connectedAccountId, token);
      }
      if (!token.ok) {
        await logFetch(source.id, "error", token.message);
        warnings.push({
          code: token.reauthorizationRequired
            ? "SOURCE_REAUTHORIZATION_REQUIRED"
            : "SOURCE_TOKEN_REFRESH_FAILED",
          message: `${token.message} Source: "${source.displayName}".`,
          sourceId: source.id
        });
        continue;
      }
      const accessToken = token.accessToken;

      try {
        const providerResult = await loadGoogleEvents({
          accessToken,
          externalCalendarId: source.externalCalendarId,
          start: parsed.data.start,
          end: parsed.data.end,
          timezone: parsed.data.timezone
        });
        if (!providerResult.ok) {
          if (providerResult.statusCode === 401) {
            await app.db
              .update(connectedAccounts)
              .set({ reauthorizationRequired: true, updatedAt: new Date() })
              .where(eq(connectedAccounts.id, source.connectedAccountId));
          }
          await logFetch(
            source.id,
            "error",
            `Google Calendar returned ${providerResult.statusCode}.`
          );
          warnings.push({
            code: "SOURCE_FETCH_FAILED",
            message: `Failed to fetch events for "${source.displayName}".`,
            sourceId: source.id
          });
          continue;
        }

        successfulProviderFetches += 1;
        await logFetch(source.id, "success");

        for (const item of providerResult.items) {
          if (item.status === "cancelled") {
            continue;
          }
          const start = item.start?.dateTime ?? item.start?.date;
          const end = item.end?.dateTime ?? item.end?.date;
          if (!start || !end) {
            continue;
          }
          const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
          sourceEvents.push({
            id: `${source.id}:${item.id ?? start}`,
            iCalUID: item.iCalUID,
            sourceId: source.id,
            title: item.summary || "Untitled event",
            description: item.description,
            location: item.location,
            start,
            end,
            isAllDay,
            sourceName: source.personName || source.displayName,
            color: source.color
          });
        }
      } catch {
        await logFetch(source.id, "error", "Unexpected error while fetching events from Google.");
        warnings.push({
          code: "SOURCE_REQUEST_ERROR",
          message: `Unexpected error while fetching "${source.displayName}".`,
          sourceId: source.id
        });
      }
    }

    if (successfulProviderFetches > 0) {
      const googleEvents = mergeSharedEvents(sourceEvents);
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

    if (fallbackCachePayload) {
      return {
        rangeStart: parsed.data.start,
        rangeEnd: parsed.data.end,
        timezone: parsed.data.timezone,
        events: fallbackCachePayload.events,
        sources: fallbackCachePayload.sources,
        cacheStatus: "stale",
        degraded: true,
        warnings: [...fallbackCachePayload.warnings, ...warnings]
      };
    }

    if (enabledSources.length === 0) {
      warnings.push({
        code: "NO_ENABLED_SOURCES",
        message: "No enabled calendar sources yet."
      });
    } else {
      warnings.push({
        code: "NO_CALENDAR_DATA",
        message: "Calendar events are unavailable and no saved data is available yet."
      });
    }

    return {
      rangeStart: parsed.data.start,
      rangeEnd: parsed.data.end,
      timezone: parsed.data.timezone,
      events: [],
      sources,
      cacheStatus: "miss",
      degraded: true,
      warnings
    };
  });
};
