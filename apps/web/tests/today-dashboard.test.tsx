import type { FastifyInstance } from "fastify";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { calendarSources, connectedAccounts, households } from "../../../packages/db/src/index";
import { encryptToken } from "../../api/src/modules/integrations/token-crypto";
import { dateKeyInTimeZone } from "../src/features/calendar/dateKeys";
import { calendarHourRange, TodayDashboard } from "../src/features/dashboard/TodayDashboard";
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

  it("expands the visible day only when events fall outside normal hours", () => {
    expect(calendarHourRange([])).toEqual({ startHour: 6, endHour: 22 });
    expect(
      calendarHourRange([
        { startHour: 1.5, durationHours: 1 },
        { startHour: 23, durationHours: 1 }
      ])
    ).toEqual({ startHour: 1, endHour: 23 });
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

  it("ticks the visible clock every second without polling the calendar", async () => {
    const intervalSpy = vi.spyOn(window, "setInterval").mockReturnValue(1);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderTodayDashboard();

    expect(await screen.findByText("Test Household")).toBeInTheDocument();
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 1_000);
    expect(document.querySelector("time")?.getAttribute("datetime")).toBeTruthy();
    expect(
      fetchSpy.mock.calls.filter(([input]) => String(input).includes("/api/calendar/events"))
    ).toHaveLength(1);
  });

  it("shows a local weather icon with today's high and low", async () => {
    await app.db.update(households).set({
      locationName: "Campbell",
      latitude: 37.2872,
      longitude: -121.95
    });
    restoreFetch?.();
    restoreFetch = installRealApiFetch(app, {
      externalFetch: async () =>
        new Response(
          JSON.stringify({
            current: { temperature_2m: 59, weather_code: 2, is_day: 0 },
            current_units: { temperature_2m: "°F" },
            daily: {
              temperature_2m_max: [82],
              temperature_2m_min: [56]
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    });

    renderTodayDashboard();

    const weather = await screen.findByLabelText("Partly cloudy: high 82°, low 56°");
    expect(within(weather).getByText("82°")).toBeInTheDocument();
    expect(within(weather).getByText("56°")).toBeInTheDocument();
    expect(weather.querySelector("img")?.getAttribute("src")).toContain(
      "partly-cloudy-night"
    );
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
    const halfHourStart = new Date(firstStart);
    halfHourStart.setHours(12, 30, 0, 0);
    const halfHourEnd = new Date(halfHourStart);
    halfHourEnd.setMinutes(halfHourStart.getMinutes() + 30);

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
              },
              {
                id: "half-hour",
                summary: "Half-hour alignment",
                start: { dateTime: halfHourStart.toISOString() },
                end: { dateTime: halfHourEnd.toISOString() }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    });

    renderTodayDashboard();

    const firstCard = (await screen.findByText("Overlap one")).closest("button");
    const secondCard = (await screen.findByText("Overlap two")).closest("button");
    const halfHourCard = (await screen.findByText("Half-hour alignment")).closest("button");
    expect(firstCard).toHaveAttribute("data-layout-column", "0");
    expect(firstCard).toHaveAttribute("data-layout-columns", "2");
    expect(firstCard).toHaveStyle({ width: "calc(50% - 8px)" });
    expect(firstCard).toHaveClass("overflow-hidden");
    expect(secondCard).toHaveAttribute("data-layout-column", "1");
    expect(secondCard).toHaveAttribute("data-layout-columns", "2");
    expect(secondCard).toHaveStyle({ left: "calc(50% + 4px)" });
    expect(halfHourCard).toHaveAttribute("data-event-density", "compact");
    expect(halfHourCard).toHaveStyle({ top: "48px", height: "42px" });
    expect(within(halfHourCard!).getByText(/12:30–1:00/)).toBeInTheDocument();
    expect(document.querySelectorAll('[data-half-hour-line="true"]').length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Filter" }));
    const familyFilter = screen.getByRole("checkbox", { name: "Family" });
    expect(familyFilter).not.toBeChecked();
    await user.click(familyFilter);
    expect(screen.getByRole("button", { name: "Filter (1)" })).toBeInTheDocument();

    await user.click(halfHourCard!);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Half-hour alignment" })).toBeInTheDocument();
    expect(screen.getByText(/12:30 PM - 1:00 PM/)).toBeInTheDocument();
    expect(screen.getByText("Calendar event")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close event details" })).toBeInTheDocument();
  });

  it("merges a shared Google occurrence and renders its calendar color bands", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: household.id,
        provider: "google",
        providerAccountId: "google-shared-event-test",
        displayName: "Google Calendar",
        encryptedAccessToken: encryptToken("test-access-token"),
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
      })
      .returning();
    await app.db.insert(calendarSources).values([
      {
        householdId: household.id,
        connectedAccountId: account.id,
        provider: "google",
        externalCalendarId: "parent@example.com",
        displayName: "Parent",
        color: "#8bc58b",
        enabled: true,
        sortOrder: 0
      },
      {
        householdId: household.id,
        connectedAccountId: account.id,
        provider: "google",
        externalCalendarId: "kiddo@example.com",
        displayName: "Kiddo",
        color: "#ee8ea4",
        enabled: true,
        sortOrder: 1
      }
    ]);

    const eventStart = new Date();
    eventStart.setHours(14, 0, 0, 0);
    const eventEnd = new Date(eventStart);
    eventEnd.setHours(15, 0, 0, 0);

    restoreFetch?.();
    restoreFetch = installRealApiFetch(app, {
      externalFetch: async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: "provider-specific-copy",
                iCalUID: "shared-stay@example.com",
                summary: "Stay at Carmel Valley",
                start: { dateTime: eventStart.toISOString() },
                end: { dateTime: eventEnd.toISOString() }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    });

    renderTodayDashboard();

    const sharedEventTitles = await screen.findAllByText("Stay at Carmel Valley");
    expect(sharedEventTitles).toHaveLength(1);
    const sharedEvent = sharedEventTitles[0]?.closest("button");
    expect(sharedEvent).toHaveAttribute("data-event-shared", "true");
    expect(sharedEvent?.getAttribute("style")).toContain("linear-gradient");

    await userEvent.setup().click(sharedEvent!);
    expect(await screen.findByText("Parent · Kiddo")).toBeInTheDocument();
    expect(screen.getByText("Calendars")).toBeInTheDocument();
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
