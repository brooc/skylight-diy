import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../env";

const updateStatusSchema = z.object({
  state: z.enum(["idle", "queued", "running", "succeeded", "failed"]),
  installedVersion: z.string().nullable(),
  targetVersion: z.string().nullable(),
  message: z.string().nullable(),
  updatedAt: z.string()
});

export type UpdateStatus = z.infer<typeof updateStatusSchema> & {
  available: boolean;
};

function unavailableStatus(): UpdateStatus {
  return {
    available: false,
    state: "idle",
    installedVersion: null,
    targetVersion: null,
    message: null,
    updatedAt: new Date(0).toISOString()
  };
}

async function readStatus(directory: string): Promise<UpdateStatus> {
  try {
    const raw = await readFile(join(directory, "status.json"), "utf8");
    return { available: true, ...updateStatusSchema.parse(JSON.parse(raw)) };
  } catch {
    return {
      available: true,
      state: "idle",
      installedVersion: null,
      targetVersion: null,
      message: null,
      updatedAt: new Date(0).toISOString()
    };
  }
}

export const updateRoutes: FastifyPluginAsync = async (app) => {
  app.get("/system/update", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }
    if (!env.DAYMARK_UPDATE_DIR) return unavailableStatus();

    reply.header("Cache-Control", "no-store");
    return readStatus(env.DAYMARK_UPDATE_DIR);
  });

  app.post("/system/update", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }
    if (!env.DAYMARK_UPDATE_DIR) {
      return reply.status(404).send({ error: "appliance_updates_unavailable" });
    }

    await mkdir(env.DAYMARK_UPDATE_DIR, { recursive: true });
    const status = await readStatus(env.DAYMARK_UPDATE_DIR);
    if (status.state === "queued" || status.state === "running") {
      return reply.status(409).send({ error: "update_already_running" });
    }

    const requestedAt = new Date().toISOString();
    const queuedStatus = {
      state: "queued" as const,
      installedVersion: status.installedVersion,
      targetVersion: null,
      message: "Update requested",
      updatedAt: requestedAt
    };
    const temporaryStatusPath = join(env.DAYMARK_UPDATE_DIR, `.status-${randomUUID()}.json`);
    await writeFile(temporaryStatusPath, `${JSON.stringify(queuedStatus)}\n`, {
      mode: 0o600
    });
    await rename(temporaryStatusPath, join(env.DAYMARK_UPDATE_DIR, "status.json"));

    const requestPath = join(env.DAYMARK_UPDATE_DIR, "request.json");
    let requestFile;
    try {
      requestFile = await open(requestPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return reply.status(409).send({ error: "update_already_running" });
      }
      throw error;
    }
    try {
      await requestFile.writeFile(`${JSON.stringify({ id: randomUUID(), requestedAt })}\n`, "utf8");
    } finally {
      await requestFile.close();
    }

    return reply.status(202).send({ available: true, ...queuedStatus });
  });
};
