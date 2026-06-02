import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarDayView } from "../src/features/calendar/CalendarDayView";
import { CalendarEventCard } from "../src/features/calendar/CalendarEventCard";
import { CalendarStatusBadge } from "../src/features/calendar/CalendarStatusBadge";
import { CalendarWeekView } from "../src/features/calendar/CalendarWeekView";
import { createTestQueryClient, mockJsonResponse } from "./helpers/test-utils";

function renderWeekView(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <CalendarWeekView />
    </QueryClientProvider>
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
            color: "#bee8ea"
          }}
        />
        <CalendarEventCard
          event={{
            id: "all-day",
            title: "Camping Trip",
            start: "2026-06-02",
            end: "2026-06-03",
            isAllDay: true
          }}
        />
        <CalendarDayView title="Wed, Jun 3" events={[]} />
        <CalendarStatusBadge cacheStatus="fresh" />
        <CalendarStatusBadge cacheStatus="refreshed" />
        <CalendarStatusBadge cacheStatus="stale" />
        <CalendarStatusBadge cacheStatus="miss" />
      </div>
    );

    expect(screen.getByText("Pickup Dry Cleaning")).toBeInTheDocument();
    expect(screen.getByText("Parent")).toBeInTheDocument();
    expect(screen.getByText("Camping Trip")).toBeInTheDocument();
    expect(screen.getByText("All day")).toBeInTheDocument();
    expect(screen.getByText("Wed, Jun 3")).toBeInTheDocument();
    expect(screen.getByText("No events")).toBeInTheDocument();
    expect(screen.getByText("Up to date")).toBeInTheDocument();
    expect(screen.getByText("Just refreshed")).toBeInTheDocument();
    expect(screen.getByText("Showing saved data")).toBeInTheDocument();
    expect(screen.getByText("No calendar data")).toBeInTheDocument();
  });

  it("renders week events, warnings, cache status, and refreshes the query", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/calendar/events")) {
        return mockJsonResponse({
          rangeStart: "2026-06-01T00:00:00.000Z",
          rangeEnd: "2026-06-08T00:00:00.000Z",
          timezone: "America/Los_Angeles",
          cacheStatus: "stale",
          degraded: true,
          warnings: [{ code: "SOURCE_FETCH_FAILED", message: "Google is taking a nap." }],
          events: [
            {
              id: "event-1",
              title: "History Test",
              start: new Date().toISOString(),
              end: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              isAllDay: false,
              sourceName: "Kiddo",
              color: "#f7d8d4"
            }
          ]
        });
      }
      return mockJsonResponse({}, 404);
    });

    renderWeekView();

    expect(await screen.findByText("Week calendar")).toBeInTheDocument();
    expect(await screen.findByText("History Test")).toBeInTheDocument();
    expect(screen.getByText("Google is taking a nap.")).toBeInTheDocument();
    expect(screen.getByText("Showing saved data")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
