import { households, mealPlanEntries, meals } from "@daymark/db";
import { and, eq, gte, lte } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const createMealEntryBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(["breakfast", "lunch", "dinner"]).default("dinner"),
  title: z.string().trim().min(1).max(120)
});

export const mealsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/meals/week", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return { days: [] };
    }

    const start = new Date();
    const startDate = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
    );
    const endDate = new Date(startDate);
    endDate.setUTCDate(startDate.getUTCDate() + 6);

    const entries = await app.db
      .select({
        id: mealPlanEntries.id,
        plannedDate: mealPlanEntries.plannedDate,
        slot: mealPlanEntries.slot,
        customTitle: mealPlanEntries.customTitle,
        notes: mealPlanEntries.notes,
        mealName: meals.name
      })
      .from(mealPlanEntries)
      .leftJoin(meals, eq(mealPlanEntries.mealId, meals.id))
      .where(
        and(
          eq(mealPlanEntries.householdId, household.id),
          gte(mealPlanEntries.plannedDate, toDateOnly(startDate)),
          lte(mealPlanEntries.plannedDate, toDateOnly(endDate))
        )
      );

    const byDate = new Map<string, (typeof entries)[number][]>();
    for (const entry of entries) {
      const key = entry.plannedDate;
      byDate.set(key, [...(byDate.get(key) ?? []), entry]);
    }

    const days = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(startDate);
      day.setUTCDate(startDate.getUTCDate() + index);
      const dayKey = toDateOnly(day);
      return {
        date: dayKey,
        entries: byDate.get(dayKey) ?? []
      };
    });

    return { days };
  });

  app.post("/meals/week/entries", async (request, reply) => {
    const parsed = createMealEntryBodySchema.safeParse(request.body);
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

    const [created] = await app.db
      .insert(mealPlanEntries)
      .values({
        householdId: household.id,
        plannedDate: parsed.data.date,
        slot: parsed.data.slot,
        customTitle: parsed.data.title
      })
      .returning({
        id: mealPlanEntries.id,
        plannedDate: mealPlanEntries.plannedDate,
        slot: mealPlanEntries.slot,
        customTitle: mealPlanEntries.customTitle
      });

    return reply.status(201).send({ entry: created });
  });
};
