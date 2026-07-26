import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "../src/env";
import { createTestApp, resetTestDb, setupHousehold, unlockAdmin } from "./helpers/test-app";

describe("appliance update routes", () => {
  let app: FastifyInstance;
  let updateDirectory: string;
  const originalUpdateDirectory = env.DAYMARK_UPDATE_DIR;

  beforeAll(async () => {
    updateDirectory = await mkdtemp(join(tmpdir(), "daymark-update-test-"));
    env.DAYMARK_UPDATE_DIR = updateDirectory;
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetTestDb(app);
  });

  afterAll(async () => {
    env.DAYMARK_UPDATE_DIR = originalUpdateDirectory;
    await app.close();
  });

  it("requires an unlocked admin session", async () => {
    await setupHousehold(app);

    const status = await app.inject({
      method: "GET",
      url: "/api/system/update"
    });
    expect(status.statusCode).toBe(401);

    const update = await app.inject({
      method: "POST",
      url: "/api/system/update"
    });
    expect(update.statusCode).toBe(401);
  });

  it("queues one host update and reports its status", async () => {
    await setupHousehold(app);
    const { cookie } = await unlockAdmin(app);
    await writeFile(
      join(updateDirectory, "status.json"),
      JSON.stringify({
        state: "idle",
        installedVersion: "main@1234567",
        targetVersion: null,
        message: null,
        updatedAt: "2026-07-25T12:00:00.000Z"
      })
    );

    const requested = await app.inject({
      method: "POST",
      url: "/api/system/update",
      headers: { cookie }
    });
    expect(requested.statusCode).toBe(202);
    expect(requested.json()).toMatchObject({
      available: true,
      state: "queued",
      installedVersion: "main@1234567"
    });
    expect(JSON.parse(await readFile(join(updateDirectory, "request.json"), "utf8"))).toMatchObject(
      {
        id: expect.any(String),
        requestedAt: expect.any(String)
      }
    );

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/system/update",
      headers: { cookie }
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: "update_already_running" });

    const status = await app.inject({
      method: "GET",
      url: "/api/system/update",
      headers: { cookie }
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      available: true,
      state: "queued"
    });
  });
});
