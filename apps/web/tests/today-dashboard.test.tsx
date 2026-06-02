import type { FastifyInstance } from "fastify";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

  it("renders household status and demo schedule from the real API", async () => {
    const todayKey = new Date().toISOString().slice(0, 10);
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
    expect(await screen.findByText("Grocery Run")).toBeInTheDocument();
    expect(await screen.findByText("Coffee With Diane")).toBeInTheDocument();
    expect(await screen.findByText("Dog's Big Bath Day!")).toBeInTheDocument();
    expect(await screen.findAllByText("Cousins Visit")).toHaveLength(2);
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
