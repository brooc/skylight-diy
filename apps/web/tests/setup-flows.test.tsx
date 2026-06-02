import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminPinUnlock } from "../src/features/setup/AdminPinUnlock";
import { SetupWizard } from "../src/features/setup/SetupWizard";
import { createTestQueryClient, mockJsonResponse } from "./helpers/test-utils";

function renderSetupRoutes(initialRoute: string, element: JSX.Element): void {
  render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <QueryClientProvider client={createTestQueryClient()}>
        <Routes>
          <Route path={initialRoute.split("?")[0]} element={element} />
          <Route path="/settings" element={<div>settings route</div>} />
          <Route path="/today" element={<div>today route</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("setup and unlock flows", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits first-run setup and navigates to Today", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockJsonResponse({ created: true, household: { id: "h1" } }));
    renderSetupRoutes("/setup", <SetupWizard />);
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText("Household name"));
    await user.type(screen.getByLabelText("Household name"), "Miller Family");
    await user.clear(screen.getByLabelText("Additional members (comma-separated)"));
    await user.type(screen.getByLabelText("Additional members (comma-separated)"), "Ellie, Harper");
    await user.click(screen.getByRole("button", { name: "Complete setup" }));

    expect(await screen.findByText("today route")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/setup/complete",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Miller Family")
      })
    );
    const requestBody = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(requestBody.members).toEqual(["Ellie", "Harper"]);
  });

  it("shows setup errors returned by the API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("setup_not_allowed", { status: 400 }));
    renderSetupRoutes("/setup", <SetupWizard />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Complete setup" }));

    expect(await screen.findByText("setup_not_allowed")).toBeInTheDocument();
  });

  it("unlocks settings with the local admin PIN", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockJsonResponse({ unlocked: true }));
    renderSetupRoutes("/settings/unlock", <AdminPinUnlock />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Admin PIN"), "2468");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText("settings route")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/session/unlock",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ pin: "2468" })
      })
    );
  });

  it("shows unlock errors returned by the API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("invalid_pin", { status: 401 }));
    renderSetupRoutes("/settings/unlock", <AdminPinUnlock />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText("invalid_pin")).toBeInTheDocument();
  });
});
