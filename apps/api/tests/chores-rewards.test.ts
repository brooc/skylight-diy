import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetTestDb, setupHousehold, unlockAdmin } from "./helpers/test-app";

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
    const { cookie } = await unlockAdmin(app);

    const createChore = await app.inject({
      method: "POST",
      url: "/api/chores",
      headers: { cookie },
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
    expect(choresBefore.json().chores[0].assignedPersonColor).toBe(kiddo.color);

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
    expect(kiddoBalance.color).toBe(kiddo.color);

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

  it("schedules, edits, archives, restores, spends, resets, and preserves point history", async () => {
    await setupHousehold(app, { timezone: "America/Los_Angeles" });
    const { cookie } = await unlockAdmin(app);
    const household = await app.inject({ method: "GET", url: "/api/household/current" });
    const kiddo = household.json().people.find((person: { displayName: string }) => person.displayName === "Kiddo");

    const created = await app.inject({
      method: "POST",
      url: "/api/chores",
      headers: { cookie },
      payload: { title: "Practice piano", points: 5, assignedPersonId: kiddo.id, frequency: "weekly", weekdays: ["MO", "WE"] }
    });
    expect(created.statusCode).toBe(201);
    const task = created.json().chore;
    const monday = await app.inject({ method: "GET", url: "/api/chores/today?date=2026-07-20" });
    const tuesday = await app.inject({ method: "GET", url: "/api/chores/today?date=2026-07-21" });
    expect(monday.json().chores.map((item: { id: string }) => item.id)).toContain(task.id);
    expect(tuesday.json().chores.map((item: { id: string }) => item.id)).not.toContain(task.id);

    await app.inject({ method: "POST", url: `/api/chores/${task.id}/complete?date=2026-07-20` });
    const edited = await app.inject({
      method: "PATCH",
      url: `/api/chores/${task.id}`,
      headers: { cookie },
      payload: { title: "Practice keyboard", points: 9 }
    });
    expect(edited.statusCode).toBe(200);
    const afterEdit = await app.inject({ method: "GET", url: "/api/rewards/balances" });
    expect(afterEdit.json().balances.find((row: { personId: string }) => row.personId === kiddo.id).balance).toBe(5);

    const archived = await app.inject({ method: "DELETE", url: `/api/chores/${task.id}`, headers: { cookie } });
    expect(archived.statusCode).toBe(200);
    const afterArchive = await app.inject({ method: "GET", url: "/api/rewards/balances" });
    expect(afterArchive.json().balances.find((row: { personId: string }) => row.personId === kiddo.id).balance).toBe(5);
    expect((await app.inject({ method: "POST", url: `/api/chores/${task.id}/restore`, headers: { cookie } })).statusCode).toBe(200);

    const spent = await app.inject({ method: "POST", url: `/api/rewards/${kiddo.id}/reduce`, headers: { cookie }, payload: { amount: 2, reason: "Screen time" } });
    expect(spent.statusCode).toBe(201);
    expect(spent.json().balance).toBe(3);
    const overspend = await app.inject({ method: "POST", url: `/api/rewards/${kiddo.id}/reduce`, headers: { cookie }, payload: { amount: 4, reason: "Too much" } });
    expect(overspend.statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: `/api/rewards/${kiddo.id}/reset`, headers: { cookie } })).statusCode).toBe(200);
    const finalBalance = await app.inject({ method: "GET", url: "/api/rewards/balances" });
    expect(finalBalance.json().balances.find((row: { personId: string }) => row.personId === kiddo.id).balance).toBe(0);
    const history = await app.inject({ method: "GET", url: `/api/rewards/history?personId=${kiddo.id}` });
    expect(history.json().history.map((item: { type: string }) => item.type)).toEqual(expect.arrayContaining(["earned", "spent", "reset"]));
  });

  it("requires a family member when anyone completes a one-time task", async () => {
    await setupHousehold(app);
    const { cookie } = await unlockAdmin(app);
    const household = await app.inject({ method: "GET", url: "/api/household/current" });
    const kiddo = household.json().people.find((person: { displayName: string }) => person.displayName === "Kiddo");
    const created = await app.inject({ method: "POST", url: "/api/chores", headers: { cookie }, payload: { title: "Return book", points: 2, frequency: "once", dueDate: "2026-07-19" } });
    const task = created.json().chore;
    expect((await app.inject({ method: "GET", url: "/api/chores/today?date=2026-07-20" })).json().chores).toHaveLength(1);
    expect((await app.inject({ method: "POST", url: `/api/chores/${task.id}/complete?date=2026-07-20` })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `/api/chores/${task.id}/complete?date=2026-07-20`, payload: { personId: kiddo.id } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/chores/today?date=2026-07-21" })).json().chores).toHaveLength(0);
  });
});
