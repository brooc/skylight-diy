import { randomUUID } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../env";

const deviceActionSchema = z.object({
  action: z.enum(["desktop", "reboot", "shutdown"]),
});

export const deviceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/system/device", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }
    reply.header("Cache-Control", "no-store");
    return { available: Boolean(env.DAYMARK_UPDATE_DIR) };
  });

  app.post("/system/device", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }
    if (!env.DAYMARK_UPDATE_DIR) {
      return reply
        .status(404)
        .send({ error: "appliance_device_controls_unavailable" });
    }

    const parsed = deviceActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "invalid_body", details: parsed.error.flatten() });
    }

    await mkdir(env.DAYMARK_UPDATE_DIR, { recursive: true });
    const requestPath = join(
      env.DAYMARK_UPDATE_DIR,
      "device-control-request.json",
    );
    let requestFile;
    try {
      requestFile = await open(requestPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return reply
          .status(409)
          .send({ error: "device_control_already_requested" });
      }
      throw error;
    }

    const requestedAt = new Date().toISOString();
    try {
      await requestFile.writeFile(
        `${JSON.stringify({
          id: randomUUID(),
          action: parsed.data.action,
          requestedAt,
        })}\n`,
        "utf8",
      );
    } finally {
      await requestFile.close();
    }

    return reply.status(202).send({
      accepted: true,
      action: parsed.data.action,
      requestedAt,
    });
  });
};
