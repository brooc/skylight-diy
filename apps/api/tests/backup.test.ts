import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const configuredStatus = {
  available: true,
  configured: true,
  state: "idle",
  lastSuccessAt: "2026-07-30T03:15:00-07:00",
  lastAttemptAt: "2026-07-30T03:15:00-07:00",
  lastBackupName: "daymark-20260730T101500Z.tar.gz.age",
  lastBackupBytes: 12345,
  message: "Encrypted backup uploaded to Google Drive.",
  recoveryKeyAvailable: true,
  updatedAt: "2026-07-30T03:16:00-07:00",
} as const;

describe("appliance backup routes", () => {
  let app: FastifyInstance;
  let controlDirectory: string;
  const originalUpdateDirectory = env.DAYMARK_UPDATE_DIR;

  beforeAll(async () => {
    controlDirectory = await mkdtemp(join(tmpdir(), "daymark-backup-test-"));
    env.DAYMARK_UPDATE_DIR = controlDirectory;
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetTestDb(app);
    await rm(join(controlDirectory, "backup-request.json"), { force: true });
    await rm(join(controlDirectory, "backup-connect-request.json"), {
      force: true,
    });
    await rm(join(controlDirectory, "backup-recovery-key.txt"), {
      force: true,
    });
    await writeFile(
      join(controlDirectory, "backup-status.json"),
      `${JSON.stringify(configuredStatus)}\n`,
      "utf8",
    );
  });

  afterAll(async () => {
    env.DAYMARK_UPDATE_DIR = originalUpdateDirectory;
    await app.close();
    await rm(controlDirectory, { recursive: true, force: true });
  });

  it("requires an unlocked admin session", async () => {
    await setupHousehold(app);

    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/system/backup",
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/system/backup",
        })
      ).statusCode,
    ).toBe(401);
  });

  it("reports status and queues a backup", async () => {
    await setupHousehold(app);
    const { cookie } = await unlockAdmin(app);

    const status = await app.inject({
      method: "GET",
      url: "/api/system/backup",
      headers: { cookie },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject(configuredStatus);

    const response = await app.inject({
      method: "POST",
      url: "/api/system/backup",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      configured: true,
      state: "queued",
      lastAttemptAt: expect.any(String),
    });
    expect(
      JSON.parse(
        await readFile(join(controlDirectory, "backup-request.json"), "utf8"),
      ),
    ).toMatchObject({
      id: expect.any(String),
      requestedAt: expect.any(String),
    });
  });

  it("does not queue a backup before Google Drive is configured", async () => {
    await setupHousehold(app);
    const { cookie } = await unlockAdmin(app);
    await writeFile(
      join(controlDirectory, "backup-status.json"),
      `${JSON.stringify({
        ...configuredStatus,
        configured: false,
        state: "not_configured",
      })}\n`,
      "utf8",
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/system/backup",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "backup_not_configured" });
  });

  it("queues a browser-based Google Drive connection", async () => {
    await setupHousehold(app);
    const { cookie } = await unlockAdmin(app);
    await writeFile(
      join(controlDirectory, "backup-status.json"),
      `${JSON.stringify({
        ...configuredStatus,
        configured: false,
        state: "not_configured",
        recoveryKeyAvailable: false,
      })}\n`,
      "utf8",
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/system/backup/connect",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      configured: false,
      state: "connecting",
      authorizationUrl: null,
    });
    expect(
      JSON.parse(
        await readFile(
          join(controlDirectory, "backup-connect-request.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ id: expect.any(String), requestedAt: expect.any(String) });
  });

  it("downloads the recovery key only after admin unlock", async () => {
    await setupHousehold(app);
    const { cookie } = await unlockAdmin(app);
    await writeFile(
      join(controlDirectory, "backup-recovery-key.txt"),
      "AGE-SECRET-KEY-TEST\n",
      "utf8",
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/system/backup/recovery-key",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toContain(
      "daymark-backup-recovery-key.txt",
    );
    expect(response.body).toBe("AGE-SECRET-KEY-TEST\n");
  });
});
