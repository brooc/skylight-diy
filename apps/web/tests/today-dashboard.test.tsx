import type { FastifyInstance } from "fastify";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  calendarSources,
  connectedAccounts,
  households,
  people,
} from "../../../packages/db/src/index";
import { encryptToken } from "../../api/src/modules/integrations/token-crypto";
import {
  dateFromDateKeyInTimeZone,
  dateKeyInTimeZone,
} from "../src/features/calendar/dateKeys";
import {
  CALENDAR_AUTO_REFRESH_MS,
  DASHBOARD_AUTO_REFRESH_MS,
  WEATHER_AUTO_REFRESH_MS,
} from "../src/api/refreshIntervals";
import {
  calendarHourRange,
  EVENT_STATUS_DURATION_MS,
  hourInTimeZone,
  TodayDashboard,
} from "../src/features/dashboard/TodayDashboard";
import {
  addMinutesToTime,
  minimumRecurrenceUntil,
} from "../src/features/calendar/CalendarEventCreateDialog";
import { createTestQueryClient } from "./helpers/test-utils";
import {
  createRealApiApp,
  installRealApiFetch,
  resetRealApiApp,
  unlockRealApiAdmin,
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
        { startHour: 23, durationHours: 1 },
      ]),
    ).toEqual({ startHour: 1, endHour: 23 });
  });

  it("calculates calendar clock helpers across timezones and midnight", () => {
    expect(
      hourInTimeZone(
        new Date("2026-07-19T16:30:15.000Z"),
        "America/Los_Angeles",
      ),
    ).toBeCloseTo(9.504, 3);
    expect(addMinutesToTime("09:30", 60)).toBe("10:30");
    expect(addMinutesToTime("23:30", 60)).toBe("00:30");
    expect(
      minimumRecurrenceUntil("2026-07-20", "weekly", ["MO", "TU", "WE"]),
    ).toBe("2026-07-23");
  });

  it("renders an honest empty calendar state and force-refreshes from the real API", async () => {
    const todayKey = dateKeyInTimeZone(new Date(), "America/Los_Angeles");
    const meal = await app.inject({
      method: "POST",
      url: "/api/meals/week/entries",
      payload: { date: todayKey, slot: "dinner", title: "Taco night" },
    });
    expect(meal.statusCode).toBe(201);

    renderTodayDashboard();

    expect(await screen.findByText("Test Household")).toBeInTheDocument();
    const calendarGrid = screen.getByTestId("dashboard-calendar-grid");
    expect(calendarGrid).toHaveClass("min-w-[720px]");
    expect(calendarGrid).toHaveStyle({
      gridTemplateColumns: "clamp(58px, 7vw, 88px) repeat(7, minmax(0, 1fr))",
    });
    expect(calendarGrid.closest("section")?.parentElement).toHaveClass(
      "md:h-[calc(100dvh-1.5rem)]",
      "md:min-h-0",
    );
    expect(screen.getByTestId("dashboard-calendar-scroll")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-auto",
    );
    expect(screen.getByTestId("dashboard-calendar-scroll")).not.toHaveClass(
      "max-h-[72vh]",
    );
    expect(
      screen.getByTestId("dashboard-calendar-grid").querySelector(
        '[data-current-time-line="true"]',
      ),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-calendar-day-header="true"]'),
    ).toHaveClass("text-[clamp(18px,2.5vw,34px)]");
    expect(
      document.querySelector('[data-calendar-hour-label="true"]'),
    ).toHaveClass("text-[clamp(14px,1.45vw,22px)]", "whitespace-nowrap");
    expect(
      await screen.findByText("🍽 Tonight: Taco night"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("No enabled calendar sources yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Camping Trip")).not.toBeInTheDocument();

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const requestCount = fetchSpy.mock.calls.length;
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("No enabled calendar sources yet.");
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(requestCount);
    expect(String(fetchSpy.mock.calls.at(-1)?.[0])).toContain("refresh=true");
  });

  it("ticks the clock every second while scheduling conservative background refreshes", async () => {
    const intervalSpy = vi.spyOn(window, "setInterval").mockReturnValue(1);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderTodayDashboard();

    expect(await screen.findByText("Test Household")).toBeInTheDocument();
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 1_000);
    expect(intervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      DASHBOARD_AUTO_REFRESH_MS,
    );
    expect(intervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      CALENDAR_AUTO_REFRESH_MS,
    );
    expect(intervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      WEATHER_AUTO_REFRESH_MS,
    );
    expect(
      document.querySelector("time")?.getAttribute("datetime"),
    ).toBeTruthy();
    expect(
      fetchSpy.mock.calls.filter(([input]) =>
        String(input).includes("/api/calendar/events"),
      ),
    ).toHaveLength(1);
  });

  it("shows a local weather icon with today's high and low", async () => {
    await app.db.update(households).set({
      locationName: "Campbell",
      latitude: 37.2872,
      longitude: -121.95,
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
              temperature_2m_min: [56],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    renderTodayDashboard();

    const weather = await screen.findByLabelText(
      "Partly cloudy: high 82°, low 56°",
    );
    expect(within(weather).getByText("82°")).toBeInTheDocument();
    expect(within(weather).getByText("56°")).toBeInTheDocument();
    expect(weather.querySelector("img")?.getAttribute("src")).toContain(
      "partly-cloudy-night",
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
        scopes: [
          "https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/calendar.events",
        ],
      })
      .returning();
    await app.db.insert(calendarSources).values({
      householdId: household.id,
      connectedAccountId: account.id,
      provider: "google",
      externalCalendarId: "family@example.com",
      displayName: "Family",
      enabled: true,
      allowEventWrites: true,
      googleAccessRole: "owner",
      sortOrder: 0,
    });

    const todayKey = dateKeyInTimeZone(new Date(), "America/Los_Angeles");
    const firstStart = dateFromDateKeyInTimeZone(
      todayKey,
      "America/Los_Angeles",
      10,
    );
    const firstEnd = dateFromDateKeyInTimeZone(
      todayKey,
      "America/Los_Angeles",
      11,
    );
    const secondStart = new Date(firstStart);
    secondStart.setMinutes(30);
    const secondEnd = new Date(firstStart);
    secondEnd.setHours(11, 30, 0, 0);
    const halfHourStart = new Date(firstStart);
    halfHourStart.setHours(12, 30, 0, 0);
    const halfHourEnd = new Date(halfHourStart);
    halfHourEnd.setMinutes(halfHourStart.getMinutes() + 30);

    restoreFetch?.();
    let deletedUrl = "";
    let editedBody: Record<string, unknown> | null = null;
    restoreFetch = installRealApiFetch(app, {
      externalFetch: async (input, init) => {
        if (init?.method === "PATCH") {
          editedBody = JSON.parse(String(init.body));
          return new Response(JSON.stringify({ id: "half-hour" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (init?.method === "DELETE") {
          deletedUrl = String(input);
          return new Response(null, { status: 204 });
        }
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "overlap-one",
                summary: "Overlap one",
                start: { dateTime: firstStart.toISOString() },
                end: { dateTime: firstEnd.toISOString() },
              },
              {
                id: "overlap-two",
                summary: "Overlap two",
                start: { dateTime: secondStart.toISOString() },
                end: { dateTime: secondEnd.toISOString() },
              },
              {
                id: "half-hour",
                summary: "Half-hour alignment",
                start: { dateTime: halfHourStart.toISOString() },
                end: { dateTime: halfHourEnd.toISOString() },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    renderTodayDashboard();

    const firstCard = (await screen.findByText("Overlap one")).closest(
      "button",
    );
    const secondCard = (await screen.findByText("Overlap two")).closest(
      "button",
    );
    const halfHourCard = (
      await screen.findByText("Half-hour alignment")
    ).closest("button");
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
    expect(
      document.querySelectorAll('[data-half-hour-line="true"]').length,
    ).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Filter" }));
    const familyFilter = screen.getByRole("checkbox", { name: "Family" });
    expect(familyFilter).not.toBeChecked();
    await user.click(familyFilter);
    expect(
      screen.getByRole("button", { name: "Filter (1)" }),
    ).toBeInTheDocument();

    await user.click(halfHourCard!);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Half-hour alignment" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/12:30 PM - 1:00 PM/)).toBeInTheDocument();
    expect(screen.getByText("Calendar event")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close event details" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const editDialog = await screen.findByRole("dialog", { name: "Edit event" });
    const titleInput = within(editDialog).getByLabelText("Event title");
    await user.clear(titleInput);
    await user.type(titleInput, "Updated alignment");
    await user.click(within(editDialog).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Event updated.")).toBeInTheDocument();
    expect(editedBody).toMatchObject({
      summary: "Updated alignment",
    });

    await user.click((await screen.findByText("Half-hour alignment")).closest("button")!);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete event" }));
    expect(await screen.findByText("Event deleted.")).toBeInTheDocument();
    expect(deletedUrl).toContain("/events/half-hour?sendUpdates=all");
  });

  it("merges a shared Google occurrence and renders its calendar color bands", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    const householdResponse = await app.inject({
      method: "GET",
      url: "/api/household/current",
    });
    const members = householdResponse.json().people as Array<{
      id: string;
      displayName: string;
    }>;
    const adminCookie = await unlockRealApiAdmin(app);
    for (const [displayName, color] of [
      ["Parent", "#336699"],
      ["Kiddo", "#993366"],
    ] as const) {
      const member = members.find(
        (person) => person.displayName === displayName,
      );
      expect(member).toBeTruthy();
      const update = await app.inject({
        method: "PATCH",
        url: `/api/household/people/${member!.id}`,
        headers: { cookie: adminCookie },
        payload: { color },
      });
      expect(update.statusCode).toBe(200);
    }
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: household.id,
        provider: "google",
        providerAccountId: "google-shared-event-test",
        displayName: "Google Calendar",
        encryptedAccessToken: encryptToken("test-access-token"),
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
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
        sortOrder: 0,
      },
      {
        householdId: household.id,
        connectedAccountId: account.id,
        provider: "google",
        externalCalendarId: "kiddo@example.com",
        displayName: "Kiddo",
        color: "#ee8ea4",
        enabled: true,
        sortOrder: 1,
      },
    ]);

    const todayKey = dateKeyInTimeZone(new Date(), "America/Los_Angeles");
    const eventStart = dateFromDateKeyInTimeZone(
      todayKey,
      "America/Los_Angeles",
      14,
    );
    const eventEnd = dateFromDateKeyInTimeZone(
      todayKey,
      "America/Los_Angeles",
      15,
    );

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
                end: { dateTime: eventEnd.toISOString() },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    renderTodayDashboard();

    const sharedEventTitles = await screen.findAllByText(
      "Stay at Carmel Valley",
    );
    expect(sharedEventTitles).toHaveLength(1);
    const sharedEvent = sharedEventTitles[0]?.closest("button");
    expect(sharedEvent).toHaveAttribute("data-event-shared", "true");
    expect(sharedEvent?.getAttribute("style")).toContain("linear-gradient");
    expect(sharedEvent?.getAttribute("style")).toContain("#d8e2ec");
    expect(sharedEvent?.getAttribute("style")).toContain("#ecd8e2");

    await userEvent.setup().click(sharedEvent!);
    expect(await screen.findByText("Parent · Kiddo")).toBeInTheDocument();
    expect(screen.getByText("Calendars")).toBeInTheDocument();
  });

  it("creates an event in an explicitly writable calendar", async () => {
    const timeoutSpy = vi.spyOn(window, "setTimeout");
    const expectedMinimumRepeatUntil = minimumRecurrenceUntil(
      dateKeyInTimeZone(new Date(), "America/Los_Angeles"),
      "weekly",
      ["MO", "TU", "WE"],
    );
    const [household] = await app.db.select().from(households).limit(1);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: household.id,
        provider: "google",
        providerAccountId: "google-event-ui-test",
        displayName: "Family Gmail",
        email: "family@example.com",
        encryptedAccessToken: encryptToken("test-access-token"),
        scopes: [
          "https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/calendar.events",
        ],
      })
      .returning();
    const [parent] = await app.db.select().from(people);
    await app.db.insert(calendarSources).values({
      householdId: household.id,
      connectedAccountId: account.id,
      provider: "google",
      externalCalendarId: "family@example.com",
      displayName: "Family",
      enabled: true,
      allowEventWrites: true,
      googleAccessRole: "owner",
      personId: parent.id,
      sortOrder: 0,
    });
    let createdBody: Record<string, unknown> | null = null;
    let createCalls = 0;
    let calendarReadCalls = 0;
    restoreFetch?.();
    restoreFetch = installRealApiFetch(app, {
      externalFetch: async (_input, init) => {
        if (init?.method === "POST") {
          createCalls += 1;
          createdBody = JSON.parse(String(init.body));
          return new Response(
            JSON.stringify({
              id: "created-event",
              htmlLink: "https://example.com",
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }
        calendarReadCalls += 1;
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    renderTodayDashboard();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add" }));
    await user.click(await screen.findByRole("button", { name: "Add event" }));

    const dialog = await screen.findByRole("dialog", { name: "Add event" });
    expect(dialog).toHaveClass("overflow-hidden");
    expect(dialog.firstElementChild).toHaveClass(
      "max-h-[calc(100dvh-1rem)]",
      "min-w-0",
      "overflow-hidden",
    );
    expect(dialog.querySelector("form")).toHaveClass(
      "flex",
      "overflow-hidden",
      "min-w-0",
    );
    expect(within(dialog).getByTestId("event-form-scroll")).toHaveClass(
      "overflow-y-auto",
      "overflow-x-hidden",
      "min-w-0",
    );
    expect(within(dialog).getByLabelText("Calendar")).toHaveClass(
      "w-full",
      "min-w-0",
      "max-w-full",
      "truncate",
    );
    expect(
      within(dialog).getByRole("option", {
        name: "Parent — Family — family@example.com",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Shown as Parent in Daymark."),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Event title"), "Dentist");
    await user.clear(within(dialog).getByLabelText("Start time"));
    await user.type(within(dialog).getByLabelText("Start time"), "10:30");
    expect(within(dialog).getByLabelText("End time")).toHaveValue("11:30");
    await user.clear(within(dialog).getByLabelText("End time"));
    await user.type(within(dialog).getByLabelText("End time"), "11:15");
    expect(within(dialog).getByLabelText(/Location/)).not.toBeVisible();
    await user.click(within(dialog).getByText("More options"));
    expect(within(dialog).getByLabelText(/Location/)).toBeVisible();
    await user.type(within(dialog).getByLabelText(/Location/), "Campbell");
    await user.type(within(dialog).getByLabelText(/Guests/), "kid@example.com");
    await user.selectOptions(within(dialog).getByLabelText("Repeat"), "weekly");
    for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) {
      const checkbox = within(dialog).getByRole("checkbox", { name: day }) as HTMLInputElement;
      const shouldBeChecked = ["Monday", "Tuesday", "Wednesday"].includes(day);
      if (checkbox.checked !== shouldBeChecked) await user.click(checkbox);
    }
    await user.selectOptions(
      within(dialog).getByLabelText("Repeat ends"),
      "on_date",
    );
    expect(within(dialog).getByLabelText("Last date")).toHaveAttribute(
      "min",
      expectedMinimumRepeatUntil,
    );
    expect(within(dialog).getByLabelText("Last date")).toHaveValue(
      expectedMinimumRepeatUntil,
    );
    await user.selectOptions(
      within(dialog).getByLabelText("Repeat ends"),
      "after",
    );
    await user.clear(within(dialog).getByLabelText("Number of occurrences"));
    await user.type(
      within(dialog).getByLabelText("Number of occurrences"),
      "6",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add event" }));

    expect(
      await screen.findByText("Event added to calendar."),
    ).toBeInTheDocument();
    expect(timeoutSpy).toHaveBeenCalledWith(
      expect.any(Function),
      EVENT_STATUS_DURATION_MS,
    );
    const dismissToast = timeoutSpy.mock.calls.find(
      ([, delay]) => delay === EVENT_STATUS_DURATION_MS,
    )?.[0];
    expect(dismissToast).toBeTypeOf("function");
    act(() => {
      if (typeof dismissToast === "function") dismissToast();
    });
    expect(screen.queryByText("Event added to calendar.")).not.toBeInTheDocument();
    expect(createCalls).toBe(1);
    expect(calendarReadCalls).toBeGreaterThanOrEqual(2);
    expect(createdBody).toMatchObject({
      summary: "Dentist",
      location: "Campbell",
      attendees: [{ email: "kid@example.com" }],
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE;COUNT=6"],
      start: { timeZone: "America/Los_Angeles" },
      end: { timeZone: "America/Los_Angeles" },
    });
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
    await user.click(
      await screen.findByRole("button", { name: "Add list item" }),
    );
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
    </MemoryRouter>,
  );
}
