import {
  calendarEventCache,
  calendarSources,
  connectedAccounts,
  households,
  people
} from "@skylight-diy/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/env";
import {
  buildCalendarCacheKey,
  buildSourceFingerprint
} from "../src/modules/calendar/cache";
import { encryptToken } from "../src/modules/integrations/token-crypto";
import {
  buildCookieHeader,
  createTestApp,
  resetTestDb,
  setupHousehold,
  unlockAdmin
} from "./helpers/test-app";

const missingUuid = "00000000-0000-0000-0000-000000000000";

describe("calendar and google integration routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetTestDb(app);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns demo events with degraded warning when no sources are enabled", async () => {
    await setupHousehold(app);
    const start = new Date().toISOString();
    const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const response = await app.inject({
      method: "GET",
      url: `/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=${encodeURIComponent("America/Los_Angeles")}`
    });
    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.degraded).toBe(true);
    expect(json.events.length).toBeGreaterThan(0);
    expect(json.warnings.some((warning: { code: string }) => warning.code === "NO_ENABLED_SOURCES")).toBe(
      true
    );
  });

  it("returns setup warning before setup and validates calendar query parameters", async () => {
    const invalid = await app.inject({
      method: "GET",
      url: "/api/calendar/events?start=nope&end=nope&timezone="
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toBe("invalid_calendar_query");

    const start = new Date("2026-06-01T00:00:00.000Z").toISOString();
    const end = new Date("2026-06-08T00:00:00.000Z").toISOString();
    const response = await app.inject({
      method: "GET",
      url: `/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=UTC`
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().events).toHaveLength(0);
    expect(response.json().warnings[0].code).toBe("SETUP_NOT_COMPLETED");
  });

  it("returns empty calendar accounts and sources before setup", async () => {
    const accounts = await app.inject({
      method: "GET",
      url: "/api/calendar/accounts"
    });
    expect(accounts.statusCode).toBe(200);
    expect(accounts.json()).toEqual({ accounts: [] });

    const sources = await app.inject({
      method: "GET",
      url: "/api/calendar/sources"
    });
    expect(sources.statusCode).toBe(200);
    expect(sources.json()).toEqual({ sources: [] });
  });

  it("reports oauth status and blocks connect when oauth env is not configured", async () => {
    await setupHousehold(app);
    const status = await app.inject({
      method: "GET",
      url: "/api/integrations/google/status"
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().available).toBe(false);

    const connect = await app.inject({
      method: "GET",
      url: "/api/integrations/google/connect"
    });
    expect(connect.statusCode).toBe(401);

    const { cookie } = await unlockAdmin(app);
    const connectUnlocked = await app.inject({
      method: "GET",
      url: "/api/integrations/google/connect",
      headers: { cookie }
    });
    expect(connectUnlocked.statusCode).toBe(400);
  });

  it("builds a Google OAuth authorization URL when configured and unlocked", async () => {
    await setupHousehold(app);
    const originalGoogleEnv = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI
    };
    env.GOOGLE_CLIENT_ID = "client-id";
    env.GOOGLE_CLIENT_SECRET = "client-secret";
    env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/integrations/google/callback";

    try {
      const { cookie } = await unlockAdmin(app);
      const response = await app.inject({
        method: "GET",
        url: "/api/integrations/google/connect",
        headers: { cookie }
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().available).toBe(true);
      const authUrl = new URL(response.json().authUrl);
      expect(authUrl.origin).toBe("https://accounts.google.com");
      expect(authUrl.searchParams.get("client_id")).toBe("client-id");
      expect(authUrl.searchParams.get("scope")).toBe(
        "https://www.googleapis.com/auth/calendar.readonly"
      );
      expect(authUrl.searchParams.get("state")).toBeTruthy();
      expect(buildCookieHeader(response)).toContain("skylight_google_oauth_state=");
    } finally {
      env.GOOGLE_CLIENT_ID = originalGoogleEnv.clientId;
      env.GOOGLE_CLIENT_SECRET = originalGoogleEnv.clientSecret;
      env.GOOGLE_REDIRECT_URI = originalGoogleEnv.redirectUri;
    }
  });

  it("rejects Google OAuth callbacks without a matching state cookie", async () => {
    const missingState = await app.inject({
      method: "GET",
      url: "/api/integrations/google/callback?code=auth-code&state=missing"
    });
    expect(missingState.statusCode).toBe(400);
    expect(missingState.json().error).toBe("invalid_oauth_state");

    const mismatchedState = await app.inject({
      method: "GET",
      url: "/api/integrations/google/callback?code=auth-code&state=query-state",
      headers: { cookie: "skylight_google_oauth_state=cookie-state" }
    });
    expect(mismatchedState.statusCode).toBe(400);
    expect(mismatchedState.json().error).toBe("invalid_oauth_state");
  });

  it("handles Google OAuth provider errors and missing codes after state validation", async () => {
    const providerError = await app.inject({
      method: "GET",
      url: "/api/integrations/google/callback?error=access_denied&state=state-value",
      headers: { cookie: "skylight_google_oauth_state=state-value" }
    });
    expect(providerError.statusCode).toBe(400);
    expect(providerError.json()).toEqual({
      connected: false,
      error: "access_denied",
      message: "Google OAuth was not completed."
    });

    const missingCode = await app.inject({
      method: "GET",
      url: "/api/integrations/google/callback?state=state-value",
      headers: { cookie: "skylight_google_oauth_state=state-value" }
    });
    expect(missingCode.statusCode).toBe(400);
    expect(missingCode.json().error).toBe("missing_oauth_code");
  });

  it("requires OAuth configuration before exchanging a validated callback code", async () => {
    const callback = await app.inject({
      method: "GET",
      url: "/api/integrations/google/callback?code=auth-code&state=state-value",
      headers: { cookie: "skylight_google_oauth_state=state-value" }
    });
    expect(callback.statusCode).toBe(400);
    expect(callback.json().error).toBe("oauth_not_configured");
  });

  it("reports token exchange failures from Google OAuth", async () => {
    await withGoogleOauthConfig(async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("invalid_grant", {
          status: 400
        })
      );

      const callback = await app.inject({
        method: "GET",
        url: "/api/integrations/google/callback?code=auth-code&state=state-value",
        headers: { cookie: "skylight_google_oauth_state=state-value" }
      });
      expect(callback.statusCode).toBe(400);
      expect(callback.json()).toEqual({
        connected: false,
        error: "token_exchange_failed",
        details: "invalid_grant"
      });
    });
  });

  it("rejects OAuth token responses without an access token", async () => {
    await withGoogleOauthConfig(async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ scope: "https://www.googleapis.com/auth/calendar.readonly" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      const callback = await app.inject({
        method: "GET",
        url: "/api/integrations/google/callback?code=auth-code&state=state-value",
        headers: { cookie: "skylight_google_oauth_state=state-value" }
      });
      expect(callback.statusCode).toBe(400);
      expect(callback.json().error).toBe("missing_access_token");
    });
  });

  it("requires setup before persisting a valid OAuth token response", async () => {
    await withGoogleOauthConfig(async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      const callback = await app.inject({
        method: "GET",
        url: "/api/integrations/google/callback?code=auth-code&state=state-value",
        headers: { cookie: "skylight_google_oauth_state=state-value" }
      });
      expect(callback.statusCode).toBe(404);
      expect(callback.json().error).toBe("setup_not_completed");
    });
  });

  it("persists Google OAuth tokens for new and existing accounts", async () => {
    const setup = await setupHousehold(app);
    await withGoogleOauthConfig(async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "access-token-1",
            refresh_token: "refresh-token-1",
            expires_in: 3600,
            scope: "scope-a scope-b"
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      );

      const created = await app.inject({
        method: "GET",
        url: "/api/integrations/google/callback?code=auth-code&state=state-value",
        headers: { cookie: "skylight_google_oauth_state=state-value" }
      });
      expect(created.statusCode).toBe(302);
      expect(created.headers.location).toBe(`${env.APP_BASE_URL.replace(/\/$/, "")}/settings`);

      const [account] = await app.db
        .select()
        .from(connectedAccounts)
        .where(eq(connectedAccounts.householdId, setup.household.id))
        .limit(1);
      expect(account).toMatchObject({
        provider: "google",
        providerAccountId: "google-primary",
        displayName: "Google Calendar",
        scopes: ["scope-a", "scope-b"],
        reauthorizationRequired: false
      });

      await app.db
        .update(connectedAccounts)
        .set({ encryptedRefreshToken: "malformed-refresh-token" })
        .where(eq(connectedAccounts.id, account.id));
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ access_token: "access-token-2" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      const updated = await app.inject({
        method: "GET",
        url: "/api/integrations/google/callback?code=auth-code&state=state-value",
        headers: { cookie: "skylight_google_oauth_state=state-value" }
      });
      expect(updated.statusCode).toBe(302);

      const [updatedAccount] = await app.db
        .select()
        .from(connectedAccounts)
        .where(eq(connectedAccounts.id, account.id))
        .limit(1);
      expect(updatedAccount.scopes).toEqual(["https://www.googleapis.com/auth/calendar.readonly"]);
      expect(updatedAccount.encryptedRefreshToken).toBe("malformed-refresh-token");
    });
  });

  it("imports demo sources for unlocked admin users", async () => {
    await setupHousehold(app);

    const blocked = await app.inject({
      method: "POST",
      url: "/api/calendar/sources/import-from-google"
    });
    expect(blocked.statusCode).toBe(401);

    const { cookie } = await unlockAdmin(app);
    const imported = await app.inject({
      method: "POST",
      url: "/api/calendar/sources/import-from-google",
      headers: { cookie }
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().sources.length).toBeGreaterThan(0);

    const repeated = await app.inject({
      method: "POST",
      url: "/api/calendar/sources/import-from-google",
      headers: { cookie }
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().imported).toBe(0);
  });

  it("falls back to demo events when imported sources have no access token", async () => {
    await setupHousehold(app);
    const { cookie } = await unlockAdmin(app);
    const imported = await app.inject({
      method: "POST",
      url: "/api/calendar/sources/import-from-google",
      headers: { cookie }
    });
    expect(imported.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: calendarEventsUrl()
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().events.length).toBeGreaterThan(0);
    expect(response.json().warnings.map((warning: { code: string }) => warning.code)).toEqual(
      expect.arrayContaining(["SOURCE_MISSING_TOKEN", "DEMO_CALENDAR_FALLBACK"])
    );
  });

  it("falls back to demo events when a source token cannot be decrypted", async () => {
    const setup = await setupHousehold(app);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "google-1",
        displayName: "Google",
        encryptedAccessToken: "not-an-encrypted-token",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
      })
      .returning();

    await app.db.insert(calendarSources).values({
      householdId: setup.household.id,
      connectedAccountId: account.id,
      provider: "google",
      externalCalendarId: "family",
      displayName: "Family",
      color: "#8ec5b8",
      enabled: true,
      sortOrder: 0
    });

    const response = await app.inject({
      method: "GET",
      url: calendarEventsUrl()
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().warnings.map((warning: { code: string }) => warning.code)).toEqual(
      expect.arrayContaining(["SOURCE_TOKEN_DECRYPT_FAILED", "DEMO_CALENDAR_FALLBACK"])
    );
  });

  it("serves stale cached events when provider data cannot be refreshed", async () => {
    const setup = await setupHousehold(app);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "google-1",
        displayName: "Google",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
      })
      .returning();
    const [source] = await app.db
      .insert(calendarSources)
      .values({
        householdId: setup.household.id,
        connectedAccountId: account.id,
        provider: "google",
        externalCalendarId: "family",
        displayName: "Family",
        color: "#8ec5b8",
        enabled: true,
        sortOrder: 0
      })
      .returning();
    const start = "2026-06-01T00:00:00.000Z";
    const end = "2026-06-08T00:00:00.000Z";
    const timezone = "UTC";
    const sourceFingerprint = buildSourceFingerprint([
      { id: source.id, enabled: true, externalCalendarId: "family" }
    ]);
    const cacheKey = buildCalendarCacheKey({
      rangeStart: start,
      rangeEnd: end,
      timezone,
      sourceFingerprint
    });
    const now = new Date();
    await app.db.insert(calendarEventCache).values({
      householdId: setup.household.id,
      cacheKey,
      rangeStart: new Date(start),
      rangeEnd: new Date(end),
      timezone,
      sourceFingerprint,
      payloadJsonb: {
        rangeStart: start,
        rangeEnd: end,
        timezone,
        events: [
          {
            id: "cached-1",
            title: "Cached appointment",
            start: "2026-06-02T16:00:00.000Z",
            end: "2026-06-02T17:00:00.000Z",
            isAllDay: false,
            sourceName: "Family",
            color: "#8ec5b8"
          }
        ],
        sources: [
          {
            id: source.id,
            connectedAccountId: account.id,
            externalCalendarId: "family",
            displayName: "Family",
            color: "#8ec5b8",
            enabled: true,
            personId: null
          }
        ],
        warnings: [{ code: "OLD_WARNING", message: "Old warning." }]
      },
      fetchedAt: new Date(now.getTime() - 10_000),
      expiresAt: new Date(now.getTime() - 1_000),
      staleUntil: new Date(now.getTime() + 60_000)
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=${timezone}`
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      cacheStatus: "stale",
      degraded: true
    });
    expect(response.json().events[0].title).toBe("Cached appointment");
    expect(response.json().warnings.map((warning: { code: string }) => warning.code)).toEqual(
      ["OLD_WARNING", "SOURCE_MISSING_TOKEN"]
    );
  });

  it("imports Google calendar-list sources when an access token is available", async () => {
    const setup = await setupHousehold(app);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "google-1",
        displayName: "Google",
        encryptedAccessToken: encryptToken("token-value"),
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
      })
      .returning();
    expect(account.id).toBeTruthy();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            { id: "primary", summary: "Family", backgroundColor: "#8ec5b8" },
            { id: "school", summary: "School" },
            { summary: "Ignored missing id" }
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    const { cookie } = await unlockAdmin(app);
    const imported = await app.inject({
      method: "POST",
      url: "/api/calendar/sources/import-from-google",
      headers: { cookie }
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().imported).toBe(2);
    expect(imported.json().sources.map((source: { displayName: string }) => source.displayName)).toEqual([
      "Family",
      "School"
    ]);
  });

  it("patches calendar source settings and validates assigned people", async () => {
    const setup = await setupHousehold(app);
    const [kiddo] = await app.db
      .select()
      .from(people)
      .where(eq(people.householdId, setup.household.id))
      .limit(1);
    expect(kiddo.id).toBeTruthy();
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "google-1",
        displayName: "Google",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
      })
      .returning();
    const [source] = await app.db
      .insert(calendarSources)
      .values({
        householdId: setup.household.id,
        connectedAccountId: account.id,
        provider: "google",
        externalCalendarId: "calendar-1",
        displayName: "Family",
        color: "#8ec5b8",
        enabled: true,
        sortOrder: 0
      })
      .returning();

    const blocked = await app.inject({
      method: "PATCH",
      url: `/api/calendar/sources/${source.id}`,
      payload: { displayName: "Blocked" }
    });
    expect(blocked.statusCode).toBe(401);

    const { cookie } = await unlockAdmin(app);
    const invalidBody = await app.inject({
      method: "PATCH",
      url: `/api/calendar/sources/${source.id}`,
      headers: { cookie },
      payload: { enabled: "yes" }
    });
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.json().error).toBe("invalid_body");

    const missingSource = await app.inject({
      method: "PATCH",
      url: `/api/calendar/sources/${missingUuid}`,
      headers: { cookie },
      payload: { displayName: "Missing source" }
    });
    expect(missingSource.statusCode).toBe(404);
    expect(missingSource.json().error).toBe("source_not_found");

    const invalidPerson = await app.inject({
      method: "PATCH",
      url: `/api/calendar/sources/${source.id}`,
      headers: { cookie },
      payload: { personId: "00000000-0000-0000-0000-000000000000" }
    });
    expect(invalidPerson.statusCode).toBe(400);
    expect(invalidPerson.json().error).toBe("invalid_person_id");

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/calendar/sources/${source.id}`,
      headers: { cookie },
      payload: {
        enabled: false,
        personId: kiddo.id,
        displayName: "Kid calendar",
        color: "#f7d8d4"
      }
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().source).toMatchObject({
      displayName: "Kid calendar",
      enabled: false,
      personId: kiddo.id,
      color: "#f7d8d4"
    });

    const cleared = await app.inject({
      method: "PATCH",
      url: `/api/calendar/sources/${source.id}`,
      headers: { cookie },
      payload: {
        personId: null,
        color: null
      }
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().source).toMatchObject({
      personId: null,
      color: null
    });
  });

  it("fetches provider events and serves cached fresh results on subsequent calls", async () => {
    const setup = await setupHousehold(app);
    const householdId = setup.household.id;
    const [household] = await app.db.select().from(households).limit(1);
    expect(household.id).toBe(householdId);

    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId,
        provider: "google",
        providerAccountId: "google-1",
        displayName: "Google",
        encryptedAccessToken: encryptToken("token-value"),
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
      })
      .returning();

    await app.db.insert(calendarSources).values({
      householdId,
      connectedAccountId: account.id,
      provider: "google",
      externalCalendarId: "calendar-1",
      displayName: "Parent",
      color: "#bee8ea",
      enabled: true,
      sortOrder: 0
    });

    const providerPayload = {
      items: [
        {
          id: "evt-1",
          summary: "Dentist",
          start: { dateTime: "2026-06-02T16:00:00.000Z" },
          end: { dateTime: "2026-06-02T17:00:00.000Z" }
        }
      ]
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(providerPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const start = new Date("2026-06-01T00:00:00.000Z").toISOString();
    const end = new Date("2026-06-08T00:00:00.000Z").toISOString();
    const url = `/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=${encodeURIComponent("America/Los_Angeles")}`;

    const first = await app.inject({
      method: "GET",
      url
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().cacheStatus).toBe("refreshed");
    expect(first.json().events).toHaveLength(1);

    const second = await app.inject({
      method: "GET",
      url
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().cacheStatus).toBe("fresh");
    expect(second.json().events).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

function calendarEventsUrl(): string {
  const start = "2026-06-01T00:00:00.000Z";
  const end = "2026-06-08T00:00:00.000Z";
  return `/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=UTC`;
}

async function withGoogleOauthConfig<T>(run: () => Promise<T>): Promise<T> {
  const originalGoogleEnv = {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI
  };
  env.GOOGLE_CLIENT_ID = "client-id";
  env.GOOGLE_CLIENT_SECRET = "client-secret";
  env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/integrations/google/callback";

  try {
    return await run();
  } finally {
    env.GOOGLE_CLIENT_ID = originalGoogleEnv.clientId;
    env.GOOGLE_CLIENT_SECRET = originalGoogleEnv.clientSecret;
    env.GOOGLE_REDIRECT_URI = originalGoogleEnv.redirectUri;
  }
}
