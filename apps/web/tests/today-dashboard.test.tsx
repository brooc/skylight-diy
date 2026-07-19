import type { FastifyInstance } from "fastify";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { calendarSources, connectedAccounts, households } from "../../../packages/db/src/index";
import { encryptToken } from "../../api/src/modules/integrations/token-crypto";
import { dateKeyInTimeZone } from "../src/features/calendar/dateKeys";
import { TodayDashboard } from "../src/features/dashboard/TodayDashboard";
import { createTestQueryClient } from "./helpers/test-utils";
import {
  createRealApiApp,
  installRealApiFetch,
  resetRealApiApp
} from "./helpers/real-api";

describe("TodayDashboard", () => {
  let app: FastifyInstance;
  let restoreFetch: (() => void) | undefined;

  beforeAll(async () => {
    app = await createRealApiApp();
  });

  beforeEach(async () => {
    restoreFetch?.();
    await resetRealApiApp(app);
    restoreFetch = installRealApiFetch(app);
  });

  afterAll(async () => {
    restoreFetch?.();
    await app.close();
  });

  it("renders an honest empty calendar state and force-refreshes from the real API", async () => {
    const todayKey = dateKeyInTimeZone(new Date(), "America/Los_Angeles");
    const meal = await app.inject({
      method: "POST",
      url: "/api/meals/week/entries",
      payload: { date: todayKey, slot: "dinner", title: "Taco night" }
    });
    expect(meal.statusCode).toBe(201);

    renderTodayDashboard();

    expect(await screen.findByText("Test Household")).toBeInTheDocument();
    expect(await screen.findByText("🍽 Tonight: Taco night")).toBeInTheDocument();
    expect(await screen.findByText("No enabled calendar sources yet.")).toBeInTheDocument();
    expect(screen.queryByText("Camping Trip")).not.toBeInTheDocument();

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const requestCount = fetchSpy.mock.calls.length;
    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("No enabled calendar sources yet.");
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(requestCount);
    expect(String(fetchSpy.mock.calls.at(-1)?.[0])).toContain("refresh=true");
  });

  it("renders overlapping events in separate contained columns", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: household.id,
        provider: "google",
        providerAccountId: "google-overlap-test",
        displayName: "Google Calendar",
        encryptedAccessToken: encryptToken("test-access-token"),
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
      })
      .returning();
    await app.db.insert(calendarSources).values({
      householdId: household.id,
      connectedAccountId: account.id,
      provider: "google",
      externalCalendarId: "family@example.com",
      displayName: "Family",
      enabled: true,
      sortOrder: 0
    });

    const firstStart = new Date();
    firstStart.setHours(10, 0, 0, 0);
    const firstEnd = new Date(firstStart);
    firstEnd.setHours(11, 0, 0, 0);
    const secondStart = new Date(firstStart);
    secondStart.setMinutes(30);
    const secondEnd = new Date(firstStart);
    secondEnd.setHours(11, 30, 0, 0);

    restoreFetch?.();
    restoreFetch = installRealApiFetch(app, {
      externalFetch: async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: "overlap-one",
                summary: "Overlap one",
                start: { dateTime: firstStart.toISOString() },
                end: { dateTime: firstEnd.toISOString() }
              },
              {
                id: "overlap-two",
                summary: "Overlap two",
                start: { dateTime: secondStart.toISOString() },
                end: { dateTime: secondEnd.toISOString() }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    });

    renderTodayDashboard();

    const firstCard = (await screen.findByText("Overlap one")).closest("article");
    const secondCard = (await screen.findByText("Overlap two")).closest("article");
    expect(firstCard).toHaveAttribute("data-layout-column", "0");
    expect(firstCard).toHaveAttribute("data-layout-columns", "2");
    expect(firstCard).toHaveStyle({ width: "calc(50% - 8px)" });
    expect(firstCard).toHaveClass("overflow-hidden");
    expect(secondCard).toHaveAttribute("data-layout-column", "1");
    expect(secondCard).toHaveAttribute("data-layout-columns", "2");
    expect(secondCard).toHaveStyle({ left: "calc(50% + 4px)" });
  });

  it("opens add actions and navigates to the task quick-add route", async () => {
    renderTodayDashboard();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Add" }));
    await user.click(await screen.findByRole("button", { name: "Add task" }));

    expect(await screen.findByText("tasks route")).toBeInTheDocument();
  });

  it("opens add actions and navigates to the list quick-add route", async () => {
    renderTodayDashboard();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Add" }));
    await user.click(await screen.findByRole("button", { name: "Add list item" }));
    expect(await screen.findByText("lists route")).toBeInTheDocument();
  });

  it("opens add actions and navigates to the meal quick-add route", async () => {
    renderTodayDashboard();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Add" }));
    await user.click(await screen.findByRole("button", { name: "Add meal" }));
    expect(await screen.findByText("meals route")).toBeInTheDocument();
  });
});

function renderTodayDashboard(): void {
  render(
    <MemoryRouter initialEntries={["/today"]}>
      <QueryClientProvider client={createTestQueryClient()}>
        <Routes>
          <Route path="/today" element={<TodayDashboard />} />
          <Route path="/chores" element={<div>tasks route</div>} />
          <Route path="/import" element={<div>lists route</div>} />
          <Route path="/meals" element={<div>meals route</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}
