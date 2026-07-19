import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleCalendarSettings } from "../src/features/settings/GoogleCalendarSettings";
import { mockJsonResponse, renderWithProviders } from "./helpers/test-utils";

describe("GoogleCalendarSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows unavailable oauth state when google credentials are not configured", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/calendar/accounts")) return mockJsonResponse({ accounts: [] });
      if (url.startsWith("/api/calendar/sources")) return mockJsonResponse({ sources: [] });
      if (url.startsWith("/api/household/current")) return mockJsonResponse({ household: {}, people: [] });
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({ available: false, redirectUri: null });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    expect(
      await screen.findByText("Google OAuth is not configured in environment variables yet.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Google" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose calendars" })).toBeDisabled();
  });

  it("surfaces readable discovery error messages from API failures", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/calendar/sources/discover-from-google")) {
        return mockJsonResponse({ error: "admin_unlock_required" }, 401);
      }
      if (url.startsWith("/api/calendar/accounts")) {
        return mockJsonResponse({
          accounts: [
            {
              id: "account-1",
              provider: "google",
              displayName: "Google",
              email: "family@example.com",
              reauthorizationRequired: false,
              calendarAccessGranted: true
            }
          ]
        });
      }
      if (url.startsWith("/api/calendar/sources")) return mockJsonResponse({ sources: [] });
      if (url.startsWith("/api/household/current")) return mockJsonResponse({ household: {}, people: [] });
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({ available: true, redirectUri: "http://localhost:3000/api/integrations/google/callback" });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Choose calendars" }));

    expect(await screen.findByText("admin_unlock_required")).toBeInTheDocument();
  });

  it("requires reconnect when Google identity was granted without Calendar access", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/calendar/accounts")) {
        return mockJsonResponse({
          accounts: [{
            id: "account-1",
            provider: "google",
            displayName: "Family Gmail",
            email: "family@example.com",
            reauthorizationRequired: true,
            calendarAccessGranted: false
          }]
        });
      }
      if (url.startsWith("/api/calendar/sources")) return mockJsonResponse({ sources: [] });
      if (url.startsWith("/api/household/current")) return mockJsonResponse({ household: {}, people: [] });
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({ available: true, redirectUri: "http://localhost/callback" });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    expect(await screen.findByRole("button", { name: "Reconnect Google" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Choose calendars" })).toBeDisabled();
    expect(screen.getByText("Calendar access required")).toBeInTheDocument();
    expect(
      screen.getByText("Reconnect Google and allow read-only Calendar access before choosing calendars.")
    ).toBeInTheDocument();
  });

  it("does not select new calendars by default and adds only the user's selection", async () => {
    let importBody: unknown;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/calendar/sources/discover-from-google")) {
        return mockJsonResponse({
          calendars: [
            {
              externalCalendarId: "family",
              displayName: "Family",
              color: "#8ec5b8",
              tracked: true,
              enabled: false
            },
            {
              externalCalendarId: "school",
              displayName: "School",
              color: "#dca1b4",
              tracked: false,
              enabled: false
            },
            {
              externalCalendarId: "holidays",
              displayName: "Holidays",
              color: "#b7abd8",
              tracked: false,
              enabled: false
            }
          ]
        });
      }
      if (url.startsWith("/api/calendar/sources/import-from-google")) {
        importBody = JSON.parse(String(init?.body));
        return mockJsonResponse({ imported: 1, sources: [] });
      }
      if (url.startsWith("/api/calendar/accounts")) {
        return mockJsonResponse({
          accounts: [{
            id: "account-1",
            provider: "google",
            displayName: "Google",
            email: "family@example.com",
            reauthorizationRequired: false,
            calendarAccessGranted: true
          }]
        });
      }
      if (url.startsWith("/api/calendar/sources")) return mockJsonResponse({ sources: [] });
      if (url.startsWith("/api/household/current")) return mockJsonResponse({ household: {}, people: [] });
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({ available: true, redirectUri: "http://localhost/callback" });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Choose calendars" }));

    const family = await screen.findByRole("checkbox", { name: /Family/ });
    const school = screen.getByRole("checkbox", { name: /School/ });
    const holidays = screen.getByRole("checkbox", { name: /Holidays/ });
    expect(family).toBeChecked();
    expect(family).toBeDisabled();
    expect(school).not.toBeChecked();
    expect(holidays).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Add selected (0)" })).toBeDisabled();

    await user.click(school);
    await user.click(screen.getByRole("button", { name: "Add selected (1)" }));
    expect(importBody).toEqual({ externalCalendarIds: ["school"] });
    expect(await screen.findByText("Added 1 calendar.")).toBeInTheDocument();
  });

  it("shows the connected Gmail address and disconnects after confirmation", async () => {
    let disconnected = false;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/integrations/google/accounts/account-1")) {
        disconnected = true;
        return mockJsonResponse({ disconnected: true, revocationSucceeded: true, warning: null });
      }
      if (url.startsWith("/api/calendar/accounts")) {
        return mockJsonResponse({
          accounts: disconnected ? [] : [{
            id: "account-1",
            provider: "google",
            displayName: "Family Gmail",
            email: "family@example.com",
            reauthorizationRequired: false,
            calendarAccessGranted: true
          }]
        });
      }
      if (url.startsWith("/api/calendar/sources")) return mockJsonResponse({ sources: [] });
      if (url.startsWith("/api/household/current")) return mockJsonResponse({ household: {}, people: [] });
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({ available: true, redirectUri: "http://localhost/callback" });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    expect(await screen.findByText("family@example.com")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Disconnect family@example.com? Its tracked calendars will be removed from Daymark."
    );
    expect(await screen.findByText("Google Calendar disconnected.")).toBeInTheDocument();
    expect(await screen.findByText("No connected accounts yet.")).toBeInTheDocument();
  });
});
