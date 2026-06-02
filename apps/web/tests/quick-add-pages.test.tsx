import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChoresPage } from "../src/features/chores/ChoresPage";
import { ImportPlaceholder } from "../src/features/import/ImportPlaceholder";
import { MealPlanWeek } from "../src/features/meals/MealPlanWeek";
import { mockJsonResponse, renderWithProviders } from "./helpers/test-utils";

describe("quick add page states", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens tasks add form when route contains add=1", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/chores/today")) {
        return mockJsonResponse({ chores: [] });
      }
      if (url.startsWith("/api/rewards/balances")) {
        return mockJsonResponse({ balances: [] });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<ChoresPage />, { route: "/chores?add=1" });
    expect(await screen.findByRole("heading", { name: "Add task" })).toBeInTheDocument();
  });

  it("opens lists add form when route contains add=1", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/lists")) {
        return mockJsonResponse({ lists: [] });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<ImportPlaceholder />, { route: "/import?add=1" });
    expect(await screen.findByText("Add")).toBeInTheDocument();
  });

  it("opens meals add form when route contains add=1", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/meals/week")) {
        return mockJsonResponse({
          days: [{ date: "2026-06-01", entries: [] }]
        });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<MealPlanWeek />, { route: "/meals?add=1" });
    expect(await screen.findByText("Add meal entry")).toBeInTheDocument();
  });
});
