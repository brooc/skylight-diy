import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetTestDb, setupHousehold } from "./helpers/test-app";

describe("chores and rewards", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetTestDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates chores, toggles completion, and updates reward balances", async () => {
    await setupHousehold(app);
    const household = await app.inject({ method: "GET", url: "/api/household/current" });
    const kiddo = household
      .json()
      .people.find((person: { displayName: string }) => person.displayName === "Kiddo");
    expect(kiddo).toBeTruthy();

    const createChore = await app.inject({
      method: "POST",
      url: "/api/chores",
      payload: {
        title: "Take out trash",
        points: 3,
        assignedPersonId: kiddo.id
      }
    });
    expect(createChore.statusCode).toBe(201);
    const createdChore = createChore.json().chore;

    const choresBefore = await app.inject({
      method: "GET",
      url: "/api/chores/today"
    });
    expect(choresBefore.statusCode).toBe(200);
    expect(choresBefore.json().chores).toHaveLength(1);
    expect(choresBefore.json().chores[0].completed).toBe(false);

    const markComplete = await app.inject({
      method: "POST",
      url: `/api/chores/${createdChore.id}/complete`
    });
    expect(markComplete.statusCode).toBe(200);

    const choresAfter = await app.inject({
      method: "GET",
      url: "/api/chores/today"
    });
    expect(choresAfter.json().chores[0].completed).toBe(true);

    const rewardsAfter = await app.inject({
      method: "GET",
      url: "/api/rewards/balances"
    });
    const kiddoBalance = rewardsAfter
      .json()
      .balances.find((row: { displayName: string }) => row.displayName === "Kiddo");
    expect(kiddoBalance.balance).toBe(3);

    const today = new Date().toISOString().slice(0, 10);
    const uncomplete = await app.inject({
      method: "DELETE",
      url: `/api/chores/${createdChore.id}/complete?date=${today}`
    });
    expect(uncomplete.statusCode).toBe(200);

    const rewardsFinal = await app.inject({
      method: "GET",
      url: "/api/rewards/balances"
    });
    const kiddoFinal = rewardsFinal
      .json()
      .balances.find((row: { displayName: string }) => row.displayName === "Kiddo");
    expect(kiddoFinal.balance).toBe(0);
  });
});
