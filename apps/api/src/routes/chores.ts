import { choreCompletions, chores, households, people } from "@daymark/db";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const weekdaySchema = z.enum(["SU", "MO", "TU", "WE", "TH", "FR", "SA"]);

const dateQuerySchema = z.object({ date: dateSchema.optional() });
const completionBodySchema = z.object({ personId: z.string().uuid().optional() }).default({});
const taskFieldsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).nullable().optional(),
  points: z.number().int().min(1).max(100).default(1),
  assignedPersonId: z.string().uuid().nullable().optional(),
  frequency: z.enum(["daily", "weekly", "once"]).default("daily"),
  dueDate: dateSchema.nullable().optional(),
  weekdays: z.array(weekdaySchema).min(1).max(7).nullable().optional()
});
const createTaskBodySchema = taskFieldsSchema.superRefine((task, context) => {
  if (task.frequency === "once" && !task.dueDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dueDate"], message: "One-time tasks require a due date." });
  }
  if (task.frequency === "weekly" && !task.weekdays?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["weekdays"], message: "Weekly tasks require at least one day." });
  }
});
const updateTaskBodySchema = taskFieldsSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one task field is required."
);

type TaskFrequency = "daily" | "weekly" | "once";
type Weekday = z.infer<typeof weekdaySchema>;

const weekdayForDate: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function householdDateKey(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function taskIsDue(task: { frequency: string; dueDate: string | null; weekdays: unknown }, date: string): boolean {
  if (task.frequency === "daily") return true;
  if (task.frequency === "once") return Boolean(task.dueDate && task.dueDate <= date);
  const day = weekdayForDate[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
  return Array.isArray(task.weekdays) && task.weekdays.includes(day);
}

function normalizedSchedule(task: {
  frequency: TaskFrequency;
  dueDate?: string | null;
  weekdays?: Weekday[] | null;
}): { frequency: TaskFrequency; dueDate: string | null; weekdays: Weekday[] | null } | null {
  if (task.frequency === "once") {
    return task.dueDate ? { frequency: "once", dueDate: task.dueDate, weekdays: null } : null;
  }
  if (task.frequency === "weekly") {
    const weekdays = [...new Set(task.weekdays ?? [])];
    return weekdays.length ? { frequency: "weekly", dueDate: null, weekdays } : null;
  }
  return { frequency: "daily", dueDate: null, weekdays: null };
}

export const choresRoutes: FastifyPluginAsync = async (app) => {
  app.get("/chores/today", async (request, reply) => {
    const parsed = dateQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_query" });
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return { chores: [] };
    const targetDate = parsed.data.date ?? householdDateKey(household.timezone);
    const [taskRows, members, completionRows] = await Promise.all([
      app.db.select().from(chores)
        .where(and(eq(chores.householdId, household.id), eq(chores.active, true)))
        .orderBy(asc(chores.sortOrder), asc(chores.createdAt)),
      app.db.select().from(people).where(eq(people.householdId, household.id)),
      app.db.select().from(choreCompletions).where(eq(choreCompletions.householdId, household.id))
    ]);
    const peopleById = new Map(members.map((person) => [person.id, person]));
    const completionsByTask = new Map<string, typeof completionRows>();
    for (const completion of completionRows) {
      const rows = completionsByTask.get(completion.choreId) ?? [];
      rows.push(completion);
      completionsByTask.set(completion.choreId, rows);
    }
    const visible = taskRows.filter((task) => {
      const taskCompletions = completionsByTask.get(task.id) ?? [];
      if (task.frequency === "once") {
        return taskIsDue(task, targetDate) && (!taskCompletions.length || taskCompletions.some((item) => item.completedForDate === targetDate));
      }
      return taskIsDue(task, targetDate);
    });
    return {
      date: targetDate,
      chores: visible.map((task) => {
        const completion = (completionsByTask.get(task.id) ?? []).find((item) => item.completedForDate === targetDate);
        const assigned = task.assignedPersonId ? peopleById.get(task.assignedPersonId) : null;
        const completedBy = completion?.personId ? peopleById.get(completion.personId) : null;
        return {
          ...task,
          assignedPersonName: assigned?.displayName ?? null,
          assignedPersonColor: assigned?.color ?? null,
          completed: Boolean(completion),
          completedByPersonId: completion?.personId ?? null,
          completedByPersonName: completedBy?.displayName ?? null
        };
      })
    };
  });

  app.get("/chores/manage", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return { chores: [] };
    const [taskRows, members] = await Promise.all([
      app.db.select().from(chores).where(eq(chores.householdId, household.id)).orderBy(asc(chores.sortOrder), asc(chores.createdAt)),
      app.db.select().from(people).where(eq(people.householdId, household.id))
    ]);
    const peopleById = new Map(members.map((person) => [person.id, person]));
    return {
      chores: taskRows.map((task) => ({
        ...task,
        assignedPersonName: task.assignedPersonId ? peopleById.get(task.assignedPersonId)?.displayName ?? null : null
      }))
    };
  });

  app.post("/chores/:choreId/complete", async (request, reply) => {
    const query = dateQuerySchema.safeParse(request.query);
    const body = completionBodySchema.safeParse(request.body);
    if (!query.success || !body.success) return reply.status(400).send({ error: "invalid_completion" });
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });
    const choreId = (request.params as { choreId: string }).choreId;
    const [task] = await app.db.select().from(chores)
      .where(and(eq(chores.id, choreId), eq(chores.householdId, household.id))).limit(1);
    if (!task) return reply.status(404).send({ error: "chore_not_found" });
    const targetDate = query.data.date ?? householdDateKey(household.timezone);
    if (!task.active || !taskIsDue(task, targetDate)) return reply.status(409).send({ error: "task_not_due" });
    const personId = task.assignedPersonId ?? body.data.personId;
    if (!personId) return reply.status(400).send({ error: "completion_person_required" });
    const [person] = await app.db.select({ id: people.id }).from(people)
      .where(and(eq(people.id, personId), eq(people.householdId, household.id))).limit(1);
    if (!person) return reply.status(400).send({ error: "invalid_completion_person" });
    const [existingForDate] = await app.db.select().from(choreCompletions)
      .where(and(eq(choreCompletions.choreId, task.id), eq(choreCompletions.completedForDate, targetDate))).limit(1);
    if (!existingForDate && task.frequency === "once") {
      const [prior] = await app.db.select({ id: choreCompletions.id }).from(choreCompletions)
        .where(eq(choreCompletions.choreId, task.id)).limit(1);
      if (prior) return reply.status(409).send({ error: "one_time_task_completed" });
    }
    if (!existingForDate) {
      await app.db.insert(choreCompletions).values({
        householdId: household.id,
        choreId: task.id,
        personId,
        completedForDate: targetDate,
        pointsAwarded: task.points
      });
    }
    return { completed: true, date: targetDate, personId };
  });

  app.post("/chores", async (request, reply) => {
    const parsed = createTaskBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });
    const assignedPersonId = parsed.data.assignedPersonId ?? null;
    if (assignedPersonId) {
      const [assigned] = await app.db.select({ id: people.id }).from(people)
        .where(and(eq(people.id, assignedPersonId), eq(people.householdId, household.id))).limit(1);
      if (!assigned) return reply.status(400).send({ error: "invalid_assigned_person" });
    }
    const schedule = normalizedSchedule(parsed.data);
    if (!schedule) return reply.status(400).send({ error: "invalid_task_schedule" });
    const [created] = await app.db.insert(chores).values({
      householdId: household.id,
      assignedPersonId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      points: parsed.data.points,
      ...schedule,
      active: true
    }).returning();
    return reply.status(201).send({ chore: created });
  });

  app.patch("/chores/:choreId", async (request, reply) => {
    const parsed = updateTaskBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });
    const choreId = (request.params as { choreId: string }).choreId;
    const [existing] = await app.db.select().from(chores)
      .where(and(eq(chores.id, choreId), eq(chores.householdId, household.id))).limit(1);
    if (!existing) return reply.status(404).send({ error: "chore_not_found" });
    const assignedPersonId = parsed.data.assignedPersonId === undefined ? existing.assignedPersonId : parsed.data.assignedPersonId;
    if (assignedPersonId) {
      const [assigned] = await app.db.select({ id: people.id }).from(people)
        .where(and(eq(people.id, assignedPersonId), eq(people.householdId, household.id))).limit(1);
      if (!assigned) return reply.status(400).send({ error: "invalid_assigned_person" });
    }
    const schedule = normalizedSchedule({
      frequency: (parsed.data.frequency ?? existing.frequency) as TaskFrequency,
      dueDate: parsed.data.dueDate === undefined ? existing.dueDate : parsed.data.dueDate,
      weekdays: parsed.data.weekdays === undefined ? existing.weekdays as Weekday[] | null : parsed.data.weekdays
    });
    if (!schedule) return reply.status(400).send({ error: "invalid_task_schedule" });
    const [updated] = await app.db.update(chores).set({
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.points !== undefined ? { points: parsed.data.points } : {}),
      assignedPersonId,
      ...schedule,
      updatedAt: new Date()
    }).where(and(eq(chores.id, choreId), eq(chores.householdId, household.id))).returning();
    return { chore: updated };
  });

  app.delete("/chores/:choreId", async (request, reply) => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });
    const choreId = (request.params as { choreId: string }).choreId;
    const [archived] = await app.db.update(chores).set({ active: false, updatedAt: new Date() })
      .where(and(eq(chores.id, choreId), eq(chores.householdId, household.id))).returning({ id: chores.id });
    if (!archived) return reply.status(404).send({ error: "chore_not_found" });
    return { archived: true };
  });

  app.post("/chores/:choreId/restore", async (request, reply) => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });
    const choreId = (request.params as { choreId: string }).choreId;
    const [restored] = await app.db.update(chores).set({ active: true, updatedAt: new Date() })
      .where(and(eq(chores.id, choreId), eq(chores.householdId, household.id))).returning({ id: chores.id });
    if (!restored) return reply.status(404).send({ error: "chore_not_found" });
    return { restored: true };
  });

  app.delete("/chores/:choreId/complete", async (request, reply) => {
    const parsed = dateQuerySchema.safeParse(request.query);
    if (!parsed.success || !parsed.data.date) return reply.status(400).send({ error: "date_query_required" });
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });
    const choreId = (request.params as { choreId: string }).choreId;
    const [task] = await app.db.select({ id: chores.id }).from(chores)
      .where(and(eq(chores.id, choreId), eq(chores.householdId, household.id))).limit(1);
    if (!task) return reply.status(404).send({ error: "chore_not_found" });
    await app.db.delete(choreCompletions).where(and(
      eq(choreCompletions.householdId, household.id),
      eq(choreCompletions.choreId, choreId),
      eq(choreCompletions.completedForDate, parsed.data.date)
    ));
    return { completed: false, date: parsed.data.date };
  });
};
