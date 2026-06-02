import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetTestDb, setupHousehold } from "./helpers/test-app";

describe("meals and lists", () => {
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

  it("creates a meal plan entry and returns it in weekly meals", async () => {
    await setupHousehold(app);
    const date = new Date().toISOString().slice(0, 10);

    const createEntry = await app.inject({
      method: "POST",
      url: "/api/meals/week/entries",
      payload: {
        date,
        slot: "dinner",
        title: "Pasta night"
      }
    });
    expect(createEntry.statusCode).toBe(201);

    const weekMeals = await app.inject({
      method: "GET",
      url: "/api/meals/week"
    });
    expect(weekMeals.statusCode).toBe(200);
    const matchingDay = weekMeals.json().days.find((day: { date: string }) => day.date === date);
    expect(matchingDay.entries).toHaveLength(1);
    expect(matchingDay.entries[0].customTitle).toBe("Pasta night");
  });

  it("creates lists/items and toggles item completion", async () => {
    await setupHousehold(app);

    const createList = await app.inject({
      method: "POST",
      url: "/api/lists",
      payload: {
        title: "Grocery List"
      }
    });
    expect(createList.statusCode).toBe(201);
    const listId = createList.json().list.id;

    const createItem = await app.inject({
      method: "POST",
      url: `/api/lists/${listId}/items`,
      payload: {
        title: "Eggs"
      }
    });
    expect(createItem.statusCode).toBe(201);
    const itemId = createItem.json().item.id;

    const setComplete = await app.inject({
      method: "PATCH",
      url: `/api/lists/${listId}/items/${itemId}`,
      payload: { completed: true }
    });
    expect(setComplete.statusCode).toBe(200);

    const allLists = await app.inject({
      method: "GET",
      url: "/api/lists"
    });
    expect(allLists.statusCode).toBe(200);
    expect(allLists.json().lists).toHaveLength(1);
    expect(allLists.json().lists[0].items).toHaveLength(1);
    expect(allLists.json().lists[0].items[0].completed).toBe(true);
  });
});
