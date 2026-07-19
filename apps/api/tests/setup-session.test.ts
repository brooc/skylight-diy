import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildCookieHeader,
  createTestApp,
  resetTestDb,
  setupHousehold,
  unlockAdmin
} from "./helpers/test-app";
import { households, people } from "@daymark/db";

describe("setup and session routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetTestDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports setup required until setup completes", async () => {
    const initial = await app.inject({
      method: "GET",
      url: "/api/setup/status"
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({ setupRequired: true });

    const setup = await setupHousehold(app);
    expect(setup.created).toBe(true);

    const afterSetup = await app.inject({
      method: "GET",
      url: "/api/setup/status"
    });
    expect(afterSetup.statusCode).toBe(200);
    expect(afterSetup.json()).toEqual({ setupRequired: false });
  });

  it("unlocks with a valid PIN and locks again", async () => {
    await setupHousehold(app, { adminPin: "2468" });

    const invalidPin = await app.inject({
      method: "POST",
      url: "/api/session/unlock",
      payload: { pin: "1111" }
    });
    expect(invalidPin.statusCode).toBe(401);

    const unlocked = await app.inject({
      method: "POST",
      url: "/api/session/unlock",
      payload: { pin: "2468" }
    });
    expect(unlocked.statusCode).toBe(200);
    expect(unlocked.json()).toEqual({ unlocked: true });
    const cookieHeader = buildCookieHeader(unlocked);
    expect(cookieHeader).toContain("daymark_admin_unlock=");

    const current = await app.inject({
      method: "GET",
      url: "/api/session/current",
      headers: {
        cookie: cookieHeader
      }
    });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toEqual({ unlocked: true });

    const locked = await app.inject({
      method: "POST",
      url: "/api/session/lock",
      headers: {
        cookie: cookieHeader
      }
    });
    expect(locked.statusCode).toBe(200);
    expect(locked.json()).toEqual({ unlocked: false });

    const relockedCookie = buildCookieHeader(locked);
    const currentAfterLock = await app.inject({
      method: "GET",
      url: "/api/session/current",
      headers: {
        cookie: relockedCookie || cookieHeader
      }
    });
    expect(currentAfterLock.statusCode).toBe(200);
    expect(currentAfterLock.json()).toEqual({ unlocked: false });
  });

  it("requires an unlocked session to change the admin PIN", async () => {
    await setupHousehold(app, { adminPin: "1234" });

    const blocked = await app.inject({
      method: "POST",
      url: "/api/session/change-pin",
      payload: { nextPin: "2468" }
    });
    expect(blocked.statusCode).toBe(401);

    const { cookie } = await unlockAdmin(app, "1234");
    const invalidPayload = await app.inject({
      method: "POST",
      url: "/api/session/change-pin",
      headers: { cookie },
      payload: { nextPin: "12" }
    });
    expect(invalidPayload.statusCode).toBe(400);

    const changed = await app.inject({
      method: "POST",
      url: "/api/session/change-pin",
      headers: { cookie },
      payload: { nextPin: "2468" }
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toEqual({ updated: true });

    const oldPin = await app.inject({
      method: "POST",
      url: "/api/session/unlock",
      payload: { pin: "1234" }
    });
    expect(oldPin.statusCode).toBe(401);

    const newPin = await app.inject({
      method: "POST",
      url: "/api/session/unlock",
      payload: { pin: "2468" }
    });
    expect(newPin.statusCode).toBe(200);
  });

  it("requires admin unlock and manages family details and members", async () => {
    await setupHousehold(app);

    const blocked = await app.inject({
      method: "PATCH",
      url: "/api/household/current",
      payload: { name: "Blocked update" }
    });
    expect(blocked.statusCode).toBe(401);

    const { cookie } = await unlockAdmin(app);
    const updatedHousehold = await app.inject({
      method: "PATCH",
      url: "/api/household/current",
      headers: { cookie },
      payload: {
        name: "The Daymarks",
        timezone: "America/New_York",
        weekStartsOn: "sunday"
      }
    });
    expect(updatedHousehold.statusCode).toBe(200);
    expect(updatedHousehold.json().household).toMatchObject({
      name: "The Daymarks",
      timezone: "America/New_York",
      weekStartsOn: "sunday"
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/household/people",
      headers: { cookie },
      payload: { displayName: "Grandma", role: "adult", color: "#ca8a04" }
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().person).toMatchObject({
      displayName: "Grandma",
      role: "adult",
      color: "#ca8a04",
      sortOrder: 2
    });

    const edited = await app.inject({
      method: "PATCH",
      url: `/api/household/people/${created.json().person.id}`,
      headers: { cookie },
      payload: { displayName: "Nana", color: "#a16207" }
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().person).toMatchObject({
      displayName: "Nana",
      role: "adult",
      color: "#a16207"
    });

    expect((await app.db.select().from(households))[0]).toMatchObject({ name: "The Daymarks" });
    expect(await app.db.select().from(people)).toHaveLength(3);
  });

  it("validates family settings payloads", async () => {
    await setupHousehold(app);
    const { cookie } = await unlockAdmin(app);

    const badTimezone = await app.inject({
      method: "PATCH",
      url: "/api/household/current",
      headers: { cookie },
      payload: { timezone: "Not/A_Timezone" }
    });
    expect(badTimezone.statusCode).toBe(400);

    const badMember = await app.inject({
      method: "POST",
      url: "/api/household/people",
      headers: { cookie },
      payload: { displayName: "", role: "pet", color: "orange" }
    });
    expect(badMember.statusCode).toBe(400);
  });
});
