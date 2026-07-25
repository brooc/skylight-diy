import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarDayView } from "../src/features/calendar/CalendarDayView";
import { CalendarEventCard } from "../src/features/calendar/CalendarEventCard";
import { CalendarEventEditDialog } from "../src/features/calendar/CalendarEventEditDialog";
import { CalendarStatusBadge } from "../src/features/calendar/CalendarStatusBadge";
import { CalendarWeekView } from "../src/features/calendar/CalendarWeekView";
import {
  CALENDAR_AUTO_REFRESH_MS,
  DASHBOARD_AUTO_REFRESH_MS,
} from "../src/api/refreshIntervals";
import {
  dateFromDateKeyInTimeZone,
  dateKeyInTimeZone,
  formatDateKey,
  shiftDateKey,
  startOfWeekDateKey,
} from "../src/features/calendar/dateKeys";
import { layoutTimedEvents } from "../src/features/calendar/layoutTimedEvents";
import { createTestQueryClient, mockJsonResponse } from "./helpers/test-utils";

function renderWeekView(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <CalendarWeekView />
    </QueryClientProvider>,
  );
}

describe("calendar components", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders timed, all-day, sourced, and empty calendar states", () => {
    render(
      <div>
        <CalendarEventCard
          event={{
            id: "timed",
            title: "Pickup Dry Cleaning",
            start: "2026-06-02T16:30:00.000Z",
            end: "2026-06-02T17:15:00.000Z",
            isAllDay: false,
            sourceName: "Parent",
            color: "#bee8ea",
          }}
        />
        <CalendarEventCard
          event={{
            id: "shared",
            title: "Stay at Carmel Valley",
            start: "2026-06-02T16:30:00.000Z",
            end: "2026-06-02T17:15:00.000Z",
            isAllDay: false,
            sourceName: "Parent, Kiddo",
            sourceNames: ["Parent", "Kiddo"],
            color: "#8bc58b",
            colors: ["#8bc58b", "#ee8ea4"],
            shared: true,
          }}
        />
        <CalendarEventCard
          event={{
            id: "all-day",
            title: "Camping Trip",
            start: "2026-06-02",
            end: "2026-06-03",
            isAllDay: true,
          }}
        />
        <CalendarDayView title="Wed, Jun 3" events={[]} />
        <CalendarStatusBadge cacheStatus="fresh" />
        <CalendarStatusBadge cacheStatus="refreshed" />
        <CalendarStatusBadge cacheStatus="stale" />
        <CalendarStatusBadge cacheStatus="miss" />
      </div>,
    );

    expect(screen.getByText("Pickup Dry Cleaning")).toBeInTheDocument();
    expect(screen.getByText("Parent")).toBeInTheDocument();
    expect(screen.getByText("Parent · Kiddo")).toBeInTheDocument();
    const sharedCard = screen
      .getByText("Stay at Carmel Valley")
      .closest("article");
    expect(sharedCard).toHaveAttribute("data-event-shared", "true");
    expect(sharedCard?.getAttribute("style")).toContain("linear-gradient");
    expect(screen.getByText("Camping Trip")).toBeInTheDocument();
    expect(
      screen
        .getByText("Camping Trip")
        .closest("article")
        ?.getAttribute("style"),
    ).not.toContain("linear-gradient");
    expect(screen.getByText("All day")).toBeInTheDocument();
    expect(screen.getByText("Wed, Jun 3")).toBeInTheDocument();
    expect(screen.getByText("No events")).toBeInTheDocument();
    expect(screen.queryByText("Up to date")).not.toBeInTheDocument();
    expect(screen.getByText("Just refreshed")).toBeInTheDocument();
    expect(screen.getByText("Showing saved data")).toBeInTheDocument();
    expect(screen.getByText("No calendar data")).toBeInTheDocument();
  });

  it("lays overlapping events out side by side and reuses columns at boundaries", () => {
    const layouts = layoutTimedEvents([
      { id: "first", start: 9, end: 10 },
      { id: "second", start: 9.25, end: 10.5 },
      { id: "third", start: 10, end: 11 },
      { id: "touching", start: 11, end: 12 },
    ]);

    expect(layouts).toEqual([
      { id: "first", column: 0, columnCount: 2 },
      { id: "second", column: 1, columnCount: 2 },
      { id: "third", column: 0, columnCount: 2 },
      { id: "touching", column: 0, columnCount: 1 },
    ]);
  });

  it("uses the peak concurrency for every event in an overlap group", () => {
    const layouts = layoutTimedEvents([
      { id: "long", start: 9, end: 12 },
      { id: "early", start: 9.5, end: 10.5 },
      { id: "peak", start: 10, end: 11 },
    ]);

    expect(layouts).toEqual([
      { id: "long", column: 0, columnCount: 3 },
      { id: "early", column: 1, columnCount: 3 },
      { id: "peak", column: 2, columnCount: 3 },
    ]);
  });

  it("lets a recurring series be extended from the selected occurrence", async () => {
    let requestBody: Record<string, unknown> | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (!init?.method) {
        return mockJsonResponse({
          editable: true,
          frequency: "weekly",
          days: ["MO", "TU", "WE"],
          ends: "after",
          count: 5,
          start: "2026-08-03T16:00:00.000Z",
          end: "2026-08-03T17:00:00.000Z",
          allDay: false,
        });
      }
      requestBody = JSON.parse(String(init?.body));
      return mockJsonResponse({ updated: true });
    });
    const onUpdated = vi.fn();
    render(
      <CalendarEventEditDialog
        event={{
          title: "Gym",
          start: "2026-08-03T16:00:00.000Z",
          end: "2026-08-03T17:00:00.000Z",
          isAllDay: false,
          isRecurring: true,
          attendeeEmails: ["kid@example.com", "outside@example.com"],
          providerRefs: [
            {
              sourceId: "846288ca-1398-49be-9a95-0d5cb56a4779",
              providerEventId: "instance-id",
              recurringEventId: "series-id",
            },
          ],
        }}
        targets={[
          {
            sourceId: "846288ca-1398-49be-9a95-0d5cb56a4779",
            providerEventId: "instance-id",
            recurringEventId: "series-id",
          },
        ]}
        accounts={[
          {
            id: "account-1",
            email: "parent@example.com",
            calendarWriteAccessGranted: true,
            reauthorizationRequired: false,
          },
        ]}
        sources={[
          {
            id: "846288ca-1398-49be-9a95-0d5cb56a4779",
            connectedAccountId: "account-1",
            externalCalendarId: "parent@example.com",
            displayName: "Parent",
            enabled: true,
            allowEventWrites: true,
            personId: "parent-id",
          },
          {
            id: "source-kid",
            connectedAccountId: "account-1",
            externalCalendarId: "kid@example.com",
            displayName: "Kiddo",
            enabled: true,
            allowEventWrites: false,
            personId: "kid-id",
          },
        ]}
        members={[
          { id: "parent-id", displayName: "Parent", color: "#f3cfd0" },
          { id: "kid-id", displayName: "Kiddo", color: "#bee8ea" },
          { id: "other-id", displayName: "Other", color: "#d9d1ef" },
        ]}
        timezone="America/Los_Angeles"
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    );

    const user = userEvent.setup();
    expect(screen.queryByLabelText(/Guests/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Parent")).toBeDisabled();
    expect(screen.getByLabelText("Kiddo")).toBeChecked();
    expect(screen.getByLabelText("Other")).toBeDisabled();
    expect(screen.getByText("outside@example.com")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Google Calendar will email participants about these changes.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByLabelText("Kiddo"));
    await waitFor(() =>
      expect(
        screen.getByLabelText("This and following occurrences"),
      ).toBeEnabled(),
    );
    await user.click(screen.getByLabelText("This and following occurrences"));
    fireEvent.change(screen.getByLabelText("Effective date"), {
      target: { value: "2026-08-04" },
    });
    expect(screen.getByLabelText("Monday")).not.toBeChecked();
    expect(screen.getByLabelText("Tuesday")).toBeChecked();
    expect(screen.getByLabelText("Wednesday")).toBeChecked();
    expect(screen.getByLabelText("Thursday")).toBeChecked();
    await user.selectOptions(screen.getByLabelText("Series ending"), "on_date");
    await user.clear(screen.getByLabelText("Last date"));
    await user.type(screen.getByLabelText("Last date"), "2026-09-30");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(requestBody).toMatchObject({
      scope: "following",
      recurrencePattern: {
        frequency: "weekly",
        days: ["TU", "WE", "TH"],
      },
      recurrenceEnd: { mode: "on_date", until: "2026-09-30" },
      attendees: ["outside@example.com"],
    });
  });

  it("preserves a multi-day duration when a weekly series moves", async () => {
    let requestBody: Record<string, unknown> | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (!init?.method) {
        return mockJsonResponse({
          editable: true,
          frequency: "weekly",
          days: ["MO"],
          ends: "never",
          start: "2026-08-03",
          end: "2026-08-06",
          allDay: true,
        });
      }
      requestBody = JSON.parse(String(init.body));
      return mockJsonResponse({ updated: true });
    });
    const onUpdated = vi.fn();
    render(
      <CalendarEventEditDialog
        event={{
          title: "Three-day camp",
          start: "2026-08-03",
          end: "2026-08-06",
          isAllDay: true,
          isRecurring: true,
          providerRefs: [],
        }}
        targets={[
          {
            sourceId: "846288ca-1398-49be-9a95-0d5cb56a4779",
            providerEventId: "instance-id",
            recurringEventId: "series-id",
          },
        ]}
        accounts={[]}
        sources={[
          {
            id: "846288ca-1398-49be-9a95-0d5cb56a4779",
            connectedAccountId: "account-1",
            externalCalendarId: "family@example.com",
            displayName: "Family",
            enabled: true,
            allowEventWrites: true,
          },
        ]}
        members={[]}
        timezone="America/Los_Angeles"
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    );

    const user = userEvent.setup();
    await waitFor(() =>
      expect(
        screen.getByLabelText("This and following occurrences"),
      ).toBeEnabled(),
    );
    await user.click(screen.getByLabelText("This and following occurrences"));
    expect(screen.getByLabelText("End date")).toHaveValue("2026-08-05");
    fireEvent.change(screen.getByLabelText("Effective date"), {
      target: { value: "2026-08-04" },
    });
    expect(screen.getByLabelText("End date")).toHaveValue("2026-08-06");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(requestBody).toMatchObject({
      scope: "following",
      allDay: true,
      start: "2026-08-04",
      end: "2026-08-07",
      recurrencePattern: { frequency: "weekly", days: ["TU"] },
    });
  });

  it("assigns timed and all-day events across DST boundaries without UTC day drift", () => {
    expect(
      dateKeyInTimeZone("2026-03-08T07:30:00.000Z", "America/Los_Angeles"),
    ).toBe("2026-03-07");
    expect(
      dateKeyInTimeZone("2026-03-08T10:30:00.000Z", "America/Los_Angeles"),
    ).toBe("2026-03-08");
    expect(
      dateKeyInTimeZone("2026-11-01T06:30:00.000Z", "America/Los_Angeles"),
    ).toBe("2026-10-31");
    expect(
      dateKeyInTimeZone("2026-11-01T10:30:00.000Z", "America/Los_Angeles"),
    ).toBe("2026-11-01");
    expect(shiftDateKey("2026-03-09", -1)).toBe("2026-03-08");
    expect(startOfWeekDateKey("2026-07-18", "monday")).toBe("2026-07-13");
    expect(startOfWeekDateKey("2026-07-18", "sunday")).toBe("2026-07-12");
    const midnight = dateFromDateKeyInTimeZone(
      "2026-07-19",
      "America/Los_Angeles",
    );
    expect(midnight.toISOString()).toBe("2026-07-19T07:00:00.000Z");
    expect(dateKeyInTimeZone(midnight, "America/Los_Angeles")).toBe(
      "2026-07-19",
    );
    expect(
      formatDateKey(
        "2026-07-19",
        { weekday: "long", month: "short", day: "numeric" },
        "en-US",
      ),
    ).toBe("Sunday, Jul 19");
  });

  it("renders week events, warnings, cache status, and refreshes the query", async () => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.startsWith("/api/household/current")) {
          return mockJsonResponse({ household: { weekStartsOn: "monday" } });
        }
        if (url.startsWith("/api/calendar/events")) {
          return mockJsonResponse({
            rangeStart: "2026-06-01T00:00:00.000Z",
            rangeEnd: "2026-06-08T00:00:00.000Z",
            timezone: "America/Los_Angeles",
            cacheStatus: "stale",
            degraded: true,
            warnings: [
              {
                code: "SOURCE_FETCH_FAILED",
                message: "Google is taking a nap.",
              },
            ],
            events: [
              {
                id: "event-1",
                title: "History Test",
                start: new Date().toISOString(),
                end: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                isAllDay: false,
                sourceName: "Kiddo",
                color: "#f7d8d4",
              },
            ],
          });
        }
        return mockJsonResponse({}, 404);
      });

    renderWeekView();

    expect(await screen.findByText("Agenda")).toBeInTheDocument();
    expect(await screen.findByText("History Test")).toBeInTheDocument();
    expect(screen.getByText("Google is taking a nap.")).toBeInTheDocument();
    expect(screen.getByText("Showing saved data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toHaveClass(
      "rounded-full",
      "bg-[#fff7ea]",
    );
    expect(intervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      DASHBOARD_AUTO_REFRESH_MS,
    );
    expect(intervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      CALENDAR_AUTO_REFRESH_MS,
    );
    const weekGrid = screen.getByTestId("week-grid");
    expect(weekGrid).toHaveClass(
      "grid-cols-1",
      "sm:grid-cols-2",
      "lg:grid-cols-4",
      "xl:grid-cols-7",
    );
    expect(weekGrid).not.toHaveClass("min-w-[1120px]");

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Next week" }));
    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.filter(([input]) =>
          String(input).includes("/api/calendar/events"),
        ),
      ).toHaveLength(2);
    });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.filter(([input]) =>
          String(input).includes("/api/calendar/events"),
        ),
      ).toHaveLength(3);
    });
    const refreshedUrl = String(
      fetchSpy.mock.calls
        .filter(([input]) => String(input).includes("/api/calendar/events"))
        .at(-1)?.[0],
    );
    expect(refreshedUrl).toContain("refresh=true");
  });
});
