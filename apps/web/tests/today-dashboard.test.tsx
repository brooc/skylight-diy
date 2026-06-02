import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TodayDashboard } from "../src/features/dashboard/TodayDashboard";
import { createTestQueryClient, mockJsonResponse } from "./helpers/test-utils";

function mockTodayDashboardRequests(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("/api/household/current")) {
      return mockJsonResponse({
        household: { name: "Demo Household" },
        people: []
      });
    }
    if (url.startsWith("/api/rewards/balances")) {
      return mockJsonResponse({
        balances: [
          { personId: "p1", displayName: "Parent", balance: 0 },
          { personId: "p2", displayName: "Kiddo", balance: 0 }
        ]
      });
    }
    if (url.startsWith("/api/meals/week")) {
      return mockJsonResponse({
        days: []
      });
    }
    if (url.startsWith("/api/calendar/events")) {
      return mockJsonResponse({
        cacheStatus: "miss",
        degraded: true,
        warnings: [{ code: "NO_ENABLED_SOURCES", message: "No enabled calendar sources yet." }],
        events: []
      });
    }
    return mockJsonResponse({}, 404);
  });
}

function renderTodayDashboard(): void {
  const queryClient = createTestQueryClient();
  render(
    <MemoryRouter initialEntries={["/today"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/today" element={<TodayDashboard />} />
          <Route path="/chores" element={<div>tasks route</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("TodayDashboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows degraded-state warning message when calendar warnings are returned", async () => {
    mockTodayDashboardRequests();
    renderTodayDashboard();

    expect(await screen.findByText("No enabled calendar sources yet.")).toBeInTheDocument();
  });

  it("opens add actions menu and navigates to tasks quick-add route", async () => {
    mockTodayDashboardRequests();
    renderTodayDashboard();
    const user = userEvent.setup();

    const addButton = await screen.findByRole("button", { name: "Add" });
    await user.click(addButton);

    const addTask = await screen.findByRole("button", { name: "Add task" });
    await user.click(addTask);

    expect(await screen.findByText("tasks route")).toBeInTheDocument();
  });
});
