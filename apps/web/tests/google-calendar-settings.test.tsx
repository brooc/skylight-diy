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
  });

  it("surfaces readable import error messages from API failures", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/calendar/sources/import-from-google")) {
        return mockJsonResponse({ error: "admin_unlock_required" }, 401);
      }
      if (url.startsWith("/api/calendar/accounts")) return mockJsonResponse({ accounts: [] });
      if (url.startsWith("/api/calendar/sources")) return mockJsonResponse({ sources: [] });
      if (url.startsWith("/api/household/current")) return mockJsonResponse({ household: {}, people: [] });
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({ available: true, redirectUri: "http://localhost:3000/api/integrations/google/callback" });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Import calendars" }));

    expect(await screen.findByText("admin_unlock_required")).toBeInTheDocument();
  });
});
