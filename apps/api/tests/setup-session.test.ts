import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildCookieHeader,
  createTestApp,
  resetTestDb,
  setupHousehold,
  unlockAdmin
} from "./helpers/test-app";

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
    expect(cookieHeader).toContain("skylight_admin_unlock_v3=");

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
});
