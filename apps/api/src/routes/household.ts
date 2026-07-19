import { households, people } from "@daymark/db";
import { and, asc, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const personFieldsSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(["adult", "child"]),
  color: z.string().regex(/^#[0-9a-f]{6}$/i)
});

const updateHouseholdSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    weekStartsOn: z.enum(["sunday", "monday"]).optional(),
    locationName: z.string().trim().min(1).max(120).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    timezone: z
      .string()
      .trim()
      .min(1)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Invalid IANA timezone")
      .optional()
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.weekStartsOn !== undefined ||
      value.timezone !== undefined ||
      value.locationName !== undefined ||
      value.latitude !== undefined ||
      value.longitude !== undefined
  )
  .refine(
    (value) =>
      (value.latitude === undefined && value.longitude === undefined) ||
      (value.latitude === null && value.longitude === null) ||
      (typeof value.latitude === "number" && typeof value.longitude === "number"),
    "Latitude and longitude must be provided together"
  );

const updatePersonSchema = personFieldsSchema.partial().refine(
  (value) => Object.keys(value).length > 0
);

function requireAdmin(request: { isAdminUnlocked: () => boolean }, reply: { status: (code: number) => { send: (body: unknown) => unknown } }): unknown {
  if (!request.isAdminUnlocked()) {
    return reply.status(401).send({ error: "admin_unlock_required" });
  }
}

export const householdRoutes: FastifyPluginAsync = async (app) => {
  app.get("/household/current", async (_request, reply) => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const members = await app.db
      .select()
      .from(people)
      .where(eq(people.householdId, household.id))
      .orderBy(asc(people.sortOrder), asc(people.createdAt));

    return {
      household,
      people: members
    };
  });

  app.patch("/household/current", async (request, reply) => {
    const unauthorized = requireAdmin(request, reply);
    if (unauthorized) return unauthorized;

    const parsed = updateHouseholdSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_household_payload" });
    }
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });

    const [updated] = await app.db
      .update(households)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(households.id, household.id))
      .returning();
    return { household: updated };
  });

  app.post("/household/people", async (request, reply) => {
    const unauthorized = requireAdmin(request, reply);
    if (unauthorized) return unauthorized;

    const parsed = personFieldsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_person_payload" });
    }
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });
    const [lastPerson] = await app.db
      .select({ sortOrder: people.sortOrder })
      .from(people)
      .where(eq(people.householdId, household.id))
      .orderBy(desc(people.sortOrder))
      .limit(1);
    const [person] = await app.db
      .insert(people)
      .values({
        householdId: household.id,
        ...parsed.data,
        sortOrder: (lastPerson?.sortOrder ?? -1) + 1
      })
      .returning();
    return reply.status(201).send({ person });
  });

  app.patch("/household/people/:personId", async (request, reply) => {
    const unauthorized = requireAdmin(request, reply);
    if (unauthorized) return unauthorized;

    const personId = z.string().uuid().safeParse(
      (request.params as { personId?: string }).personId
    );
    const body = updatePersonSchema.safeParse(request.body);
    if (!personId.success || !body.success) {
      return reply.status(400).send({ error: "invalid_person_payload" });
    }
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });
    const [person] = await app.db
      .update(people)
      .set({ ...body.data, updatedAt: new Date() })
      .where(and(eq(people.id, personId.data), eq(people.householdId, household.id)))
      .returning();
    if (!person) return reply.status(404).send({ error: "person_not_found" });
    return { person };
  });
};
