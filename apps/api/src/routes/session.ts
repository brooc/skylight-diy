import { households } from "@skylight-diy/db";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { hashAdminPin, verifyAdminPin } from "../modules/auth/admin-pin";
import { clearAdminUnlockedCookie, setAdminUnlockedCookie } from "../plugins/session";

const unlockBodySchema = z.object({
  pin: z.string().regex(/^\d{4,}$/)
});

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  app.post("/session/unlock", async (request, reply) => {
    const parsed = unlockBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_unlock_payload",
        details: parsed.error.flatten()
      });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household || !household.adminPinHash) {
      return reply.status(400).send({
        error: "setup_not_completed"
      });
    }

    const isValidPin = verifyAdminPin(parsed.data.pin, household.adminPinHash);
    if (!isValidPin) {
      return reply.status(401).send({
        error: "invalid_pin"
      });
    }

    setAdminUnlockedCookie(reply);
    reply.header("Cache-Control", "no-store");
    return { unlocked: true };
  });

  app.post("/session/lock", async (request, reply) => {
    clearAdminUnlockedCookie(request, reply);
    reply.header("Cache-Control", "no-store");
    return { unlocked: false };
  });

  app.get("/session/current", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return {
      unlocked: request.isAdminUnlocked()
    };
  });

  app.post("/session/change-pin", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    const parsed = z
      .object({
        nextPin: z.string().regex(/^\d{4,}$/)
      })
      .safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_pin_payload",
        details: parsed.error.flatten()
      });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "household_not_found" });
    }

    await app.db
      .update(households)
      .set({
        adminPinHash: hashAdminPin(parsed.data.nextPin),
        adminPinSetAt: new Date()
      })
      .where(eq(households.id, household.id));

    return { updated: true };
  });
};
