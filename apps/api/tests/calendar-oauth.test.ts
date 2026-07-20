import { createHmac } from "node:crypto";
import {
  calendarEventCache,
  calendarEventWriteLogs,
  calendarFetchLogs,
  calendarSources,
  connectedAccounts,
  households,
  people,
} from "@daymark/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { env } from "../src/env";
import {
  buildCalendarCacheKey,
  buildSourceFingerprint,
} from "../src/modules/calendar/cache";
import {
  decryptToken,
  encryptToken,
} from "../src/modules/integrations/token-crypto";
import {
  buildCookieHeader,
  createTestApp,
  resetTestDb,
  setupHousehold,
  unlockAdmin,
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

  it("returns an honest empty state when no sources are enabled", async () => {
    await setupHousehold(app);
    const start = new Date().toISOString();
    const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const response = await app.inject({
      method: "GET",
      url: `/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=${encodeURIComponent("America/Los_Angeles")}`,
    });
    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.degraded).toBe(true);
    expect(json.events).toEqual([]);
    expect(
      json.warnings.some(
        (warning: { code: string }) => warning.code === "NO_ENABLED_SOURCES",
      ),
    ).toBe(true);
  });

  it("returns setup warning before setup and validates calendar query parameters", async () => {
    const invalid = await app.inject({
      method: "GET",
      url: "/api/calendar/events?start=nope&end=nope&timezone=",
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toBe("invalid_calendar_query");

    const start = new Date("2026-06-01T00:00:00.000Z").toISOString();
    const end = new Date("2026-06-08T00:00:00.000Z").toISOString();
    const invalidTimezone = await app.inject({
      method: "GET",
      url: `/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=Not%2FA_Timezone`,
    });
    expect(invalidTimezone.statusCode).toBe(400);
    expect(invalidTimezone.json().error).toBe("invalid_calendar_query");

    const reversedRange = await app.inject({
      method: "GET",
      url: `/api/calendar/events?start=${encodeURIComponent(end)}&end=${encodeURIComponent(start)}&timezone=UTC`,
    });
    expect(reversedRange.statusCode).toBe(400);
    expect(reversedRange.json().error).toBe("invalid_calendar_query");

    const response = await app.inject({
      method: "GET",
      url: `/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=UTC`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().events).toHaveLength(0);
    expect(response.json().warnings[0].code).toBe("SETUP_NOT_COMPLETED");
  });

  it("returns empty calendar accounts and sources before setup", async () => {
    const accounts = await app.inject({
      method: "GET",
      url: "/api/calendar/accounts",
    });
    expect(accounts.statusCode).toBe(200);
    expect(accounts.json()).toEqual({ accounts: [] });

    const sources = await app.inject({
      method: "GET",
      url: "/api/calendar/sources",
    });
    expect(sources.statusCode).toBe(200);
    expect(sources.json()).toEqual({ sources: [] });
  });

  it("reports oauth status and blocks connect when oauth env is not configured", async () => {
    await withGoogleOauthConfigCleared(async () => {
      await setupHousehold(app);
      const status = await app.inject({
        method: "GET",
        url: "/api/integrations/google/status",
      });
      expect(status.statusCode).toBe(200);
      expect(status.json().available).toBe(false);

      const connect = await app.inject({
        method: "GET",
        url: "/api/integrations/google/connect",
      });
      expect(connect.statusCode).toBe(401);

      const { cookie } = await unlockAdmin(app);
      const connectUnlocked = await app.inject({
        method: "GET",
        url: "/api/integrations/google/connect",
        headers: { cookie },
      });
      expect(connectUnlocked.statusCode).toBe(400);
    });
  });

  it("builds a Google OAuth authorization URL when configured and unlocked", async () => {
    await setupHousehold(app);
    const originalGoogleEnv = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
    };
    env.GOOGLE_CLIENT_ID = "client-id";
    env.GOOGLE_CLIENT_SECRET = "client-secret";
    env.GOOGLE_REDIRECT_URI =
      "http://localhost:3000/api/integrations/google/callback";

    try {
      const { cookie } = await unlockAdmin(app);
      const response = await app.inject({
        method: "GET",
        url: "/api/integrations/google/connect",
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      const responseBody = response.json();
      expect(responseBody.available).toBe(true);
      expect(responseBody.expiresAt).toBeGreaterThan(Date.now());
      expect(responseBody.expiresAt).toBeLessThanOrEqual(
        Date.now() + 10 * 60 * 1_000,
      );
      const authUrl = new URL(responseBody.authUrl);
      expect(authUrl.origin).toBe("https://accounts.google.com");
      expect(authUrl.searchParams.get("client_id")).toBe("client-id");
      expect(authUrl.searchParams.get("scope")).toBe(
        "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
      );
      const state = authUrl.searchParams.get("state");
      expect(state).toBeTruthy();
      expect(isTestOauthStateValid(state ?? "")).toBe(true);
      expect(buildCookieHeader(response)).not.toContain(
        "daymark_google_oauth_state=",
      );
    } finally {
      env.GOOGLE_CLIENT_ID = originalGoogleEnv.clientId;
      env.GOOGLE_CLIENT_SECRET = originalGoogleEnv.clientSecret;
      env.GOOGLE_REDIRECT_URI = originalGoogleEnv.redirectUri;
    }
  });

  it("rejects Google OAuth callbacks without a valid signed state", async () => {
    const missingState = await app.inject({
      method: "GET",
      url: "/api/integrations/google/callback?code=auth-code&state=missing",
    });
    expect(missingState.statusCode).toBe(400);
    expect(missingState.json().error).toBe("invalid_oauth_state");

    const mismatchedState = await app.inject({
      method: "GET",
      url: `/api/integrations/google/callback?code=auth-code&state=${encodeURIComponent(createTestOauthState({ tamperSignature: true }))}`,
    });
    expect(mismatchedState.statusCode).toBe(400);
    expect(mismatchedState.json().error).toBe("invalid_oauth_state");

    const expiredState = await app.inject({
      method: "GET",
      url: `/api/integrations/google/callback?code=auth-code&state=${encodeURIComponent(createTestOauthState({ expiresAt: Date.now() - 1_000 }))}`,
    });
    expect(expiredState.statusCode).toBe(400);
    expect(expiredState.json().error).toBe("invalid_oauth_state");
  });

  it("handles Google OAuth provider errors and missing codes after state validation", async () => {
    const state = createTestOauthState();
    const providerError = await app.inject({
      method: "GET",
      url: `/api/integrations/google/callback?error=access_denied&state=${encodeURIComponent(state)}`,
    });
    expect(providerError.statusCode).toBe(400);
    expect(providerError.json()).toEqual({
      connected: false,
      error: "access_denied",
      message: "Google OAuth was not completed.",
    });

    const missingCode = await app.inject({
      method: "GET",
      url: `/api/integrations/google/callback?state=${encodeURIComponent(createTestOauthState())}`,
    });
    expect(missingCode.statusCode).toBe(400);
    expect(missingCode.json().error).toBe("missing_oauth_code");
  });

  it("requires OAuth configuration before exchanging a validated callback code", async () => {
    await withGoogleOauthConfigCleared(async () => {
      const callback = await app.inject({
        method: "GET",
        url: `/api/integrations/google/callback?code=auth-code&state=${encodeURIComponent(createTestOauthState())}`,
      });
      expect(callback.statusCode).toBe(400);
      expect(callback.json().error).toBe("oauth_not_configured");
    });
  });

  it("reports token exchange failures from Google OAuth", async () => {
    await withGoogleOauthConfig(async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("invalid_grant", {
          status: 400,
        }),
      );

      const callback = await app.inject({
        method: "GET",
        url: `/api/integrations/google/callback?code=auth-code&state=${encodeURIComponent(createTestOauthState())}`,
      });
      expect(callback.statusCode).toBe(400);
      expect(callback.json()).toEqual({
        connected: false,
        error: "token_exchange_failed",
        details: "invalid_grant",
      });
    });
  });

  it("rejects OAuth token responses without an access token", async () => {
    await withGoogleOauthConfig(async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            scope: "https://www.googleapis.com/auth/calendar.readonly",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

      const callback = await app.inject({
        method: "GET",
        url: `/api/integrations/google/callback?code=auth-code&state=${encodeURIComponent(createTestOauthState())}`,
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
          headers: { "Content-Type": "application/json" },
        }),
      );

      const callback = await app.inject({
        method: "GET",
        url: `/api/integrations/google/callback?code=auth-code&state=${encodeURIComponent(createTestOauthState())}`,
      });
      expect(callback.statusCode).toBe(404);
      expect(callback.json().error).toBe("setup_not_completed");
    });
  });

  it("persists Google OAuth tokens for new and existing accounts", async () => {
    const setup = await setupHousehold(app);
    await withGoogleOauthConfig(async () => {
      const tokenResponses = [
        {
          access_token: "access-token-1",
          refresh_token: "refresh-token-1",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/calendar.readonly",
        },
        { access_token: "access-token-2" },
      ];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.url;
        const payload = url.includes("/calendarList/primary")
          ? { id: "family@example.com", summary: "Family Gmail" }
          : tokenResponses.shift();
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const created = await app.inject({
        method: "GET",
        url: `/api/integrations/google/callback?code=auth-code&state=${encodeURIComponent(createTestOauthState())}`,
      });
      expect(created.statusCode).toBe(302);
      expect(created.headers.location).toBe(
        `${env.APP_BASE_URL.replace(/\/$/, "")}/settings?google=connected`,
      );

      const [account] = await app.db
        .select()
        .from(connectedAccounts)
        .where(eq(connectedAccounts.householdId, setup.household.id))
        .limit(1);
      expect(account).toMatchObject({
        provider: "google",
        providerAccountId: "family@example.com",
        displayName: "Family Gmail",
        email: "family@example.com",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        reauthorizationRequired: false,
      });

      await app.db
        .update(connectedAccounts)
        .set({ encryptedRefreshToken: "malformed-refresh-token" })
        .where(eq(connectedAccounts.id, account.id));
      const updated = await app.inject({
        method: "GET",
        url: `/api/integrations/google/callback?code=auth-code&state=${encodeURIComponent(createTestOauthState())}`,
      });
      expect(updated.statusCode).toBe(302);

      const [updatedAccount] = await app.db
        .select()
        .from(connectedAccounts)
        .where(eq(connectedAccounts.id, account.id))
        .limit(1);
      expect(updatedAccount.scopes).toEqual([
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
      ]);
      expect(updatedAccount.encryptedRefreshToken).toBe(
        "malformed-refresh-token",
      );
    });
  });

  it("preserves distinct Google identities as separate connected accounts", async () => {
    const setup = await setupHousehold(app);
    await withGoogleOauthConfig(async () => {
      const identities = [
        { id: "parent@example.com", summary: "Parent Gmail" },
        { id: "family@example.com", summary: "Family Gmail" },
      ];
      let identityIndex = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = input.toString();
        const payload = url.includes("/calendarList/primary")
          ? identities[identityIndex++]
          : {
              access_token: `access-token-${identityIndex + 1}`,
              refresh_token: `refresh-token-${identityIndex + 1}`,
              scope: "https://www.googleapis.com/auth/calendar.readonly",
            };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      for (const code of ["first-account", "second-account"]) {
        const callback = await app.inject({
          method: "GET",
          url: `/api/integrations/google/callback?code=${code}&state=${encodeURIComponent(createTestOauthState())}`,
        });
        expect(callback.statusCode).toBe(302);
      }

      const accounts = await app.db
        .select()
        .from(connectedAccounts)
        .where(eq(connectedAccounts.householdId, setup.household.id));
      expect(accounts).toHaveLength(2);
      expect(accounts.map((account) => account.email).sort()).toEqual([
        "family@example.com",
        "parent@example.com",
      ]);
    });
  });

  it("binds reconnect OAuth state to the selected account", async () => {
    const setup = await setupHousehold(app);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "family@example.com",
        displayName: "Family Gmail",
        email: "family@example.com",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      })
      .returning();

    await withGoogleOauthConfig(async () => {
      const { cookie } = await unlockAdmin(app);
      const connect = await app.inject({
        method: "GET",
        url: `/api/integrations/google/connect?accountId=${account.id}`,
        headers: { cookie },
      });
      expect(connect.statusCode).toBe(200);
      const authUrl = new URL(connect.json().authUrl);
      expect(authUrl.searchParams.get("login_hint")).toBe("family@example.com");
      expect(authUrl.searchParams.get("prompt")).toBe("consent");

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = input.toString();
        const payload = url.includes("/calendarList/primary")
          ? { id: "different@example.com", summary: "Different Gmail" }
          : {
              access_token: "different-access-token",
              scope: "https://www.googleapis.com/auth/calendar.readonly",
            };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const callback = await app.inject({
        method: "GET",
        url: `/api/integrations/google/callback?code=wrong-account&state=${encodeURIComponent(authUrl.searchParams.get("state")!)}`,
      });
      expect(callback.statusCode).toBe(409);
      expect(callback.json()).toMatchObject({
        error: "google_account_mismatch",
      });

      const [unchanged] = await app.db
        .select()
        .from(connectedAccounts)
        .where(eq(connectedAccounts.id, account.id));
      expect(unchanged.email).toBe("family@example.com");
    });
  });

  it("disconnects Google locally, revokes its token, and removes calendar data", async () => {
    const setup = await setupHousehold(app);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "google-user-123",
        displayName: "Family Gmail",
        email: "family@example.com",
        encryptedAccessToken: encryptToken("access-token"),
        encryptedRefreshToken: encryptToken("refresh-token"),
        scopes: [
          "openid",
          "email",
          "https://www.googleapis.com/auth/calendar.readonly",
        ],
      })
      .returning();
    await app.db.insert(calendarSources).values({
      householdId: setup.household.id,
      connectedAccountId: account.id,
      provider: "google",
      externalCalendarId: "family",
      displayName: "Family",
      enabled: true,
      sortOrder: 0,
    });
    await app.db.insert(calendarEventCache).values({
      householdId: setup.household.id,
      cacheKey: "disconnect-cache",
      rangeStart: new Date("2026-06-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-06-08T00:00:00.000Z"),
      timezone: "UTC",
      sourceFingerprint: "source-fingerprint",
      payloadJsonb: { events: [] },
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      staleUntil: new Date(Date.now() + 120_000),
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    const blocked = await app.inject({
      method: "DELETE",
      url: `/api/integrations/google/accounts/${account.id}`,
    });
    expect(blocked.statusCode).toBe(401);

    const { cookie } = await unlockAdmin(app);
    const disconnected = await app.inject({
      method: "DELETE",
      url: `/api/integrations/google/accounts/${account.id}`,
      headers: { cookie },
    });
    expect(disconnected.statusCode).toBe(200);
    expect(disconnected.json()).toMatchObject({
      disconnected: true,
      revocationSucceeded: true,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/revoke",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await app.db.select().from(connectedAccounts)).toHaveLength(0);
    expect(await app.db.select().from(calendarSources)).toHaveLength(0);
    expect(await app.db.select().from(calendarEventCache)).toHaveLength(0);
  });

  it("requires a connected Google account before importing sources", async () => {
    await setupHousehold(app);

    const blocked = await app.inject({
      method: "POST",
      url: "/api/calendar/sources/import-from-google",
      payload: { externalCalendarIds: [] },
    });
    expect(blocked.statusCode).toBe(401);

    const { cookie } = await unlockAdmin(app);
    const imported = await app.inject({
      method: "POST",
      url: "/api/calendar/sources/import-from-google",
      headers: { cookie },
      payload: { accountId: missingUuid, externalCalendarIds: [] },
    });
    expect(imported.statusCode).toBe(409);
    expect(imported.json()).toMatchObject({
      error: "google_account_not_connected",
    });
  });

  it("returns no fabricated events when a source has no access token", async () => {
    const setup = await setupHousehold(app);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "google-1",
        displayName: "Google",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      })
      .returning();
    await app.db.insert(calendarSources).values({
      householdId: setup.household.id,
      connectedAccountId: account.id,
      provider: "google",
      externalCalendarId: "family",
      displayName: "Family",
      enabled: true,
      sortOrder: 0,
    });

    const response = await app.inject({
      method: "GET",
      url: calendarEventsUrl(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().events).toEqual([]);
    expect(
      response.json().warnings.map((warning: { code: string }) => warning.code),
    ).toEqual(
      expect.arrayContaining(["SOURCE_MISSING_TOKEN", "NO_CALENDAR_DATA"]),
    );
  });

  it("returns no fabricated events when a source token cannot be decrypted", async () => {
    const setup = await setupHousehold(app);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "google-1",
        displayName: "Google",
        encryptedAccessToken: "not-an-encrypted-token",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
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
      sortOrder: 0,
    });

    const response = await app.inject({
      method: "GET",
      url: calendarEventsUrl(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().events).toEqual([]);
    expect(
      response.json().warnings.map((warning: { code: string }) => warning.code),
    ).toEqual(
      expect.arrayContaining([
        "SOURCE_REAUTHORIZATION_REQUIRED",
        "NO_CALENDAR_DATA",
      ]),
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
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
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
        googleAccessRole: "owner",
        sortOrder: 0,
      })
      .returning();
    const start = "2026-06-01T00:00:00.000Z";
    const end = "2026-06-08T00:00:00.000Z";
    const timezone = "UTC";
    const sourceFingerprint = buildSourceFingerprint([
      {
        id: source.id,
        enabled: true,
        externalCalendarId: "family",
        displayName: "Family",
        color: "#8ec5b8",
        personId: null,
        personName: null,
      },
    ]);
    const cacheKey = buildCalendarCacheKey({
      rangeStart: start,
      rangeEnd: end,
      timezone,
      sourceFingerprint,
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
            color: "#8ec5b8",
          },
        ],
        sources: [
          {
            id: source.id,
            connectedAccountId: account.id,
            externalCalendarId: "family",
            displayName: "Family",
            color: "#8ec5b8",
            enabled: true,
            personId: null,
          },
        ],
        warnings: [{ code: "OLD_WARNING", message: "Old warning." }],
      },
      fetchedAt: new Date(now.getTime() - 10_000),
      expiresAt: new Date(now.getTime() - 1_000),
      staleUntil: new Date(now.getTime() + 60_000),
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=${timezone}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      cacheStatus: "stale",
      degraded: true,
    });
    expect(response.json().events[0].title).toBe("Cached appointment");
    expect(
      response.json().warnings.map((warning: { code: string }) => warning.code),
    ).toEqual(["OLD_WARNING", "SOURCE_MISSING_TOKEN"]);
  });

  it("discovers without tracking and imports only selected Google calendars", async () => {
    const setup = await setupHousehold(app);
    await app.db.insert(connectedAccounts).values({
      householdId: setup.household.id,
      provider: "google",
      providerAccountId: "decoy-google-account",
      displayName: "Other Google",
      encryptedAccessToken: encryptToken("decoy-token"),
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "google-1",
        displayName: "Google",
        encryptedAccessToken: encryptToken("token-value"),
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      })
      .returning();
    expect(account.id).toBeTruthy();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const pageToken = new URL(input.toString()).searchParams.get(
          "pageToken",
        );
        return new Response(
          JSON.stringify(
            pageToken
              ? {
                  items: [
                    { id: "school", summary: "School" },
                    { summary: "Ignored missing id" },
                  ],
                }
              : {
                  items: [
                    {
                      id: "primary",
                      summary: "Family",
                      backgroundColor: "#8ec5b8",
                    },
                  ],
                  nextPageToken: "calendar-page-2",
                },
          ),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      });

    const { cookie } = await unlockAdmin(app);
    const discovered = await app.inject({
      method: "POST",
      url: "/api/calendar/sources/discover-from-google",
      headers: { cookie },
      payload: { accountId: account.id },
    });
    expect(discovered.statusCode).toBe(200);
    expect(discovered.json().calendars).toEqual([
      expect.objectContaining({
        externalCalendarId: "primary",
        displayName: "Family",
        tracked: false,
      }),
      expect.objectContaining({
        externalCalendarId: "school",
        displayName: "School",
        tracked: false,
      }),
    ]);
    const beforeImport = await app.inject({
      method: "GET",
      url: "/api/calendar/sources",
    });
    expect(beforeImport.json().sources).toHaveLength(0);

    const imported = await app.inject({
      method: "POST",
      url: "/api/calendar/sources/import-from-google",
      headers: { cookie },
      payload: { accountId: account.id, externalCalendarIds: ["school"] },
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().imported).toBe(1);
    expect(
      imported
        .json()
        .sources.map((source: { displayName: string }) => source.displayName),
    ).toEqual(["School"]);
    expect(imported.json().sources[0]).toMatchObject({
      enabled: true,
      personId: null,
    });
    expect(imported.json().sources[0].connectedAccountId).toBe(account.id);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: { Authorization: "Bearer token-value" },
      }),
    );
    expect(
      fetchSpy.mock.calls.some(([input]) =>
        input.toString().includes("pageToken=calendar-page-2"),
      ),
    ).toBe(true);
  });

  it("refreshes Google access roles and disables Daymark writes for reader calendars", async () => {
    const setup = await setupHousehold(app);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "google-permission-refresh",
        displayName: "Google",
        encryptedAccessToken: encryptToken("token-value"),
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      })
      .returning();
    await app.db.insert(calendarSources).values([
      {
        householdId: setup.household.id,
        connectedAccountId: account.id,
        provider: "google",
        externalCalendarId: "family",
        displayName: "Family",
        enabled: true,
        allowEventWrites: true,
      },
      {
        householdId: setup.household.id,
        connectedAccountId: account.id,
        provider: "google",
        externalCalendarId: "school",
        displayName: "School",
        enabled: true,
        allowEventWrites: true,
      },
    ]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            { id: "family", summary: "Family", accessRole: "owner" },
            { id: "school", summary: "School", accessRole: "reader" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { cookie } = await unlockAdmin(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/calendar/sources/discover-from-google",
      headers: { cookie },
      payload: { accountId: account.id },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().calendars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalCalendarId: "family",
          accessRole: "owner",
          writable: true,
        }),
        expect.objectContaining({
          externalCalendarId: "school",
          accessRole: "reader",
          writable: false,
        }),
      ]),
    );
    const sources = await app.db.select().from(calendarSources);
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalCalendarId: "family",
          googleAccessRole: "owner",
          allowEventWrites: true,
        }),
        expect.objectContaining({
          externalCalendarId: "school",
          googleAccessRole: "reader",
          allowEventWrites: false,
        }),
      ]),
    );
  });

  it("returns an explicit error when Google calendar-list import fails", async () => {
    const setup = await setupHousehold(app);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "google-1",
        displayName: "Google",
        encryptedAccessToken: encryptToken("token-value"),
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      })
      .returning();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limit", {
        status: 429,
      }),
    );

    const { cookie } = await unlockAdmin(app);
    const imported = await app.inject({
      method: "POST",
      url: "/api/calendar/sources/import-from-google",
      headers: { cookie },
      payload: { accountId: account.id, externalCalendarIds: ["primary"] },
    });
    expect(imported.statusCode).toBe(502);
    expect(imported.json()).toMatchObject({
      error: "google_calendar_list_failed",
      statusCode: 429,
    });

    const sources = await app.inject({
      method: "GET",
      url: "/api/calendar/sources",
    });
    expect(sources.statusCode).toBe(200);
    expect(sources.json().sources).toHaveLength(0);
  });

  it("returns a reconnect error when stored Google credentials cannot be decrypted during import", async () => {
    const setup = await setupHousehold(app);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "google-1",
        displayName: "Google",
        encryptedAccessToken: "not-an-encrypted-token",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      })
      .returning();

    const { cookie } = await unlockAdmin(app);
    const imported = await app.inject({
      method: "POST",
      url: "/api/calendar/sources/import-from-google",
      headers: { cookie },
      payload: { accountId: account.id, externalCalendarIds: ["primary"] },
    });
    expect(imported.statusCode).toBe(409);
    expect(imported.json()).toMatchObject({
      error: "google_reauthorization_required",
    });
  });

  it("patches and untracks calendar sources with admin protection", async () => {
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
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
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
        googleAccessRole: "owner",
        sortOrder: 0,
      })
      .returning();

    const blocked = await app.inject({
      method: "PATCH",
      url: `/api/calendar/sources/${source.id}`,
      payload: { displayName: "Blocked" },
    });
    expect(blocked.statusCode).toBe(401);

    const { cookie } = await unlockAdmin(app);
    const invalidBody = await app.inject({
      method: "PATCH",
      url: `/api/calendar/sources/${source.id}`,
      headers: { cookie },
      payload: { enabled: "yes" },
    });
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.json().error).toBe("invalid_body");

    const missingSource = await app.inject({
      method: "PATCH",
      url: `/api/calendar/sources/${missingUuid}`,
      headers: { cookie },
      payload: { displayName: "Missing source" },
    });
    expect(missingSource.statusCode).toBe(404);
    expect(missingSource.json().error).toBe("source_not_found");

    const invalidPerson = await app.inject({
      method: "PATCH",
      url: `/api/calendar/sources/${source.id}`,
      headers: { cookie },
      payload: { personId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(invalidPerson.statusCode).toBe(400);
    expect(invalidPerson.json().error).toBe("invalid_person_id");

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/calendar/sources/${source.id}`,
      headers: { cookie },
      payload: {
        enabled: false,
        allowEventWrites: true,
        personId: kiddo.id,
        displayName: "Kid calendar",
        color: "#f7d8d4",
      },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().source).toMatchObject({
      displayName: "Kid calendar",
      enabled: false,
      allowEventWrites: true,
      personId: kiddo.id,
      color: "#f7d8d4",
    });

    const cleared = await app.inject({
      method: "PATCH",
      url: `/api/calendar/sources/${source.id}`,
      headers: { cookie },
      payload: {
        personId: null,
        color: null,
      },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().source).toMatchObject({
      personId: null,
      color: null,
    });

    await app.db.insert(calendarEventCache).values({
      householdId: setup.household.id,
      cacheKey: "source-removal-cache",
      rangeStart: new Date("2026-06-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-06-08T00:00:00.000Z"),
      timezone: "UTC",
      sourceFingerprint: source.id,
      payloadJsonb: { events: [{ sourceId: source.id }] },
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      staleUntil: new Date(Date.now() + 120_000),
    });
    const blockedDelete = await app.inject({
      method: "DELETE",
      url: `/api/calendar/sources/${source.id}`,
    });
    expect(blockedDelete.statusCode).toBe(401);

    const untracked = await app.inject({
      method: "DELETE",
      url: `/api/calendar/sources/${source.id}`,
      headers: { cookie },
    });
    expect(untracked.statusCode).toBe(200);
    expect(untracked.json()).toEqual({ untracked: true, sourceId: source.id });
    expect(await app.db.select().from(calendarSources)).toHaveLength(0);
    expect(await app.db.select().from(calendarEventCache)).toHaveLength(0);

    const missingDelete = await app.inject({
      method: "DELETE",
      url: `/api/calendar/sources/${source.id}`,
      headers: { cookie },
    });
    expect(missingDelete.statusCode).toBe(404);
    expect(missingDelete.json().error).toBe("source_not_found");
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
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      })
      .returning();

    const [source] = await app.db
      .insert(calendarSources)
      .values({
        householdId,
        connectedAccountId: account.id,
        provider: "google",
        externalCalendarId: "calendar-1",
        displayName: "Parent",
        color: "#bee8ea",
        enabled: true,
        sortOrder: 0,
      })
      .returning();

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const pageToken = new URL(input.toString()).searchParams.get(
          "pageToken",
        );
        const providerPayload = pageToken
          ? {
              items: [
                {
                  id: "evt-2",
                  summary: "School closed",
                  start: { date: "2026-06-03" },
                  end: { date: "2026-06-04" },
                },
              ],
            }
          : {
              items: [
                {
                  id: "evt-1",
                  recurringEventId: "series-1",
                  summary: "Dentist",
                  description: "Bring insurance card",
                  location: "Main clinic",
                  start: { dateTime: "2026-06-02T16:00:00.000Z" },
                  end: { dateTime: "2026-06-02T17:00:00.000Z" },
                },
                {
                  id: "evt-cancelled",
                  summary: "Cancelled",
                  status: "cancelled",
                  start: { dateTime: "2026-06-04T16:00:00.000Z" },
                  end: { dateTime: "2026-06-04T17:00:00.000Z" },
                },
              ],
              nextPageToken: "event-page-2",
            };
        return new Response(JSON.stringify(providerPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

    const start = new Date("2026-06-01T00:00:00.000Z").toISOString();
    const end = new Date("2026-06-08T00:00:00.000Z").toISOString();
    const url = `/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=${encodeURIComponent("America/Los_Angeles")}`;

    const first = await app.inject({
      method: "GET",
      url,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().cacheStatus).toBe("refreshed");
    expect(first.json().events).toHaveLength(2);
    expect(first.json().events[0]).toMatchObject({
      sourceId: source.id,
      title: "Dentist",
      description: "Bring insurance card",
      location: "Main clinic",
      isAllDay: false,
      recurringEventId: "series-1",
      providerRefs: [
        {
          sourceId: source.id,
          providerEventId: "evt-1",
          recurringEventId: "series-1",
        },
      ],
    });
    expect(first.json().events[1]).toMatchObject({
      sourceId: source.id,
      title: "School closed",
      isAllDay: true,
    });
    expect(
      first.json().events.map((event: { title: string }) => event.title),
    ).not.toContain("Cancelled");

    const second = await app.inject({
      method: "GET",
      url,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().cacheStatus).toBe("fresh");
    expect(second.json().events).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const forced = await app.inject({
      method: "GET",
      url: `${url}&refresh=true`,
    });
    expect(forced.statusCode).toBe(200);
    expect(forced.json().cacheStatus).toBe("refreshed");
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(fetchSpy.mock.calls[0]?.[0].toString()).toContain(
      "timeZone=America%2FLos_Angeles",
    );
    expect(fetchSpy.mock.calls[1]?.[0].toString()).toContain(
      "pageToken=event-page-2",
    );

    const logs = await app.db
      .select({
        calendarSourceId: calendarFetchLogs.calendarSourceId,
        status: calendarFetchLogs.status,
        errorMessage: calendarFetchLogs.errorMessage,
      })
      .from(calendarFetchLogs);
    expect(logs).toEqual([
      {
        calendarSourceId: source.id,
        status: "success",
        errorMessage: null,
      },
      {
        calendarSourceId: source.id,
        status: "success",
        errorMessage: null,
      },
    ]);
  });

  it("returns empty refreshed events when Google successfully returns no events", async () => {
    const setup = await setupHousehold(app);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "google-1",
        displayName: "Google",
        encryptedAccessToken: encryptToken("token-value"),
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
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
        color: "#bee8ea",
        enabled: true,
        sortOrder: 0,
      })
      .returning();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: calendarEventsUrl(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      cacheStatus: "refreshed",
      degraded: false,
      events: [],
      warnings: [],
    });

    const logs = await app.db
      .select({
        calendarSourceId: calendarFetchLogs.calendarSourceId,
        status: calendarFetchLogs.status,
      })
      .from(calendarFetchLogs);
    expect(logs).toEqual([{ calendarSourceId: source.id, status: "success" }]);
  });

  it("refreshes an expired Google token once for every source on the account", async () => {
    await withGoogleOauthConfig(async () => {
      const setup = await setupHousehold(app);
      const [account] = await app.db
        .insert(connectedAccounts)
        .values({
          householdId: setup.household.id,
          provider: "google",
          providerAccountId: "google-1",
          displayName: "Google",
          encryptedAccessToken: encryptToken("expired-access-token"),
          encryptedRefreshToken: encryptToken("refresh-token"),
          accessTokenExpiresAt: new Date(Date.now() - 60_000),
          scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        })
        .returning();
      await app.db.insert(calendarSources).values([
        {
          householdId: setup.household.id,
          connectedAccountId: account.id,
          provider: "google",
          externalCalendarId: "family",
          displayName: "Family",
          enabled: true,
          sortOrder: 0,
        },
        {
          householdId: setup.household.id,
          connectedAccountId: account.id,
          provider: "google",
          externalCalendarId: "school",
          displayName: "School",
          enabled: true,
          sortOrder: 1,
        },
      ]);
      let refreshCalls = 0;
      let eventCalls = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = input.toString();
        if (url === "https://oauth2.googleapis.com/token") {
          refreshCalls += 1;
          return new Response(
            JSON.stringify({
              access_token: "refreshed-access-token",
              expires_in: 3600,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        eventCalls += 1;
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const response = await app.inject({
        method: "GET",
        url: calendarEventsUrl(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        cacheStatus: "refreshed",
        degraded: false,
      });
      expect(refreshCalls).toBe(1);
      expect(eventCalls).toBe(2);

      const [updatedAccount] = await app.db
        .select()
        .from(connectedAccounts)
        .where(eq(connectedAccounts.id, account.id));
      expect(decryptToken(updatedAccount.encryptedAccessToken!)).toBe(
        "refreshed-access-token",
      );
      expect(updatedAccount.accessTokenExpiresAt!.getTime()).toBeGreaterThan(
        Date.now(),
      );
      expect(updatedAccount.reauthorizationRequired).toBe(false);
    });
  });

  it("marks the Google account for reconnect when token refresh is rejected", async () => {
    await withGoogleOauthConfig(async () => {
      const setup = await setupHousehold(app);
      const [account] = await app.db
        .insert(connectedAccounts)
        .values({
          householdId: setup.household.id,
          provider: "google",
          providerAccountId: "google-1",
          displayName: "Google",
          encryptedAccessToken: encryptToken("expired-access-token"),
          encryptedRefreshToken: encryptToken("revoked-refresh-token"),
          accessTokenExpiresAt: new Date(Date.now() - 60_000),
          scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        })
        .returning();
      await app.db.insert(calendarSources).values({
        householdId: setup.household.id,
        connectedAccountId: account.id,
        provider: "google",
        externalCalendarId: "family",
        displayName: "Family",
        enabled: true,
        sortOrder: 0,
      });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("invalid_grant", { status: 400 }),
      );

      const response = await app.inject({
        method: "GET",
        url: calendarEventsUrl(),
      });
      expect(response.statusCode).toBe(200);
      expect(
        response
          .json()
          .warnings.map((warning: { code: string }) => warning.code),
      ).toEqual(
        expect.arrayContaining([
          "SOURCE_REAUTHORIZATION_REQUIRED",
          "NO_CALENDAR_DATA",
        ]),
      );
      const [updatedAccount] = await app.db
        .select()
        .from(connectedAccounts)
        .where(eq(connectedAccounts.id, account.id));
      expect(updatedAccount.reauthorizationRequired).toBe(true);
    });
  });

  it("requires both account authorization and an explicit writable-calendar opt-in", async () => {
    const setup = await setupHousehold(app);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "google-write-guard",
        displayName: "Google",
        encryptedAccessToken: encryptToken("token-value"),
        scopes: [
          "https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/calendar.events",
        ],
      })
      .returning();
    const [source] = await app.db
      .insert(calendarSources)
      .values({
        householdId: setup.household.id,
        connectedAccountId: account.id,
        provider: "google",
        externalCalendarId: "parent@example.com",
        displayName: "Parent",
        enabled: true,
        googleAccessRole: "owner",
      })
      .returning();
    const payload = {
      sourceId: source.id,
      requestId: "11111111-1111-4111-8111-111111111111",
      title: "Family appointment",
      allDay: false,
      start: "2026-07-21T17:00:00.000Z",
      end: "2026-07-21T18:00:00.000Z",
      timezone: "America/Los_Angeles",
    };

    const disabled = await app.inject({
      method: "POST",
      url: "/api/calendar/events",
      payload,
    });
    expect(disabled.statusCode).toBe(403);
    expect(disabled.json().error).toBe("calendar_writes_disabled");

    const deleteDisabled = await app.inject({
      method: "DELETE",
      url: "/api/calendar/events",
      payload: {
        targets: [{ sourceId: source.id, providerEventId: "event-id" }],
        scope: "event",
      },
    });
    expect(deleteDisabled.statusCode).toBe(403);
    expect(deleteDisabled.json().error).toBe("calendar_writes_disabled");

    await app.db
      .update(calendarSources)
      .set({ allowEventWrites: true })
      .where(eq(calendarSources.id, source.id));
    await app.db
      .update(connectedAccounts)
      .set({ scopes: ["https://www.googleapis.com/auth/calendar.readonly"] })
      .where(eq(connectedAccounts.id, account.id));

    const unauthorized = await app.inject({
      method: "POST",
      url: "/api/calendar/events",
      payload,
    });
    expect(unauthorized.statusCode).toBe(409);
    expect(unauthorized.json().error).toBe(
      "google_write_authorization_required",
    );
  });

  it("creates an event idempotently and clears cached calendar data", async () => {
    const setup = await setupHousehold(app);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: setup.household.id,
        provider: "google",
        providerAccountId: "google-event-create",
        displayName: "Google",
        encryptedAccessToken: encryptToken("token-value"),
        scopes: [
          "https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/calendar.events",
        ],
      })
      .returning();
    const [source] = await app.db
      .insert(calendarSources)
      .values({
        householdId: setup.household.id,
        connectedAccountId: account.id,
        provider: "google",
        externalCalendarId: "family/calendar@example.com",
        displayName: "Family",
        enabled: true,
        allowEventWrites: true,
        googleAccessRole: "writer",
      })
      .returning();
    await app.db.insert(calendarEventCache).values({
      householdId: setup.household.id,
      cacheKey: "event-create-cache",
      rangeStart: new Date("2026-07-21T00:00:00.000Z"),
      rangeEnd: new Date("2026-07-22T00:00:00.000Z"),
      timezone: "America/Los_Angeles",
      sourceFingerprint: source.id,
      payloadJsonb: { events: [] },
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      staleUntil: new Date(Date.now() + 120_000),
    });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "22222222222242228222222222222222",
            htmlLink: "https://calendar.google.com/event?eid=created",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const payload = {
      sourceId: source.id,
      requestId: "22222222-2222-4222-8222-222222222222",
      title: "Dentist",
      description: "Bring insurance card",
      location: "Campbell",
      attendees: ["kid@example.com"],
      recurrence: {
        frequency: "weekly",
        ends: "after",
        count: 6,
      },
      allDay: false,
      start: "2026-07-21T17:00:00.000Z",
      end: "2026-07-21T18:00:00.000Z",
      timezone: "America/Los_Angeles",
    };

    const created = await app.inject({
      method: "POST",
      url: "/api/calendar/events",
      payload,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      created: true,
      duplicate: false,
      sourceId: source.id,
    });
    expect(await app.db.select().from(calendarEventCache)).toHaveLength(0);
    expect(fetchSpy.mock.calls[0]?.[0].toString()).toContain(
      "calendars/family%2Fcalendar%40example.com/events",
    );
    expect(fetchSpy.mock.calls[0]?.[0].toString()).toContain("sendUpdates=all");
    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(requestBody).toMatchObject({
      id: "22222222222242228222222222222222",
      summary: "Dentist",
      description: "Bring insurance card",
      location: "Campbell",
      attendees: [{ email: "kid@example.com" }],
      recurrence: ["RRULE:FREQ=WEEKLY;COUNT=6"],
      start: {
        dateTime: "2026-07-21T17:00:00.000Z",
        timeZone: "America/Los_Angeles",
      },
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/calendar/events",
      payload,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({
      created: true,
      duplicate: true,
      eventId: "22222222222242228222222222222222",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await app.db.select().from(calendarEventWriteLogs)).toMatchObject([
      {
        calendarSourceId: source.id,
        requestId: "22222222-2222-4222-8222-222222222222",
        providerEventId: "22222222222242228222222222222222",
        title: "Dentist",
      },
    ]);

    await app.db.insert(calendarEventCache).values({
      householdId: setup.household.id,
      cacheKey: "event-delete-cache",
      rangeStart: new Date("2026-07-21T00:00:00.000Z"),
      rangeEnd: new Date("2026-07-22T00:00:00.000Z"),
      timezone: "America/Los_Angeles",
      sourceFingerprint: source.id,
      payloadJsonb: { events: [] },
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      staleUntil: new Date(Date.now() + 120_000),
    });
    const deleted = await app.inject({
      method: "DELETE",
      url: "/api/calendar/events",
      payload: {
        scope: "series",
        targets: [
          {
            sourceId: source.id,
            providerEventId: "recurring-instance-id",
            recurringEventId: "recurring-master-id",
          },
        ],
      },
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({
      deleted: true,
      scope: "series",
      events: [{ sourceId: source.id, providerEventId: "recurring-master-id" }],
    });
    expect(fetchSpy.mock.calls[1]?.[0].toString()).toContain(
      "/events/recurring-master-id?sendUpdates=all",
    );
    expect(fetchSpy.mock.calls[1]?.[1]?.method).toBe("DELETE");
    expect(await app.db.select().from(calendarEventCache)).toHaveLength(0);
  });
});

function calendarEventsUrl(): string {
  const start = "2026-06-01T00:00:00.000Z";
  const end = "2026-06-08T00:00:00.000Z";
  return `/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=UTC`;
}

function createTestOauthState(options?: {
  expiresAt?: number;
  tamperSignature?: boolean;
}): string {
  const payload = Buffer.from(
    JSON.stringify({
      nonce: "test-nonce",
      expiresAt: options?.expiresAt ?? Date.now() + 60_000,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  const tamperedSignature = signature.startsWith("x")
    ? `y${signature.slice(1)}`
    : `x${signature.slice(1)}`;
  return `${payload}.${options?.tamperSignature ? tamperedSignature : signature}`;
}

function isTestOauthStateValid(state: string): boolean {
  const [payload, signature, ...rest] = state.split(".");
  if (!payload || !signature || rest.length > 0) {
    return false;
  }
  const expectedSignature = createHmac("sha256", env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  return signature === expectedSignature;
}

async function withGoogleOauthConfig<T>(run: () => Promise<T>): Promise<T> {
  const originalGoogleEnv = {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  };
  env.GOOGLE_CLIENT_ID = "client-id";
  env.GOOGLE_CLIENT_SECRET = "client-secret";
  env.GOOGLE_REDIRECT_URI =
    "http://localhost:3000/api/integrations/google/callback";

  try {
    return await run();
  } finally {
    env.GOOGLE_CLIENT_ID = originalGoogleEnv.clientId;
    env.GOOGLE_CLIENT_SECRET = originalGoogleEnv.clientSecret;
    env.GOOGLE_REDIRECT_URI = originalGoogleEnv.redirectUri;
  }
}

async function withGoogleOauthConfigCleared<T>(
  run: () => Promise<T>,
): Promise<T> {
  const originalGoogleEnv = {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  };
  env.GOOGLE_CLIENT_ID = undefined;
  env.GOOGLE_CLIENT_SECRET = undefined;
  env.GOOGLE_REDIRECT_URI = undefined;

  try {
    return await run();
  } finally {
    env.GOOGLE_CLIENT_ID = originalGoogleEnv.clientId;
    env.GOOGLE_CLIENT_SECRET = originalGoogleEnv.clientSecret;
    env.GOOGLE_REDIRECT_URI = originalGoogleEnv.redirectUri;
  }
}
