import { households, mealPlanEntries, meals } from "@skylight-diy/db";
import { and, eq, gte, lte } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

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
};
