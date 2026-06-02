import {
  calendarSources,
  connectedAccounts,
  households
} from "@skylight-diy/db";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "../src/modules/integrations/token-crypto";
import {
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
