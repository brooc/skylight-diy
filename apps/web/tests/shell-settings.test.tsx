import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { App } from "../src/App";
import { AppShell } from "../src/components/AppShell";
import { SettingsPage } from "../src/features/settings/SettingsPage";
import { createTestQueryClient, mockJsonResponse } from "./helpers/test-utils";

function renderWithRoute(route: string, element: JSX.Element): void {
  render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={createTestQueryClient()}>
        <Routes>
          <Route path={route} element={element} />
          <Route path="/today" element={<div>today route</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function mockSettingsRequests(unlocked: boolean): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("/api/session/current"))
      return mockJsonResponse({ unlocked });
    if (url.startsWith("/api/session/lock"))
      return mockJsonResponse({ unlocked: false });
    if (url.startsWith("/api/calendar/accounts"))
      return mockJsonResponse({ accounts: [] });
    if (url.startsWith("/api/calendar/sources"))
      return mockJsonResponse({ sources: [] });
    if (url.startsWith("/api/household/current")) {
      return mockJsonResponse({
        household: { name: "Test Household", timezone: "America/Los_Angeles" },
        people: [],
      });
    }
    if (url.startsWith("/api/integrations/google/status")) {
      return mockJsonResponse({ available: false, redirectUri: null });
    }
    if (url.startsWith("/api/integrations/tailscale/status")) {
      return mockJsonResponse({ available: false, state: "unavailable" });
    }
    if (url.startsWith("/api/integrations/tailscale/reset")) {
      return mockJsonResponse({ reset: true });
    }
    if (url.startsWith("/api/system/update")) {
      return mockJsonResponse({ available: false, state: "idle" });
    }
    if (url.startsWith("/api/system/device")) {
      return mockJsonResponse({ available: false });
    }
    return mockJsonResponse({}, 404);
  });
}

describe("shell and settings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders app shell navigation and nested outlet content", () => {
    render(
      <MemoryRouter initialEntries={["/chores"]}>
        <Routes>
          <Route
            path="/chores"
            element={
              <AppShell>
                <div>current page</div>
              </AppShell>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("current page")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Calendar/ })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /Tasks/ })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /Agenda/ })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /Settings/ })).toHaveLength(2);

    const desktopSettingsLink = screen.getAllByRole("link", {
      name: /Settings/,
    })[0]!;
    expect(desktopSettingsLink).toHaveClass("min-h-[48px]", "flex-1");
    expect(desktopSettingsLink.closest("aside")).toHaveClass(
      "h-[calc(100dvh-1.5rem)]",
      "overflow-hidden",
    );
  });

  it("wraps route outlet content in the app component", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<div>nested route</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("nested route")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Calendar/ })).toHaveLength(2);
  });

  it("shows locked settings state with unlock link", async () => {
    mockSettingsRequests(false);
    renderWithRoute("/settings", <SettingsPage />);

    expect(await screen.findByText("Settings locked")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Unlock settings" }),
    ).toHaveAttribute("href", "/settings/unlock");
    expect(screen.queryByText("Tablet access")).not.toBeInTheDocument();
  });

  it("hides the optional Tailscale feature when it is disabled", async () => {
    mockSettingsRequests(true);
    renderWithRoute("/settings", <SettingsPage />);

    expect(
      await screen.findByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Tablet access")).not.toBeInTheDocument();
    expect(screen.queryByText(/Tailscale/)).not.toBeInTheDocument();
  });

  it("shows Tailscale bootstrap sign-in without requiring settings unlock", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/session/current"))
        return mockJsonResponse({ unlocked: false });
      if (url.startsWith("/api/integrations/tailscale/status")) {
        return mockJsonResponse({
          available: true,
          state: "NeedsLogin",
          authUrl: "https://login.tailscale.com/a/test",
          hostname: "daymark",
          dnsName: null,
          httpsUrl: null,
          online: false,
          serveState: "pending",
          serveEnableUrl: null,
        });
      }
      return mockJsonResponse({}, 404);
    });
    renderWithRoute("/settings", <SettingsPage />);

    expect(await screen.findByText("Tablet access")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Sign in to Tailscale" }),
    ).toHaveAttribute("href", "https://login.tailscale.com/a/test");
  });

  it("shows the one-time HTTPS approval on the same locked Settings page", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/session/current"))
        return mockJsonResponse({ unlocked: false });
      if (url.startsWith("/api/integrations/tailscale/status")) {
        return mockJsonResponse({
          available: true,
          state: "Running",
          authUrl: null,
          hostname: "daymark",
          dnsName: "daymark.example.ts.net",
          httpsUrl: "https://daymark.example.ts.net",
          online: true,
          serveState: "disabled",
          serveEnableUrl: "https://login.tailscale.com/f/serve?node=test",
        });
      }
      return mockJsonResponse({}, 404);
    });
    renderWithRoute("/settings", <SettingsPage />);

    expect(
      await screen.findByText(/One-time approval is needed/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Enable private HTTPS" }),
    ).toHaveAttribute("href", "https://login.tailscale.com/f/serve?node=test");
  });

  it("locks settings and navigates back to Today", async () => {
    const fetchSpy = mockSettingsRequests(true);
    renderWithRoute("/settings", <SettingsPage />);

    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Lock" }));

    expect(await screen.findByText("today route")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/session/lock",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("lets an unlocked admin reset only the Tailscale connection", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.startsWith("/api/session/current"))
          return mockJsonResponse({ unlocked: true });
        if (url.startsWith("/api/integrations/tailscale/status")) {
          return mockJsonResponse({
            available: true,
            state: "Running",
            authUrl: null,
            hostname: "daymark",
            dnsName: "daymark.example.ts.net",
            httpsUrl: "https://daymark.example.ts.net",
            online: true,
            serveState: "ready",
            serveEnableUrl: null,
          });
        }
        if (url.startsWith("/api/integrations/tailscale/reset")) {
          return mockJsonResponse({ reset: true });
        }
        if (url.startsWith("/api/calendar/accounts"))
          return mockJsonResponse({ accounts: [] });
        if (url.startsWith("/api/calendar/sources"))
          return mockJsonResponse({ sources: [] });
        if (url.startsWith("/api/household/current")) {
          return mockJsonResponse({
            household: {
              name: "Test Household",
              timezone: "America/Los_Angeles",
            },
            people: [],
          });
        }
        if (url.startsWith("/api/integrations/google/status")) {
          return mockJsonResponse({ available: false, redirectUri: null });
        }
        return mockJsonResponse({}, 404);
      });
    renderWithRoute("/settings", <SettingsPage />);

    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", {
          name: "Log out & reset Tailscale",
        }),
      );

    expect(
      screen.getByRole("link", { name: "Manage tailnet-wide HTTPS approval" }),
    ).toHaveAttribute("href", "https://login.tailscale.com/admin/dns");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/integrations/tailscale/reset",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("lets an unlocked appliance admin request an update", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.startsWith("/api/session/current")) {
          return mockJsonResponse({ unlocked: true });
        }
        if (url.startsWith("/api/system/update")) {
          return mockJsonResponse({
            available: true,
            state: "idle",
            installedVersion: "main@1234567",
            targetVersion: null,
            message: null,
            updatedAt: "2026-07-25T12:00:00.000Z",
          });
        }
        if (url.startsWith("/api/calendar/accounts"))
          return mockJsonResponse({ accounts: [] });
        if (url.startsWith("/api/calendar/sources"))
          return mockJsonResponse({ sources: [] });
        if (url.startsWith("/api/household/current")) {
          return mockJsonResponse({
            household: {
              name: "Test Household",
              timezone: "America/Los_Angeles",
            },
            people: [],
          });
        }
        if (url.startsWith("/api/integrations/google/status")) {
          return mockJsonResponse({ available: false, redirectUri: null });
        }
        if (url.startsWith("/api/integrations/tailscale/status")) {
          return mockJsonResponse({ available: false, state: "unavailable" });
        }
        return mockJsonResponse({}, 404);
      });
    renderWithRoute("/settings", <SettingsPage />);

    expect(await screen.findByText("main@1234567")).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Install latest update" }));

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/system/update",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("lets an unlocked appliance admin request the Pi desktop", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.startsWith("/api/session/current")) {
          return mockJsonResponse({ unlocked: true });
        }
        if (url.startsWith("/api/system/device")) {
          return mockJsonResponse(
            input instanceof Request && input.method === "POST"
              ? { accepted: true, action: "desktop" }
              : { available: true },
          );
        }
        if (url.startsWith("/api/system/update")) {
          return mockJsonResponse({ available: false, state: "idle" });
        }
        if (url.startsWith("/api/calendar/accounts")) {
          return mockJsonResponse({ accounts: [] });
        }
        if (url.startsWith("/api/calendar/sources")) {
          return mockJsonResponse({ sources: [] });
        }
        if (url.startsWith("/api/household/current")) {
          return mockJsonResponse({
            household: {
              name: "Test Household",
              timezone: "America/Los_Angeles",
            },
            people: [],
          });
        }
        if (url.startsWith("/api/integrations/google/status")) {
          return mockJsonResponse({ available: false, redirectUri: null });
        }
        if (url.startsWith("/api/integrations/tailscale/status")) {
          return mockJsonResponse({ available: false, state: "unavailable" });
        }
        return mockJsonResponse({}, 404);
      });
    renderWithRoute("/settings", <SettingsPage />);

    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Show Pi desktop" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/system/device",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "desktop" }),
      }),
    );
  });
});
