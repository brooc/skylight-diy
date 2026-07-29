import {
  appendFile,
  mkdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../env";

const LOG_FILE = "ui-performance.jsonl";
const PREVIOUS_LOG_FILE = "ui-performance.previous.jsonl";
const MAX_LOG_BYTES = 512 * 1024;

const diagnosticEventSchema = z
  .object({
    kind: z.enum(["interaction", "long-task", "api"]),
    at: z.number().int().nonnegative(),
    route: z.string().min(1).max(160),
    action: z.string().min(1).max(120).optional(),
    durationMs: z.number().nonnegative().max(60_000).optional(),
    method: z.string().min(1).max(12).optional(),
    status: z.number().int().min(100).max(599).optional(),
  })
  .strict();

const diagnosticBatchSchema = z
  .object({
    sessionId: z.string().min(1).max(64),
    events: z.array(diagnosticEventSchema).min(1).max(50),
  })
  .strict();

let pendingWrite = Promise.resolve();

async function rotateIfNeeded(directory: string, incomingBytes: number) {
  const currentPath = join(directory, LOG_FILE);
  let currentBytes = 0;
  try {
    currentBytes = (await stat(currentPath)).size;
  } catch {
    // The first diagnostic batch creates the log.
  }
  if (currentBytes + incomingBytes <= MAX_LOG_BYTES) return;

  const previousPath = join(directory, PREVIOUS_LOG_FILE);
  await rm(previousPath, { force: true });
  try {
    await rename(currentPath, previousPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function appendBatch(
  directory: string,
  batch: z.infer<typeof diagnosticBatchSchema>,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  const receivedAt = Date.now();
  const serialized = batch.events
    .map((event) =>
      JSON.stringify({
        receivedAt,
        sessionId: batch.sessionId,
        ...event,
      }),
    )
    .join("\n")
    .concat("\n");
  await rotateIfNeeded(directory, Buffer.byteLength(serialized));
  await appendFile(join(directory, LOG_FILE), serialized, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export const diagnosticsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/system/diagnostics/events", async (request, reply) => {
    if (!env.DAYMARK_UPDATE_DIR) {
      return reply.status(404).send({ error: "diagnostics_unavailable" });
    }
    const parsed = diagnosticBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "invalid_body", details: parsed.error.flatten() });
    }

    const write = pendingWrite
      .catch(() => undefined)
      .then(() => appendBatch(env.DAYMARK_UPDATE_DIR!, parsed.data));
    pendingWrite = write;
    await write;
    return reply.status(202).send({ accepted: true });
  });

  app.get("/system/diagnostics", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }
    if (!env.DAYMARK_UPDATE_DIR) {
      return { available: false, bytes: 0, updatedAt: null };
    }
    try {
      const details = await stat(join(env.DAYMARK_UPDATE_DIR, LOG_FILE));
      return {
        available: true,
        bytes: details.size,
        updatedAt: details.mtime.toISOString(),
      };
    } catch {
      return { available: true, bytes: 0, updatedAt: null };
    }
  });

  app.delete("/system/diagnostics", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }
    if (!env.DAYMARK_UPDATE_DIR) {
      return reply.status(404).send({ error: "diagnostics_unavailable" });
    }
    await Promise.all([
      rm(join(env.DAYMARK_UPDATE_DIR, LOG_FILE), { force: true }),
      rm(join(env.DAYMARK_UPDATE_DIR, PREVIOUS_LOG_FILE), { force: true }),
    ]);
    return { cleared: true };
  });
};
