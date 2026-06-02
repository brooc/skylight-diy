import { sql } from "drizzle-orm";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { buildServer } from "../../src/server";

const TABLES = [
  "calendar_event_cache",
  "calendar_fetch_logs",
  "calendar_sources",
  "connected_accounts",
  "list_items",
  "lists",
  "meal_plan_entries",
  "meals",
  "reward_redemptions",
  "chore_completions",
  "chores",
  "people",
  "households"
];

type SetupResponse = {
  created: boolean;
  household: { id: string; name: string; timezone: string };
};

export async function createTestApp(): Promise<FastifyInstance> {
  const app = buildServer();
  await app.ready();
  return app;
}

export async function resetTestDb(app: FastifyInstance): Promise<void> {
  await app.db.execute(
    sql.raw(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`)
  );
}

export async function setupHousehold(
  app: FastifyInstance,
  input?: Partial<{
    householdName: string;
    timezone: string;
    adminName: string;
    adminPin: string;
    members: string[];
  }>
): Promise<SetupResponse> {
  const response = await app.inject({
    method: "POST",
    url: "/api/setup/complete",
    payload: {
      householdName: input?.householdName ?? "Test Household",
      timezone: input?.timezone ?? "America/Los_Angeles",
      adminName: input?.adminName ?? "Parent",
      adminPin: input?.adminPin ?? "1234",
      members: input?.members ?? ["Kiddo"]
    }
  });
  return response.json();
}

export async function unlockAdmin(
  app: FastifyInstance,
  pin = "1234"
): Promise<{ cookie: string; response: LightMyRequestResponse }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/session/unlock",
    payload: { pin }
  });

  return {
    cookie: buildCookieHeader(response),
    response
  };
}

export function buildCookieHeader(response: LightMyRequestResponse): string {
  const setCookie = response.headers["set-cookie"];
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return values.map((value) => value.split(";")[0]).join("; ");
}
