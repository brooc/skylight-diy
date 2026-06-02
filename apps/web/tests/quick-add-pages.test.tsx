import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ChoresPage } from "../src/features/chores/ChoresPage";
import { ImportPlaceholder } from "../src/features/import/ImportPlaceholder";
import { MealPlanWeek } from "../src/features/meals/MealPlanWeek";
import {
  createRealApiApp,
  installRealApiFetch,
  resetRealApiApp
} from "./helpers/real-api";
import { renderWithProviders } from "./helpers/test-utils";

describe("quick add page states", () => {
  let app: FastifyInstance;
  let restoreFetch: (() => void) | null = null;

  beforeAll(async () => {
    app = await createRealApiApp();
  });

  beforeEach(async () => {
    await resetRealApiApp(app);
    restoreFetch = installRealApiFetch(app);
  });

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = null;
  });

  afterAll(async () => {
    await app.close();
  });

  it("opens tasks add form from the route and creates a task through the API", async () => {
    renderWithProviders(<ChoresPage />, { route: "/chores?add=1" });
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Add task" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), "Pack lunches");
    await user.selectOptions(screen.getByLabelText("Assigned person"), "Kiddo");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByText("Pack lunches")).toBeInTheDocument();
    expect(screen.getAllByText("Kiddo").length).toBeGreaterThan(0);
  });

  it("opens lists add form from the route and creates list data through the API", async () => {
    await app.inject({
      method: "POST",
      url: "/api/lists",
      payload: { title: "Grocery List" }
    });

    renderWithProviders(<ImportPlaceholder />, { route: "/import?add=1" });
    const user = userEvent.setup();

    expect(await screen.findByText("Add")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Item title"), "Milk");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(await screen.findByText("Milk")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "List" }));
    await user.type(screen.getByLabelText("List title"), "Packing List");
    await user.click(screen.getByRole("button", { name: "Add list" }));
    expect(await screen.findByText("Packing List")).toBeInTheDocument();
  });

  it("opens meals add form from the route and creates a meal through the API", async () => {
    renderWithProviders(<MealPlanWeek />, { route: "/meals?add=1" });
    const user = userEvent.setup();

    expect(await screen.findByText("Add meal entry")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Slot"), "lunch");
    await user.type(screen.getByLabelText("Meal"), "Taco night");
    await user.click(screen.getByRole("button", { name: "Add meal" }));

    await waitFor(() => expect(screen.queryByText("Add meal entry")).not.toBeInTheDocument());
    expect(await screen.findByText("Taco night")).toBeInTheDocument();
    expect(screen.getByText("lunch")).toBeInTheDocument();
  });
});
