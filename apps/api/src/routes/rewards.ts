import { choreCompletions, chores, households, people, rewardRedemptions } from "@daymark/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const personParamsSchema = z.object({ personId: z.string().uuid() });
const historyQuerySchema = z.object({ personId: z.string().uuid().optional() });
const reduceBodySchema = z.object({
  amount: z.number().int().min(1).max(100_000),
  reason: z.string().trim().min(1).max(120)
});

function requireAdmin(request: { isAdminUnlocked: () => boolean }, reply: { status: (code: number) => { send: (body: unknown) => unknown } }): unknown {
  if (!request.isAdminUnlocked()) return reply.status(401).send({ error: "admin_unlock_required" });
}

export const rewardsRoutes: FastifyPluginAsync = async (app) => {
  const currentBalance = async (householdId: string, personId: string): Promise<number> => {
    const [earned] = await app.db.select({
      total: sql<number>`coalesce(sum(${choreCompletions.pointsAwarded}), 0)`
    }).from(choreCompletions).where(and(
      eq(choreCompletions.householdId, householdId),
      eq(choreCompletions.personId, personId)
    ));
    const [spent] = await app.db.select({
      total: sql<number>`coalesce(sum(${rewardRedemptions.pointsSpent}), 0)`
    }).from(rewardRedemptions).where(and(
      eq(rewardRedemptions.householdId, householdId),
      eq(rewardRedemptions.personId, personId)
    ));
    return Number(earned?.total ?? 0) - Number(spent?.total ?? 0);
  };

  app.get("/rewards/balances", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return { balances: [] };
    const members = await app.db.select({
      id: people.id,
      displayName: people.displayName,
      color: people.color
    }).from(people).where(eq(people.householdId, household.id));
    const earnedRows = await app.db.select({
      personId: choreCompletions.personId,
      total: sql<number>`coalesce(sum(${choreCompletions.pointsAwarded}), 0)`
    }).from(choreCompletions)
      .where(eq(choreCompletions.householdId, household.id))
      .groupBy(choreCompletions.personId);
    const spentRows = await app.db.select({
      personId: rewardRedemptions.personId,
      total: sql<number>`coalesce(sum(${rewardRedemptions.pointsSpent}), 0)`
    }).from(rewardRedemptions)
      .where(eq(rewardRedemptions.householdId, household.id))
      .groupBy(rewardRedemptions.personId);
    const earnedByPerson = new Map(earnedRows.filter((row) => Boolean(row.personId)).map((row) => [row.personId as string, Number(row.total)]));
    const spentByPerson = new Map(spentRows.map((row) => [row.personId, Number(row.total)]));
    return {
      balances: members.map((member) => {
        const earned = earnedByPerson.get(member.id) ?? 0;
        const spent = spentByPerson.get(member.id) ?? 0;
        return { personId: member.id, displayName: member.displayName, color: member.color, earnedPoints: earned, spentPoints: spent, balance: earned - spent };
      })
    };
  });

  app.get("/rewards/history", async (request, reply) => {
    const parsed = historyQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_query" });
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return { history: [] };
    const completionWhere = parsed.data.personId
      ? and(eq(choreCompletions.householdId, household.id), eq(choreCompletions.personId, parsed.data.personId))
      : eq(choreCompletions.householdId, household.id);
    const redemptionWhere = parsed.data.personId
      ? and(eq(rewardRedemptions.householdId, household.id), eq(rewardRedemptions.personId, parsed.data.personId))
      : eq(rewardRedemptions.householdId, household.id);
    const [completionRows, redemptionRows, members] = await Promise.all([
      app.db.select({
        id: choreCompletions.id,
        personId: choreCompletions.personId,
        title: chores.title,
        amount: choreCompletions.pointsAwarded,
        occurredAt: choreCompletions.completedAt,
        completedForDate: choreCompletions.completedForDate
      }).from(choreCompletions).innerJoin(chores, eq(choreCompletions.choreId, chores.id))
        .where(completionWhere).orderBy(desc(choreCompletions.completedAt)),
      app.db.select().from(rewardRedemptions).where(redemptionWhere).orderBy(desc(rewardRedemptions.redeemedAt)),
      app.db.select({ id: people.id, displayName: people.displayName }).from(people).where(eq(people.householdId, household.id))
    ]);
    const names = new Map(members.map((member) => [member.id, member.displayName]));
    const history = [
      ...completionRows.filter((row) => row.personId).map((row) => ({
        id: row.id,
        personId: row.personId,
        personName: names.get(row.personId!) ?? "Family member",
        title: row.title,
        amount: row.amount,
        type: "earned" as const,
        occurredAt: row.occurredAt.toISOString(),
        completedForDate: row.completedForDate
      })),
      ...redemptionRows.map((row) => ({
        id: row.id,
        personId: row.personId,
        personName: names.get(row.personId) ?? "Family member",
        title: row.title,
        amount: -row.pointsSpent,
        type: row.title === "Balance reset" ? "reset" as const : "spent" as const,
        occurredAt: row.redeemedAt.toISOString()
      }))
    ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    return { history: history.slice(0, 100) };
  });

  app.post("/rewards/:personId/reduce", async (request, reply) => {
    const unauthorized = requireAdmin(request, reply);
    if (unauthorized) return unauthorized;
    const params = personParamsSchema.safeParse(request.params);
    const body = reduceBodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: "invalid_point_reduction" });
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });
    const [person] = await app.db.select({ id: people.id }).from(people)
      .where(and(eq(people.id, params.data.personId), eq(people.householdId, household.id))).limit(1);
    if (!person) return reply.status(404).send({ error: "person_not_found" });
    const balance = await currentBalance(household.id, person.id);
    if (body.data.amount > balance) return reply.status(409).send({ error: "insufficient_points", balance });
    const [redemption] = await app.db.insert(rewardRedemptions).values({
      householdId: household.id,
      personId: person.id,
      title: body.data.reason,
      pointsSpent: body.data.amount
    }).returning();
    return reply.status(201).send({ redemption, balance: balance - body.data.amount });
  });

  app.post("/rewards/:personId/reset", async (request, reply) => {
    const unauthorized = requireAdmin(request, reply);
    if (unauthorized) return unauthorized;
    const params = personParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_person" });
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });
    const [person] = await app.db.select({ id: people.id }).from(people)
      .where(and(eq(people.id, params.data.personId), eq(people.householdId, household.id))).limit(1);
    if (!person) return reply.status(404).send({ error: "person_not_found" });
    const balance = await currentBalance(household.id, person.id);
    if (balance <= 0) return { reset: true, balance: 0 };
    await app.db.insert(rewardRedemptions).values({
      householdId: household.id,
      personId: person.id,
      title: "Balance reset",
      pointsSpent: balance
    });
    return { reset: true, balance: 0 };
  });
};
