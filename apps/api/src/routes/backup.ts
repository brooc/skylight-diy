import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../env";

const backupStatusSchema = z.object({
  available: z.boolean().default(true),
  configured: z.boolean(),
  state: z.enum([
    "not_configured",
    "connecting",
    "idle",
    "queued",
    "running",
    "succeeded",
    "failed",
  ]),
  lastSuccessAt: z.string().nullable(),
  lastAttemptAt: z.string().nullable(),
  lastBackupName: z.string().nullable(),
  lastBackupBytes: z.number().int().nonnegative().nullable(),
  message: z.string().nullable(),
  recoveryKeyAvailable: z.boolean(),
  authorizationUrl: z.string().url().nullable().default(null),
  updatedAt: z.string(),
});

export type BackupStatus = z.infer<typeof backupStatusSchema>;

function unavailableStatus(): BackupStatus {
  return {
    available: false,
    configured: false,
    state: "not_configured",
    lastSuccessAt: null,
    lastAttemptAt: null,
    lastBackupName: null,
    lastBackupBytes: null,
    message: null,
    recoveryKeyAvailable: false,
    authorizationUrl: null,
    updatedAt: new Date(0).toISOString(),
  };
}

async function readStatus(directory: string): Promise<BackupStatus> {
  try {
    return backupStatusSchema.parse(
      JSON.parse(await readFile(join(directory, "backup-status.json"), "utf8")),
    );
  } catch {
    return {
      ...unavailableStatus(),
      available: true,
      message: "Google Drive backup has not been configured.",
    };
  }
}

export const backupRoutes: FastifyPluginAsync = async (app) => {
  app.get("/system/backup", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }
    reply.header("Cache-Control", "no-store");
    if (!env.DAYMARK_UPDATE_DIR) return unavailableStatus();
    return readStatus(env.DAYMARK_UPDATE_DIR);
  });

  app.post("/system/backup", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }
    if (!env.DAYMARK_UPDATE_DIR) {
      return reply.status(404).send({ error: "appliance_backup_unavailable" });
    }

    await mkdir(env.DAYMARK_UPDATE_DIR, { recursive: true });
    const status = await readStatus(env.DAYMARK_UPDATE_DIR);
    if (!status.configured) {
      return reply.status(409).send({ error: "backup_not_configured" });
    }
    if (status.state === "queued" || status.state === "running") {
      return reply.status(409).send({ error: "backup_already_running" });
    }

    const requestedAt = new Date().toISOString();
    const queuedStatus: BackupStatus = {
      ...status,
      state: "queued",
      lastAttemptAt: requestedAt,
      message: "Backup requested.",
      updatedAt: requestedAt,
    };
    const temporaryStatusPath = join(
      env.DAYMARK_UPDATE_DIR,
      `.backup-status-${randomUUID()}.json`,
    );
    await writeFile(temporaryStatusPath, `${JSON.stringify(queuedStatus)}\n`, {
      mode: 0o600,
    });
    await rename(
      temporaryStatusPath,
      join(env.DAYMARK_UPDATE_DIR, "backup-status.json"),
    );

    const requestPath = join(env.DAYMARK_UPDATE_DIR, "backup-request.json");
    let requestFile;
    try {
      requestFile = await open(requestPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return reply.status(409).send({ error: "backup_already_running" });
      }
      throw error;
    }
    try {
      await requestFile.writeFile(
        `${JSON.stringify({ id: randomUUID(), requestedAt })}\n`,
        "utf8",
      );
    } finally {
      await requestFile.close();
    }

    return reply.status(202).send(queuedStatus);
  });

  app.post("/system/backup/connect", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }
    if (!env.DAYMARK_UPDATE_DIR) {
      return reply.status(404).send({ error: "appliance_backup_unavailable" });
    }

    await mkdir(env.DAYMARK_UPDATE_DIR, { recursive: true });
    const status = await readStatus(env.DAYMARK_UPDATE_DIR);
    if (status.configured) {
      return reply.status(409).send({ error: "backup_already_configured" });
    }
    if (status.state === "connecting") {
      return reply.status(409).send({ error: "backup_connection_in_progress" });
    }

    const requestedAt = new Date().toISOString();
    const connectingStatus: BackupStatus = {
      ...status,
      available: true,
      configured: false,
      state: "connecting",
      message: "Starting Google Drive connection...",
      authorizationUrl: null,
      updatedAt: requestedAt,
    };
    const temporaryStatusPath = join(
      env.DAYMARK_UPDATE_DIR,
      `.backup-status-${randomUUID()}.json`,
    );
    await writeFile(
      temporaryStatusPath,
      `${JSON.stringify(connectingStatus)}\n`,
      { mode: 0o600 },
    );
    await rename(
      temporaryStatusPath,
      join(env.DAYMARK_UPDATE_DIR, "backup-status.json"),
    );

    const requestPath = join(
      env.DAYMARK_UPDATE_DIR,
      "backup-connect-request.json",
    );
    let requestFile;
    try {
      requestFile = await open(requestPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return reply
          .status(409)
          .send({ error: "backup_connection_in_progress" });
      }
      throw error;
    }
    try {
      await requestFile.writeFile(
        `${JSON.stringify({ id: randomUUID(), requestedAt })}\n`,
        "utf8",
      );
    } finally {
      await requestFile.close();
    }

    return reply.status(202).send(connectingStatus);
  });

  app.get("/system/backup/recovery-key", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }
    if (!env.DAYMARK_UPDATE_DIR) {
      return reply.status(404).send({ error: "recovery_key_unavailable" });
    }
    try {
      const recoveryKey = await readFile(
        join(env.DAYMARK_UPDATE_DIR, "backup-recovery-key.txt"),
        "utf8",
      );
      reply.header("Cache-Control", "no-store");
      reply.header(
        "Content-Disposition",
        'attachment; filename="daymark-backup-recovery-key.txt"',
      );
      return reply.type("text/plain; charset=utf-8").send(recoveryKey);
    } catch {
      return reply.status(404).send({ error: "recovery_key_unavailable" });
    }
  });
};
