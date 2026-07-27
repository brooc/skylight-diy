import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "../src/env";
import {
  createTestApp,
  resetTestDb,
  setupHousehold,
  unlockAdmin,
} from "./helpers/test-app";

describe("appliance device-control routes", () => {
  let app: FastifyInstance;
  let controlDirectory: string;
  const originalUpdateDirectory = env.DAYMARK_UPDATE_DIR;

  beforeAll(async () => {
    controlDirectory = await mkdtemp(join(tmpdir(), "daymark-device-test-"));
    env.DAYMARK_UPDATE_DIR = controlDirectory;
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetTestDb(app);
    await rm(join(controlDirectory, "device-control-request.json"), {
      force: true,
    });
  });

  afterAll(async () => {
    env.DAYMARK_UPDATE_DIR = originalUpdateDirectory;
    await app.close();
  });

  it("requires an unlocked admin session", async () => {
    await setupHousehold(app);

    const status = await app.inject({
      method: "GET",
      url: "/api/system/device",
    });
    expect(status.statusCode).toBe(401);

    const action = await app.inject({
      method: "POST",
      url: "/api/system/device",
      payload: { action: "shutdown" },
    });
    expect(action.statusCode).toBe(401);
  });

  it.each(["desktop", "reboot", "shutdown"] as const)(
    "queues the %s host action",
    async (action) => {
      await setupHousehold(app);
      const { cookie } = await unlockAdmin(app);

      const response = await app.inject({
        method: "POST",
        url: "/api/system/device",
        headers: { cookie },
        payload: { action },
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({
        accepted: true,
        action,
        requestedAt: expect.any(String),
      });
      expect(
        JSON.parse(
          await readFile(
            join(controlDirectory, "device-control-request.json"),
            "utf8",
          ),
        ),
      ).toMatchObject({
        id: expect.any(String),
        action,
        requestedAt: expect.any(String),
      });
    },
  );

  it("rejects unsupported device actions", async () => {
    await setupHousehold(app);
    const { cookie } = await unlockAdmin(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/system/device",
      headers: { cookie },
      payload: { action: "format-disk" },
    });

    expect(response.statusCode).toBe(400);
  });
});
