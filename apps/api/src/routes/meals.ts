import { households, mealPlanEntries, meals } from "@daymark/db";
import { and, eq, gte, lte } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

function dateKeyInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0")
  ].join("-");
}

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createMealEntryBodySchema = z
  .object({
    date: dateKeySchema.optional(),
    dates: z.array(dateKeySchema).min(1).max(14).optional(),
    slot: z.enum(["breakfast", "lunch", "dinner"]).default("dinner"),
    // `title` keeps older clients compatible. New clients use mealName so the
    // meal is saved to the reusable library.
    title: z.string().trim().min(1).max(120).optional(),
    mealId: z.string().uuid().optional(),
    mealName: z.string().trim().min(1).max(120).optional()
  })
  .superRefine((value, context) => {
    if (!value.date && !value.dates) {
      context.addIssue({ code: "custom", message: "Choose at least one date.", path: ["dates"] });
    }
    if (!value.title && !value.mealId && !value.mealName) {
      context.addIssue({ code: "custom", message: "Choose or name a meal.", path: ["mealName"] });
    }
  });

export const mealsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/meals", async (_request, reply) => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });

    const library = await app.db
      .select({ id: meals.id, name: meals.name })
      .from(meals)
      .where(eq(meals.householdId, household.id))
      .orderBy(meals.name);

    return { meals: library };
  });

  app.get("/meals/week", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return { days: [] };
    }

    const startDateKey = dateKeyInTimeZone(new Date(), household.timezone);
    const endDateKey = shiftDateKey(startDateKey, 6);

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
          gte(mealPlanEntries.plannedDate, startDateKey),
          lte(mealPlanEntries.plannedDate, endDateKey)
        )
      );

    const byDate = new Map<string, (typeof entries)[number][]>();
    for (const entry of entries) {
      const key = entry.plannedDate;
      byDate.set(key, [...(byDate.get(key) ?? []), entry]);
    }

    const days = Array.from({ length: 7 }, (_, index) => {
      const dayKey = shiftDateKey(startDateKey, index);
      return {
        date: dayKey,
        entries: byDate.get(dayKey) ?? []
      };
    });

    return { days, timezone: household.timezone };
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

    const dateKeys = [...new Set(parsed.data.dates ?? [parsed.data.date!])];

    try {
      const result = await app.db.transaction(async (tx) => {
        let meal: { id: string; name: string } | undefined;

        if (parsed.data.mealId) {
          [meal] = await tx
            .select({ id: meals.id, name: meals.name })
            .from(meals)
            .where(
              and(
                eq(meals.id, parsed.data.mealId),
                eq(meals.householdId, household.id)
              )
            )
            .limit(1);
          if (!meal) throw new Error("meal_not_found");
        } else if (parsed.data.mealName) {
          const library = await tx
            .select({ id: meals.id, name: meals.name })
            .from(meals)
            .where(eq(meals.householdId, household.id));
          meal = library.find(
            (candidate) => candidate.name.trim().toLocaleLowerCase() === parsed.data.mealName!.toLocaleLowerCase()
          );
          if (!meal) {
            [meal] = await tx
              .insert(meals)
              .values({ householdId: household.id, name: parsed.data.mealName })
              .returning({ id: meals.id, name: meals.name });
          }
        }

        const created = await tx
          .insert(mealPlanEntries)
          .values(
            dateKeys.map((plannedDate) => ({
              householdId: household.id,
              plannedDate,
              slot: parsed.data.slot,
              mealId: meal?.id,
              customTitle: meal ? null : parsed.data.title
            }))
          )
          .returning({
            id: mealPlanEntries.id,
            plannedDate: mealPlanEntries.plannedDate,
            slot: mealPlanEntries.slot,
            customTitle: mealPlanEntries.customTitle
          });

        return { entries: created, meal };
      });

      return reply.status(201).send({ entry: result.entries[0], ...result });
    } catch (error) {
      if (error instanceof Error && error.message === "meal_not_found") {
        return reply.status(404).send({ error: "meal_not_found" });
      }
      throw error;
    }
  });

  app.delete("/meals/week/entries/:entryId", async (request, reply) => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });
    const entryId = (request.params as { entryId: string }).entryId;
    const [deleted] = await app.db
      .delete(mealPlanEntries)
      .where(
        and(
          eq(mealPlanEntries.id, entryId),
          eq(mealPlanEntries.householdId, household.id)
        )
      )
      .returning({ id: mealPlanEntries.id });
    if (!deleted) return reply.status(404).send({ error: "meal_entry_not_found" });
    return { deleted: true, entryId: deleted.id };
  });
};
