import { choreCompletions, households, people, rewardRedemptions } from "@daymark/db";
import { eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

export const rewardsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/rewards/balances", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return { balances: [] };
    }

    const members = await app.db
      .select({
        id: people.id,
        displayName: people.displayName
      })
      .from(people)
      .where(eq(people.householdId, household.id));

    const earnedRows = await app.db
      .select({
        personId: choreCompletions.personId,
        total: sql<number>`coalesce(sum(${choreCompletions.pointsAwarded}), 0)`
      })
      .from(choreCompletions)
      .where(eq(choreCompletions.householdId, household.id))
      .groupBy(choreCompletions.personId);

    const spentRows = await app.db
      .select({
        personId: rewardRedemptions.personId,
        total: sql<number>`coalesce(sum(${rewardRedemptions.pointsSpent}), 0)`
      })
      .from(rewardRedemptions)
      .where(eq(rewardRedemptions.householdId, household.id))
      .groupBy(rewardRedemptions.personId);

    const earnedByPerson = new Map(
      earnedRows
        .filter((row) => Boolean(row.personId))
        .map((row) => [row.personId as string, Number(row.total)])
    );

    const spentByPerson = new Map(
      spentRows.map((row) => [row.personId as string, Number(row.total)])
    );

    return {
      balances: members.map((member) => {
        const earned = earnedByPerson.get(member.id) ?? 0;
        const spent = spentByPerson.get(member.id) ?? 0;
        return {
          personId: member.id,
          displayName: member.displayName,
          earnedPoints: earned,
          spentPoints: spent,
          balance: earned - spent
        };
      })
    };
  });
};
