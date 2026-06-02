import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetTestDb, setupHousehold } from "./helpers/test-app";

const missingUuid = "00000000-0000-0000-0000-000000000000";

describe("route validation and empty-state behavior", () => {
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

  it("validates setup payloads and treats repeated setup as already completed", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/api/setup/complete",
      payload: {
        householdName: "",
        timezone: "",
        adminName: "",
        adminPin: "12",
        members: []
      }
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toBe("invalid_setup_payload");

    const firstSetup = await setupHousehold(app);
    expect(firstSetup.created).toBe(true);

    const repeated = await app.inject({
      method: "POST",
      url: "/api/setup/complete",
      payload: {
        householdName: "Second Household",
        timezone: "UTC",
        adminName: "Admin",
        adminPin: "2468",
        members: ["Other"]
      }
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toMatchObject({
      created: false,
      reason: "already_completed"
    });
  });

  it("returns empty household-dependent collections before setup", async () => {
    const household = await app.inject({ method: "GET", url: "/api/household/current" });
    expect(household.statusCode).toBe(404);
    expect(household.json().error).toBe("setup_not_completed");

    const chores = await app.inject({ method: "GET", url: "/api/chores/today" });
    expect(chores.statusCode).toBe(200);
    expect(chores.json()).toEqual({ chores: [] });

    const meals = await app.inject({ method: "GET", url: "/api/meals/week" });
    expect(meals.statusCode).toBe(200);
    expect(meals.json()).toEqual({ days: [] });

    const lists = await app.inject({ method: "GET", url: "/api/lists" });
    expect(lists.statusCode).toBe(200);
    expect(lists.json()).toEqual({ lists: [] });
  });

  it("validates chore mutations and missing resources", async () => {
    const createBeforeSetup = await app.inject({
      method: "POST",
      url: "/api/chores",
      payload: { title: "Take out trash", points: 1 }
    });
    expect(createBeforeSetup.statusCode).toBe(404);
    expect(createBeforeSetup.json().error).toBe("setup_not_completed");

    await setupHousehold(app);

    const invalidCreate = await app.inject({
      method: "POST",
      url: "/api/chores",
      payload: { title: "", points: 0 }
    });
    expect(invalidCreate.statusCode).toBe(400);
    expect(invalidCreate.json().error).toBe("invalid_body");

    const invalidPerson = await app.inject({
      method: "POST",
      url: "/api/chores",
      payload: {
        title: "Feed dog",
        points: 2,
        assignedPersonId: missingUuid
      }
    });
    expect(invalidPerson.statusCode).toBe(400);
    expect(invalidPerson.json().error).toBe("invalid_assigned_person");

    const invalidCompleteQuery = await app.inject({
      method: "POST",
      url: `/api/chores/${missingUuid}/complete?date=not-a-date`
    });
    expect(invalidCompleteQuery.statusCode).toBe(400);
    expect(invalidCompleteQuery.json().error).toBe("invalid_query");

    const missingComplete = await app.inject({
      method: "POST",
      url: `/api/chores/${missingUuid}/complete`
    });
    expect(missingComplete.statusCode).toBe(404);
    expect(missingComplete.json().error).toBe("chore_not_found");

    const deleteWithoutDate = await app.inject({
      method: "DELETE",
      url: `/api/chores/${missingUuid}/complete`
    });
    expect(deleteWithoutDate.statusCode).toBe(400);
    expect(deleteWithoutDate.json().error).toBe("date_query_required");
  });

  it("validates meal plan mutations before and after setup", async () => {
    const beforeSetup = await app.inject({
      method: "POST",
      url: "/api/meals/week/entries",
      payload: {
        date: "2026-06-02",
        slot: "dinner",
        title: "Tacos"
      }
    });
    expect(beforeSetup.statusCode).toBe(404);
    expect(beforeSetup.json().error).toBe("setup_not_completed");

    await setupHousehold(app);

    const invalid = await app.inject({
      method: "POST",
      url: "/api/meals/week/entries",
      payload: {
        date: "not-a-date",
        slot: "midnight-snack",
        title: ""
      }
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toBe("invalid_body");
  });

  it("validates list and list-item mutations", async () => {
    const listBeforeSetup = await app.inject({
      method: "POST",
      url: "/api/lists",
      payload: { title: "Groceries" }
    });
    expect(listBeforeSetup.statusCode).toBe(404);
    expect(listBeforeSetup.json().error).toBe("setup_not_completed");

    await setupHousehold(app);

    const invalidList = await app.inject({
      method: "POST",
      url: "/api/lists",
      payload: { title: "" }
    });
    expect(invalidList.statusCode).toBe(400);
    expect(invalidList.json().error).toBe("invalid_body");

    const invalidItem = await app.inject({
      method: "POST",
      url: `/api/lists/${missingUuid}/items`,
      payload: { title: "" }
    });
    expect(invalidItem.statusCode).toBe(400);
    expect(invalidItem.json().error).toBe("invalid_body");

    const missingList = await app.inject({
      method: "POST",
      url: `/api/lists/${missingUuid}/items`,
      payload: { title: "Eggs" }
    });
    expect(missingList.statusCode).toBe(404);
    expect(missingList.json().error).toBe("list_not_found");

    const invalidPatch = await app.inject({
      method: "PATCH",
      url: `/api/lists/${missingUuid}/items/${missingUuid}`,
      payload: { completed: "yes" }
    });
    expect(invalidPatch.statusCode).toBe(400);
    expect(invalidPatch.json().error).toBe("invalid_body");

    const missingItem = await app.inject({
      method: "PATCH",
      url: `/api/lists/${missingUuid}/items/${missingUuid}`,
      payload: { completed: true }
    });
    expect(missingItem.statusCode).toBe(404);
    expect(missingItem.json().error).toBe("list_item_not_found");
  });
});
