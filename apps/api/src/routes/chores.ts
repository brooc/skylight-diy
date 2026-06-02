import { choreCompletions, chores, households, people } from "@daymark/db";
import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const completeQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
});

const createChoreBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  points: z.number().int().min(1).max(100).default(1),
  assignedPersonId: z.string().uuid().nullable().optional()
});

export const choresRoutes: FastifyPluginAsync = async (app) => {
  app.get("/chores/today", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return { chores: [] };
    }

    const choresList = await app.db
      .select({
        id: chores.id,
        title: chores.title,
        points: chores.points,
        frequency: chores.frequency,
        assignedPersonId: chores.assignedPersonId,
        assignedPersonName: people.displayName
      })
      .from(chores)
      .leftJoin(people, eq(chores.assignedPersonId, people.id))
      .where(and(eq(chores.householdId, household.id), eq(chores.active, true)));

    const today = new Date().toISOString().slice(0, 10);
    const completed = await app.db
      .select({
        choreId: choreCompletions.choreId
      })
      .from(choreCompletions)
      .where(
        and(
          eq(choreCompletions.householdId, household.id),
          eq(choreCompletions.completedForDate, today)
        )
      );

    const completedSet = new Set(completed.map((item) => item.choreId));

    return {
      chores: choresList.map((item) => ({
        ...item,
        completed: completedSet.has(item.id)
      }))
    };
  });

  app.post("/chores/:choreId/complete", async (request, reply) => {
    const parsed = completeQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_query",
        details: parsed.error.flatten()
      });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const choreId = (request.params as { choreId: string }).choreId;
    const [chore] = await app.db
      .select()
      .from(chores)
      .where(and(eq(chores.id, choreId), eq(chores.householdId, household.id)))
      .limit(1);

    if (!chore) {
      return reply.status(404).send({ error: "chore_not_found" });
    }

    const targetDate = parsed.data.date ?? new Date().toISOString().slice(0, 10);
    const [existing] = await app.db
      .select()
      .from(choreCompletions)
      .where(
        and(
          eq(choreCompletions.choreId, chore.id),
          eq(choreCompletions.completedForDate, targetDate)
        )
      )
      .limit(1);

    if (!existing) {
      await app.db.insert(choreCompletions).values({
        householdId: household.id,
        choreId: chore.id,
        personId: chore.assignedPersonId,
        completedForDate: targetDate,
        pointsAwarded: chore.points
      });
    }

    return { completed: true, date: targetDate };
  });

  app.post("/chores", async (request, reply) => {
    const parsed = createChoreBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_body",
        details: parsed.error.flatten()
      });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const assignedPersonId = parsed.data.assignedPersonId ?? null;
    if (assignedPersonId) {
      const [assignedPerson] = await app.db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, assignedPersonId), eq(people.householdId, household.id)))
        .limit(1);
      if (!assignedPerson) {
        return reply.status(400).send({ error: "invalid_assigned_person" });
      }
    }

    const [created] = await app.db
      .insert(chores)
      .values({
        householdId: household.id,
        assignedPersonId,
        title: parsed.data.title,
        points: parsed.data.points,
        frequency: "daily",
        active: true
      })
      .returning({
        id: chores.id,
        title: chores.title,
        points: chores.points,
        assignedPersonId: chores.assignedPersonId
      });

    return reply.status(201).send({ chore: created });
  });

  app.delete("/chores/:choreId/complete", async (request, reply) => {
    const parsed = completeQuerySchema.safeParse(request.query);
    if (!parsed.success || !parsed.data.date) {
      return reply.status(400).send({
        error: "date_query_required"
      });
    }

    const choreId = (request.params as { choreId: string }).choreId;
    await app.db
      .delete(choreCompletions)
      .where(
        and(
          eq(choreCompletions.choreId, choreId),
          eq(choreCompletions.completedForDate, parsed.data.date)
        )
      );

    return { completed: false, date: parsed.data.date };
  });
};
