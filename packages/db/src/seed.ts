import { and, eq } from "drizzle-orm";
import { randomBytes, scryptSync } from "node:crypto";
import { db, pool } from "./client";
import { chores, households, mealPlanEntries, meals, people } from "./schema";

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
