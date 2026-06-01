import { and, eq } from "drizzle-orm";
import { randomBytes, scryptSync } from "node:crypto";
import { db, pool } from "./client";
import {
  chores,
  households,
  listItems,
  lists,
  mealPlanEntries,
  meals,
  people
} from "./schema";

function hashAdminPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `v1:${salt.toString("base64")}:${hash.toString("base64")}`;
}

async function run(): Promise<void> {
  const existingHouseholds = await db.select().from(households).limit(1);
  if (existingHouseholds.length > 0) {
    return;
  }

  const [household] = await db
    .insert(households)
    .values({
      name: "Demo Household",
      timezone: "America/Los_Angeles",
      setupCompletedAt: new Date(),
      adminPinSetAt: new Date(),
      adminPinHash: hashAdminPin("1234")
    })
    .returning({ id: households.id });

  const [adult, child] = await db
    .insert(people)
    .values([
      {
        householdId: household.id,
        displayName: "Parent",
        color: "#2563eb",
        role: "adult",
        sortOrder: 0
      },
      {
        householdId: household.id,
        displayName: "Kiddo",
        color: "#16a34a",
        role: "child",
        sortOrder: 1
      }
    ])
    .returning({ id: people.id, displayName: people.displayName });

  const [takeOutTrash, feedDog] = await db
    .insert(chores)
    .values([
      {
        householdId: household.id,
        assignedPersonId: child.id,
        title: "Take out trash",
        points: 2,
        frequency: "weekly",
        sortOrder: 0
      },
      {
        householdId: household.id,
        assignedPersonId: adult.id,
        title: "Feed dog",
        points: 1,
        frequency: "daily",
        sortOrder: 1
      }
    ])
    .returning({ id: chores.id, title: chores.title });

  const [tacos, pasta] = await db
    .insert(meals)
    .values([
      {
        householdId: household.id,
        name: "Taco night"
      },
      {
        householdId: household.id,
        name: "Pasta"
      }
    ])
    .returning({ id: meals.id, name: meals.name });

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);

  await db.insert(mealPlanEntries).values([
    {
      householdId: household.id,
      mealId: tacos.id,
      plannedDate: toDateOnly(today),
      slot: "dinner"
    },
    {
      householdId: household.id,
      mealId: pasta.id,
      plannedDate: toDateOnly(tomorrow),
      slot: "dinner"
    }
  ]);

  const [groceryList, packingList, todoList, travelList] = await db
    .insert(lists)
    .values([
      {
        householdId: household.id,
        title: "Grocery List",
        color: "#f6eee1",
        sortOrder: 0
      },
      {
        householdId: household.id,
        title: "Packing List",
        color: "#f7e5ea",
        sortOrder: 1
      },
      {
        householdId: household.id,
        title: "To-Do",
        color: "#eeecf5",
        sortOrder: 2
      },
      {
        householdId: household.id,
        title: "Travel Bucket List",
        color: "#d9eff0",
        sortOrder: 3
      }
    ])
    .returning({ id: lists.id, title: lists.title });

  await db.insert(listItems).values([
    { householdId: household.id, listId: groceryList.id, title: "Eggs", sortOrder: 0 },
    { householdId: household.id, listId: groceryList.id, title: "Milk", sortOrder: 1 },
    { householdId: household.id, listId: groceryList.id, title: "Bread", sortOrder: 2 },
    { householdId: household.id, listId: groceryList.id, title: "Apples", sortOrder: 3 },
    { householdId: household.id, listId: groceryList.id, title: "Lettuce", sortOrder: 4 },
    { householdId: household.id, listId: groceryList.id, title: "Hot Sauce", sortOrder: 5 },
    { householdId: household.id, listId: packingList.id, title: "Shirts x5", sortOrder: 0 },
    { householdId: household.id, listId: packingList.id, title: "Jeans x2", sortOrder: 1 },
    { householdId: household.id, listId: packingList.id, title: "Undies x7", sortOrder: 2 },
    { householdId: household.id, listId: packingList.id, title: "Swimsuits x3", sortOrder: 3 },
    { householdId: household.id, listId: packingList.id, title: "Towel x2", sortOrder: 4 },
    { householdId: household.id, listId: packingList.id, title: "Sunscreen", sortOrder: 5 },
    { householdId: household.id, listId: todoList.id, title: "Pack for trip", sortOrder: 0 },
    { householdId: household.id, listId: todoList.id, title: "Pet sitter", sortOrder: 1 },
    { householdId: household.id, listId: todoList.id, title: "Stop mail", sortOrder: 2 },
    { householdId: household.id, listId: todoList.id, title: "Copy of keys", sortOrder: 3 },
    { householdId: household.id, listId: todoList.id, title: "Set up sprinkler", sortOrder: 4 },
    { householdId: household.id, listId: todoList.id, title: "Snacks!", sortOrder: 5 },
    { householdId: household.id, listId: travelList.id, title: "Japan", sortOrder: 0 },
    { householdId: household.id, listId: travelList.id, title: "Ireland", sortOrder: 1 },
    { householdId: household.id, listId: travelList.id, title: "Croatia", sortOrder: 2 },
    { householdId: household.id, listId: travelList.id, title: "Spain", sortOrder: 3 },
    { householdId: household.id, listId: travelList.id, title: "Costa Rica", sortOrder: 4 },
    { householdId: household.id, listId: travelList.id, title: "Greece", sortOrder: 5 }
  ]);

  const sanityCheck = await db
    .select({
      chore: chores.title,
      person: people.displayName
    })
    .from(chores)
    .leftJoin(people, eq(chores.assignedPersonId, people.id))
    .where(
      and(eq(chores.householdId, household.id), eq(chores.active, true))
    );

  // eslint-disable-next-line no-console
  console.log("Seeded household with chores:", sanityCheck, takeOutTrash, feedDog);
}

run()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Seed failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
