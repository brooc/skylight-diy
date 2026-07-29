import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "../src/env";
import { diagnosticsRoutes } from "../src/routes/diagnostics";

describe("UI performance diagnostic routes", () => {
  let app: FastifyInstance;
  let diagnosticsDirectory: string;
  const originalUpdateDirectory = env.DAYMARK_UPDATE_DIR;

  beforeAll(async () => {
    diagnosticsDirectory = await mkdtemp(
      join(tmpdir(), "daymark-diagnostics-test-"),
    );
    env.DAYMARK_UPDATE_DIR = diagnosticsDirectory;
    app = Fastify();
    app.decorateRequest("isAdminUnlocked", function isAdminUnlocked() {
      return this.headers["x-test-admin"] === "true";
    });
    await app.register(diagnosticsRoutes, { prefix: "/api" });
    await app.ready();
  });

  beforeEach(async () => {
    await rm(join(diagnosticsDirectory, "ui-performance.jsonl"), {
      force: true,
    });
  });

  afterAll(async () => {
    env.DAYMARK_UPDATE_DIR = originalUpdateDirectory;
    await app.close();
    await rm(diagnosticsDirectory, { recursive: true, force: true });
  });

  it("accepts a bounded, privacy-safe browser timing batch", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/system/diagnostics/events",
      payload: {
        sessionId: "diagnostic-session",
        events: [
          {
            kind: "interaction",
            at: 1_785_293_600_000,
            route: "/today",
            action: "calendar:add-event",
            durationMs: 72.4,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(202);
    const entry = JSON.parse(
      await readFile(
        join(diagnosticsDirectory, "ui-performance.jsonl"),
        "utf8",
      ),
    );
    expect(entry).toMatchObject({
      sessionId: "diagnostic-session",
      kind: "interaction",
      route: "/today",
      action: "calendar:add-event",
      durationMs: 72.4,
    });
  });

  it("rejects arbitrary text fields", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/system/diagnostics/events",
      payload: {
        sessionId: "diagnostic-session",
        events: [
          {
            kind: "interaction",
            at: 1_785_293_600_000,
            route: "/today",
            action: "button",
            text: "Private calendar title",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("requires admin unlock to inspect or clear the log", async () => {
    const lockedStatus = await app.inject({
      method: "GET",
      url: "/api/system/diagnostics",
    });
    expect(lockedStatus.statusCode).toBe(401);

    const unlockedStatus = await app.inject({
      method: "GET",
      url: "/api/system/diagnostics",
      headers: { "x-test-admin": "true" },
    });
    expect(unlockedStatus.statusCode).toBe(200);
    expect(unlockedStatus.json()).toMatchObject({
      available: true,
      bytes: 0,
    });
  });
});
