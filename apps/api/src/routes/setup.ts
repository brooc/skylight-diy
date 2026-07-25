import { households, people } from "@daymark/db";
import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../env";
import { hashAdminPin } from "../modules/auth/admin-pin";

const setupBodySchema = z.object({
  householdName: z.string().min(1).max(120),
  timezone: z.string().min(1).default("America/Los_Angeles"),
  adminName: z.string().min(1).max(120),
  adminPin: z.string().regex(/^\d{4,}$/),
  members: z.array(z.string().min(1).max(120)).max(12).default([]),
});

function hasValidSetupToken(value: string | string[] | undefined): boolean {
  if (!env.DAYMARK_SETUP_TOKEN) return true;
  if (typeof value !== "string") return false;

  const expected = Buffer.from(env.DAYMARK_SETUP_TOKEN);
  const received = Buffer.from(value);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export const setupRoutes: FastifyPluginAsync = async (app) => {
  app.get("/setup/status", async () => {
    const existing = await app.db.select().from(households).limit(1);
    const setupRequired = !existing[0]?.setupCompletedAt;

    return {
      setupRequired,
      pairingRequired: setupRequired && Boolean(env.DAYMARK_SETUP_TOKEN),
    };
  });

  app.get("/setup/pairing", async (request, reply) => {
    if (!hasValidSetupToken(request.headers["x-daymark-setup-token"])) {
      return reply.status(403).send({ error: "invalid_setup_token" });
    }

    const existing = await app.db.select().from(households).limit(1);
    if (existing[0]?.setupCompletedAt) {
      return reply.status(409).send({ error: "setup_already_completed" });
    }

    const setupUrl = new URL("/setup", env.APP_BASE_URL);
    if (env.DAYMARK_SETUP_TOKEN) {
      setupUrl.searchParams.set("pair", env.DAYMARK_SETUP_TOKEN);
    }

    return {
      setupUrl: setupUrl.toString(),
    };
  });

  app.post("/setup/complete", async (request, reply) => {
    if (!hasValidSetupToken(request.headers["x-daymark-setup-token"])) {
      return reply.status(403).send({ error: "invalid_setup_token" });
    }

    const parsed = setupBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_setup_payload",
        details: parsed.error.flatten(),
      });
    }

    const existing = await app.db.select().from(households).limit(1);
    if (existing.length > 0) {
      return {
        created: false,
        reason: "already_completed",
      };
    }

    const body = parsed.data;
    const adminPinHash = hashAdminPin(body.adminPin);
    const completedAt = new Date();

    const [household] = await app.db
      .insert(households)
      .values({
        name: body.householdName,
        timezone: body.timezone,
        adminPinHash,
        adminPinSetAt: completedAt,
        setupCompletedAt: completedAt,
      })
      .returning({
        id: households.id,
        name: households.name,
        timezone: households.timezone,
      });
    if (!household) {
      return reply.status(500).send({
        created: false,
        error: "failed_to_create_household",
      });
    }

    const names = [body.adminName, ...body.members];
    if (names.length > 0) {
      await app.db.insert(people).values(
        names.map((displayName, index) => ({
          householdId: household.id,
          displayName,
          color:
            index === 0 ? "#2563eb" : index % 2 === 0 ? "#0f766e" : "#9333ea",
          role: index === 0 ? "adult" : "child",
          sortOrder: index,
        })),
      );
    }

    return {
      created: true,
      household,
    };
  });
};
