import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminPinUnlock } from "../src/features/setup/AdminPinUnlock";
import { ApplianceSetup } from "../src/features/setup/ApplianceSetup";
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
    </MemoryRouter>,
  );
}

describe("setup and unlock flows", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits first-run setup and navigates to Today", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJsonResponse({ setupRequired: true, pairingRequired: false }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({ created: true, household: { id: "h1" } }),
      );
    renderSetupRoutes("/setup", <SetupWizard />);
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText("Household name"),
      "Miller Family",
    );
    await user.type(screen.getByLabelText("Admin name"), "Jordan");
    await user.type(screen.getByLabelText("Admin PIN"), "2468");
    await user.clear(
      screen.getByLabelText("Additional members (comma-separated)"),
    );
    await user.type(
      screen.getByLabelText("Additional members (comma-separated)"),
      "Ellie, Harper",
    );
    await user.click(screen.getByRole("button", { name: "Complete setup" }));

    expect(await screen.findByText("today route")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/setup/complete",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Miller Family"),
      }),
    );
    const requestBody = JSON.parse(
      (fetchSpy.mock.calls[1]?.[1] as RequestInit).body as string,
    );
    expect(requestBody.members).toEqual(["Ellie", "Harper"]);
  });

  it("shows setup errors returned by the API", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJsonResponse({ setupRequired: true, pairingRequired: false }),
      )
      .mockResolvedValueOnce(
        new Response("setup_not_allowed", { status: 400 }),
      );
    renderSetupRoutes("/setup", <SetupWizard />);

    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText("Household name"),
      "Miller Family",
    );
    await user.type(screen.getByLabelText("Admin name"), "Jordan");
    await user.type(screen.getByLabelText("Admin PIN"), "2468");
    await user.click(screen.getByRole("button", { name: "Complete setup" }));

    expect(await screen.findByText("setup_not_allowed")).toBeInTheDocument();
  });

  it("passes the display pairing token when completing setup from a phone", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJsonResponse({ setupRequired: true, pairingRequired: true }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({ created: true, household: { id: "h1" } }),
      );
    renderSetupRoutes("/setup?pair=paired-device-token", <SetupWizard />);

    await userEvent
      .setup()
      .type(await screen.findByLabelText("Household name"), "Miller Family");
    await userEvent.setup().type(screen.getByLabelText("Admin name"), "Jordan");
    await userEvent.setup().type(screen.getByLabelText("Admin PIN"), "2468");
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Complete setup" }));

    expect(fetchSpy).toHaveBeenLastCalledWith(
      "/api/setup/complete",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "X-Daymark-Setup-Token": "paired-device-token",
        },
      }),
    );
  });

  it("requires the QR pairing link when production pairing is enabled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockJsonResponse({ setupRequired: true, pairingRequired: true }),
    );
    renderSetupRoutes("/setup", <SetupWizard />);

    expect(
      await screen.findByText("Pair with your Daymark"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Complete setup" }),
    ).not.toBeInTheDocument();
  });

  it("shows a phone QR handoff while the appliance waits for setup", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJsonResponse({ setupRequired: true, pairingRequired: true }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          setupUrl: "http://daymark.local:8080/setup?pair=paired-device-token",
        }),
      );

    renderSetupRoutes(
      "/appliance?pair=paired-device-token",
      <ApplianceSetup />,
    );

    expect(
      await screen.findByText("Set up with your phone"),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Scan to configure Daymark")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Set up on this display" }),
    ).toHaveAttribute("href", "/setup?pair=paired-device-token");
  });

  it("unlocks settings with the local admin PIN", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => mockJsonResponse({ unlocked: true }));
    renderSetupRoutes("/settings/unlock", <AdminPinUnlock />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Admin PIN"), "2468");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText("settings route")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/session/unlock",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ pin: "2468" }),
      }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/session/current",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("offers a touch keypad without opening the system keyboard", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      mockJsonResponse({ unlocked: true }),
    );
    renderSetupRoutes("/settings/unlock", <AdminPinUnlock />);
    const user = userEvent.setup();

    expect(screen.getByLabelText("Admin PIN")).toHaveAttribute(
      "inputmode",
      "none",
    );
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: "6" }));
    await user.click(screen.getByRole("button", { name: "8" }));
    expect(screen.getByLabelText("Admin PIN")).toHaveValue("2468");

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByLabelText("Admin PIN")).toHaveValue("246");
  });

  it("stays on unlock with a clear error when the browser rejects the session", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockJsonResponse({ unlocked: true }))
      .mockResolvedValueOnce(mockJsonResponse({ unlocked: false }));
    renderSetupRoutes("/settings/unlock", <AdminPinUnlock />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Admin PIN"), "2468");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(
      await screen.findByText(/browser did not save the local unlock session/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("settings route")).not.toBeInTheDocument();
  });

  it("shows unlock errors returned by the API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid_pin", { status: 401 }),
    );
    renderSetupRoutes("/settings/unlock", <AdminPinUnlock />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText("invalid_pin")).toBeInTheDocument();
  });
});
