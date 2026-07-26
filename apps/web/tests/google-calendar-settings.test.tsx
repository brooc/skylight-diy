import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeGoogleBrokerReturn,
  GoogleCalendarSettings,
  googleAuthLaunchTarget,
} from "../src/features/settings/GoogleCalendarSettings";
import { mockJsonResponse, renderWithProviders } from "./helpers/test-utils";

describe("GoogleCalendarSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("shows unavailable state when no Google connection provider is configured", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/calendar/accounts"))
        return mockJsonResponse({ accounts: [] });
      if (url.startsWith("/api/calendar/sources"))
        return mockJsonResponse({ sources: [] });
      if (url.startsWith("/api/household/current"))
        return mockJsonResponse({ household: {}, people: [] });
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({ available: false, redirectUri: null });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    expect(
      await screen.findByText(
        "Google connection is not available on this Daymark installation.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Google Account" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Choose calendars" }),
    ).not.toBeInTheDocument();
  });

  it("decodes the broker return fragment without exposing it to the server", () => {
    const payload = {
      version: 1 as const,
      completionState: "encrypted-local-state",
      envelope: { version: 1, ciphertext: "encrypted-google-tokens" },
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    expect(
      decodeGoogleBrokerReturn(`#daymark-google-oauth=${encoded}`),
    ).toEqual(payload);
    expect(decodeGoogleBrokerReturn("#unrelated=value")).toBeNull();
  });

  it("finishes an encrypted broker return on the local appliance", async () => {
    const brokerReturn = {
      version: 1,
      completionState: "encrypted-local-state",
      envelope: {
        version: 1,
        ephemeralPublicKey: {
          kty: "EC",
          crv: "P-256",
          x: "x",
          y: "y",
        },
        salt: "salt",
        iv: "iv",
        ciphertext: "ciphertext",
        authTag: "tag",
      },
    };
    window.history.replaceState(
      {},
      "",
      `/settings#daymark-google-oauth=${Buffer.from(
        JSON.stringify(brokerReturn),
      ).toString("base64url")}`,
    );
    let completionBody: unknown;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/integrations/google/broker/complete")) {
        completionBody = JSON.parse(String(init?.body));
        return mockJsonResponse({
          connected: true,
          connectionStatus: "connected",
        });
      }
      if (url.startsWith("/api/calendar/accounts"))
        return mockJsonResponse({ accounts: [] });
      if (url.startsWith("/api/calendar/sources"))
        return mockJsonResponse({ sources: [] });
      if (url.startsWith("/api/household/current"))
        return mockJsonResponse({ household: {}, people: [] });
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({
          available: true,
          mode: "broker",
          redirectUri: null,
        });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });

    expect(
      await screen.findByText("Google Calendar connected."),
    ).toBeInTheDocument();
    expect(completionBody).toEqual({
      completionState: brokerReturn.completionState,
      envelope: brokerReturn.envelope,
    });
    expect(window.location.hash).toBe("");
  });

  it("prepares Google OAuth in the system browser", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/integrations/google/connect")) {
        return mockJsonResponse({
          available: true,
          authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=signed",
        });
      }
      if (url.startsWith("/api/calendar/accounts"))
        return mockJsonResponse({ accounts: [] });
      if (url.startsWith("/api/calendar/sources"))
        return mockJsonResponse({ sources: [] });
      if (url.startsWith("/api/household/current")) {
        return mockJsonResponse({ household: {}, people: [] });
      }
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({
          available: true,
          redirectUri: "http://localhost/callback",
        });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: "Connect Google Account" }),
      );

    expect(
      await screen.findByRole("link", { name: "Continue with Google" }),
    ).toHaveAttribute(
      "href",
      "https://accounts.google.com/o/oauth2/v2/auth?state=signed",
    );
    expect(
      await screen.findByText(
        "Google is ready. Continue below to finish connecting.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Complete Google access in the new browser tab, then return to Daymark.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Fully users/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start over" })).toBeEnabled();
  });

  it("uses a Silk app intent from Fully but a browser tab from an installed PWA", () => {
    const authUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?state=fallback";
    expect(
      googleAuthLaunchTarget(authUrl, {
        userAgent: "Mozilla/5.0 Silk/126.1",
        standalone: false,
        fullyKiosk: true,
      }),
    ).toEqual({
      href: "intent://accounts.google.com/o/oauth2/v2/auth?state=fallback#Intent;scheme=https;package=com.amazon.cloud9;end",
      label: "Open Google in Silk",
      instructions:
        "Complete Google access in Silk, then return to Daymark. Fully users must allow other URL schemes.",
      opensExternalTab: false,
    });
    expect(
      googleAuthLaunchTarget(authUrl, {
        userAgent: "Mozilla/5.0 Silk/126.1",
        standalone: true,
        fullyKiosk: false,
      }),
    ).toEqual({
      href: authUrl,
      label: "Continue with Google",
      instructions:
        "Complete Google access in the new browser tab, then return to Daymark.",
      opensExternalTab: true,
    });
  });

  it("removes an expired Google link and starts over with a fresh one", async () => {
    let connectCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/integrations/google/connect")) {
        connectCount += 1;
        return mockJsonResponse({
          available: true,
          authUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${connectCount === 1 ? "expired" : "fresh"}`,
          expiresAt: connectCount === 1 ? 0 : Date.now() + 10 * 60 * 1_000,
        });
      }
      if (url.startsWith("/api/calendar/accounts"))
        return mockJsonResponse({ accounts: [] });
      if (url.startsWith("/api/calendar/sources"))
        return mockJsonResponse({ sources: [] });
      if (url.startsWith("/api/household/current"))
        return mockJsonResponse({ household: {}, people: [] });
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({
          available: true,
          redirectUri: "http://localhost/callback",
        });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Connect Google Account" }),
    );

    expect(
      await screen.findByText(/This Google sign-in link expired/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Continue with Google" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start over" }));

    expect(
      await screen.findByRole("link", { name: "Continue with Google" }),
    ).toHaveAttribute(
      "href",
      "https://accounts.google.com/o/oauth2/v2/auth?state=fresh",
    );
    expect(connectCount).toBe(2);
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
              calendarAccessGranted: true,
              calendarWriteAccessGranted: true,
            },
          ],
        });
      }
      if (url.startsWith("/api/calendar/sources"))
        return mockJsonResponse({ sources: [] });
      if (url.startsWith("/api/household/current"))
        return mockJsonResponse({ household: {}, people: [] });
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({
          available: true,
          redirectUri: "http://localhost:3000/api/integrations/google/callback",
        });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Choose calendars" }),
    );

    expect(
      await screen.findByText("admin_unlock_required"),
    ).toBeInTheDocument();
  });

  it("shows Daymark write control only for Google-writable calendars", async () => {
    let permissionsRefreshed = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/calendar/sources/discover-from-google")) {
        permissionsRefreshed = true;
        return mockJsonResponse({ calendars: [] });
      }
      if (url.startsWith("/api/calendar/accounts")) {
        return mockJsonResponse({
          accounts: [
            {
              id: "account-1",
              provider: "google",
              displayName: "Family Gmail",
              email: "family@example.com",
              reauthorizationRequired: false,
              calendarAccessGranted: true,
              calendarWriteAccessGranted: true,
            },
          ],
        });
      }
      if (url.startsWith("/api/calendar/sources")) {
        return mockJsonResponse({
          sources: [
            {
              id: "source-writer",
              connectedAccountId: "account-1",
              externalCalendarId: "family",
              displayName: "Family",
              enabled: true,
              allowEventWrites: false,
              googleAccessRole: permissionsRefreshed ? "owner" : null,
            },
            {
              id: "source-reader",
              connectedAccountId: "account-1",
              externalCalendarId: "parent",
              displayName: "Parent calendar",
              enabled: true,
              allowEventWrites: false,
              googleAccessRole: permissionsRefreshed ? "reader" : null,
            },
          ],
        });
      }
      if (url.startsWith("/api/household/current")) {
        return mockJsonResponse({ household: {}, people: [] });
      }
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({ available: true, redirectUri: "callback" });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });

    expect(await screen.findByText("Parent calendar")).toBeInTheDocument();
    expect(screen.getByText("View only in Google")).toBeInTheDocument();
    expect(permissionsRefreshed).toBe(true);
    expect(
      screen.getAllByRole("checkbox", {
        name: /Allow Daymark to add events/,
      }),
    ).toHaveLength(1);
  });

  it("requires reconnect when Google identity was granted without Calendar access", async () => {
    let reconnectUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/integrations/google/connect")) {
        reconnectUrl = url;
        return mockJsonResponse({
          available: true,
          message: "Reconnect started.",
        });
      }
      if (url.startsWith("/api/calendar/accounts")) {
        return mockJsonResponse({
          accounts: [
            {
              id: "account-1",
              provider: "google",
              displayName: "Family Gmail",
              email: "family@example.com",
              reauthorizationRequired: true,
              calendarAccessGranted: false,
              calendarWriteAccessGranted: false,
            },
          ],
        });
      }
      if (url.startsWith("/api/calendar/sources"))
        return mockJsonResponse({ sources: [] });
      if (url.startsWith("/api/household/current"))
        return mockJsonResponse({ household: {}, people: [] });
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({
          available: true,
          redirectUri: "http://localhost/callback",
        });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    expect(
      await screen.findByRole("button", { name: "Reconnect" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Add Google Account" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Choose calendars" }),
    ).toBeDisabled();
    expect(screen.getByText("Reconnect required")).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Reconnect" }));
    expect(reconnectUrl).toBe(
      "/api/integrations/google/connect?accountId=account-1",
    );
    expect(await screen.findByText("Reconnect started.")).toBeInTheDocument();
  });

  it("does not select new calendars by default and adds only the user's selection", async () => {
    let discoveryBody: unknown;
    let importBody: unknown;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/calendar/sources/discover-from-google")) {
        discoveryBody = JSON.parse(String(init?.body));
        return mockJsonResponse({
          calendars: [
            {
              externalCalendarId: "family",
              displayName: "Family",
              color: "#8ec5b8",
              tracked: true,
              enabled: false,
            },
            {
              externalCalendarId: "school",
              displayName: "School",
              color: "#dca1b4",
              tracked: false,
              enabled: false,
            },
            {
              externalCalendarId: "holidays",
              displayName: "Holidays",
              color: "#b7abd8",
              tracked: false,
              enabled: false,
            },
          ],
        });
      }
      if (url.startsWith("/api/calendar/sources/import-from-google")) {
        importBody = JSON.parse(String(init?.body));
        return mockJsonResponse({ imported: 1, sources: [] });
      }
      if (url.startsWith("/api/calendar/accounts")) {
        return mockJsonResponse({
          accounts: [
            {
              id: "account-1",
              provider: "google",
              displayName: "Family Gmail",
              email: "family@example.com",
              reauthorizationRequired: false,
              calendarAccessGranted: true,
              calendarWriteAccessGranted: true,
            },
            {
              id: "account-2",
              provider: "google",
              displayName: "Work Gmail",
              email: "work@example.com",
              reauthorizationRequired: false,
              calendarAccessGranted: true,
              calendarWriteAccessGranted: true,
            },
          ],
        });
      }
      if (url.startsWith("/api/calendar/sources"))
        return mockJsonResponse({ sources: [] });
      if (url.startsWith("/api/household/current"))
        return mockJsonResponse({ household: {}, people: [] });
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({
          available: true,
          redirectUri: "http://localhost/callback",
        });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    const user = userEvent.setup();
    const workAccount = await screen.findByRole("group", {
      name: "Google account work@example.com",
    });
    expect(
      screen.getByRole("button", { name: "Add Google Account" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Reconnect" }),
    ).not.toBeInTheDocument();
    await user.click(
      within(workAccount).getByRole("button", { name: "Choose calendars" }),
    );
    expect(discoveryBody).toEqual({ accountId: "account-2" });
    expect(
      screen.getByText("Choose calendars for work@example.com"),
    ).toBeInTheDocument();

    const family = await screen.findByRole("checkbox", { name: /Family/ });
    const school = screen.getByRole("checkbox", { name: /School/ });
    const holidays = screen.getByRole("checkbox", { name: /Holidays/ });
    expect(family).toBeChecked();
    expect(family).toBeDisabled();
    expect(school).not.toBeChecked();
    expect(holidays).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Add selected (0)" }),
    ).toBeDisabled();

    await user.click(school);
    await user.click(screen.getByRole("button", { name: "Add selected (1)" }));
    expect(importBody).toEqual({
      accountId: "account-2",
      externalCalendarIds: ["school"],
    });
    expect(await screen.findByText("Added 1 calendar.")).toBeInTheDocument();
  });

  it("shows the connected Gmail address and disconnects after confirmation", async () => {
    let disconnected = false;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/integrations/google/accounts/account-1")) {
        disconnected = true;
        return mockJsonResponse({
          disconnected: true,
          revocationSucceeded: true,
          warning: null,
        });
      }
      if (url.startsWith("/api/calendar/accounts")) {
        return mockJsonResponse({
          accounts: disconnected
            ? []
            : [
                {
                  id: "account-1",
                  provider: "google",
                  displayName: "Family Gmail",
                  email: "family@example.com",
                  reauthorizationRequired: false,
                  calendarAccessGranted: true,
                  calendarWriteAccessGranted: true,
                },
              ],
        });
      }
      if (url.startsWith("/api/calendar/sources"))
        return mockJsonResponse({ sources: [] });
      if (url.startsWith("/api/household/current"))
        return mockJsonResponse({ household: {}, people: [] });
      if (url.startsWith("/api/integrations/google/status")) {
        return mockJsonResponse({
          available: true,
          redirectUri: "http://localhost/callback",
        });
      }
      return mockJsonResponse({}, 404);
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    expect(await screen.findByText("family@example.com")).toBeInTheDocument();
    const user = userEvent.setup();
    const accountCard = screen.getByRole("group", {
      name: "Google account family@example.com",
    });
    await user.click(within(accountCard).getByText("More"));
    await user.click(
      within(accountCard).getByRole("button", { name: "Disconnect account" }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      "Disconnect family@example.com? Its tracked calendars will be removed from Daymark.",
    );
    expect(
      await screen.findByText("Google Calendar disconnected."),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("No connected accounts yet."),
    ).toBeInTheDocument();
  });
});
