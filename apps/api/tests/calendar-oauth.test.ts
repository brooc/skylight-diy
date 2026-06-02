import {
  calendarSources,
  connectedAccounts,
  households,
  people
} from "@skylight-diy/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/env";
import { encryptToken } from "../src/modules/integrations/token-crypto";
import {
  buildCookieHeader,
  createTestApp,
  resetTestDb,
  setupHousehold,
  unlockAdmin
} from "./helpers/test-app";

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
