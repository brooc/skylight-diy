import { households, people } from "@skylight-diy/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { hashAdminPin } from "../modules/auth/admin-pin";

const setupBodySchema = z.object({
  householdName: z.string().min(1).max(120),
  timezone: z.string().min(1).default("America/Los_Angeles"),
  adminName: z.string().min(1).max(120),
  adminPin: z.string().regex(/^\d{4,}$/),
  members: z.array(z.string().min(1).max(120)).max(12).default([])
});

export const setupRoutes: FastifyPluginAsync = async (app) => {
  app.get("/setup/status", async () => {
    const existing = await app.db.select().from(households).limit(1);
    const setupRequired = !existing[0]?.setupCompletedAt;

    return {
      setupRequired
    };
  });

  app.post("/setup/complete", async (request, reply) => {
    const parsed = setupBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_setup_payload",
        details: parsed.error.flatten()
      });
    }

    const existing = await app.db.select().from(households).limit(1);
    if (existing.length > 0) {
      return {
        created: false,
        reason: "already_completed"
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
        setupCompletedAt: completedAt
      })
      .returning({
        id: households.id,
        name: households.name,
        timezone: households.timezone
      });
    if (!household) {
      return reply.status(500).send({
        created: false,
        error: "failed_to_create_household"
      });
    }

    const names = [body.adminName, ...body.members];
    if (names.length > 0) {
      await app.db.insert(people).values(
        names.map((displayName, index) => ({
          householdId: household.id,
          displayName,
          color:
            index === 0
              ? "#2563eb"
              : index % 2 === 0
                ? "#0f766e"
                : "#9333ea",
          role: index === 0 ? "adult" : "child",
          sortOrder: index
        }))
      );
    }

    return {
      created: true,
      household
    };
  });
};
