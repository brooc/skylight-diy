import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FastifyInstance } from "fastify";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { GoogleCalendarSettings } from "../src/features/settings/GoogleCalendarSettings";
import {
  calendarSources,
  connectedAccounts,
  households,
} from "../../../packages/db/src/index";
import { encryptToken } from "../../api/src/modules/integrations/token-crypto";
import {
  createRealApiApp,
  installRealApiFetch,
  resetRealApiApp,
  unlockRealApiAdmin,
} from "./helpers/real-api";
import { renderWithProviders } from "./helpers/test-utils";

describe("GoogleCalendarSettings with the real API", () => {
  let app: FastifyInstance;
  let restoreFetch: (() => void) | null = null;
  let adminCookie = "";

  beforeAll(async () => {
    app = await createRealApiApp();
  });

  beforeEach(async () => {
    await resetRealApiApp(app);
    adminCookie = await unlockRealApiAdmin(app);
    restoreFetch = installRealApiFetch(app, { cookie: adminCookie });
  });

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = null;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it("edits connected source visibility, write permission, label, color, and assignment", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    const [account] = await app.db
      .insert(connectedAccounts)
      .values({
        householdId: household.id,
        provider: "google",
        providerAccountId: "google-1",
        displayName: "Google Calendar",
        email: "family@example.com",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      })
      .returning();
    await app.db.insert(calendarSources).values({
      householdId: household.id,
      connectedAccountId: account.id,
      provider: "google",
      externalCalendarId: "family@example.com",
      displayName: "Family Calendar",
      color: "#8ec5b8",
      enabled: true,
      sortOrder: 0,
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    const user = userEvent.setup();

    expect(await screen.findAllByText("Google Calendar")).toHaveLength(2);
    expect(screen.getAllByText("family@example.com")).toHaveLength(2);
    expect(await screen.findByText("Family Calendar")).toBeInTheDocument();

    const writePermission = screen.getByRole("checkbox", {
      name: /Allow Daymark to add events/,
    });
    expect(writePermission).not.toBeChecked();
    await user.click(writePermission);
    await waitFor(() => expect(writePermission).toBeChecked());
    const [writableSource] = await app.db.select().from(calendarSources);
    expect(writableSource.allowEventWrites).toBe(true);

    await user.click(screen.getAllByRole("button", { name: "Enabled" })[0]!);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Disabled" }),
      ).toBeInTheDocument(),
    );

    const firstNameInput = screen.getAllByLabelText("Source name")[0]!;
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Family Room");

    const firstColorInput = screen.getAllByLabelText("Color")[0]!;
    fireEvent.change(firstColorInput, { target: { value: "#f7d8d4" } });
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]!);

    expect(await screen.findByText("Family Room")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Source name")[0]).toHaveValue(
      "Family Room",
    );
    expect(screen.getAllByLabelText("Color")[0]).toHaveValue("#f7d8d4");

    const firstPersonSelect = screen.getAllByLabelText("Assigned person")[0]!;
    const parentOption = within(firstPersonSelect).getByRole("option", {
      name: "Parent",
    });
    await user.selectOptions(firstPersonSelect, parentOption);
    await waitFor(() =>
      expect(firstPersonSelect).toHaveValue(parentOption.getAttribute("value")),
    );

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(
      screen.getByRole("button", { name: "Stop tracking Family Room" }),
    );
    expect(
      await screen.findByText("Family Room is no longer tracked."),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Import calendars to configure sources."),
    ).toBeInTheDocument();
    expect(await app.db.select().from(calendarSources)).toHaveLength(0);
  });

  it("discovers calendars and imports only the selection through Settings and the real API", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    await app.db.insert(connectedAccounts).values({
      householdId: household.id,
      provider: "google",
      providerAccountId: "google-1",
      displayName: "Family Gmail",
      email: "family@example.com",
      encryptedAccessToken: encryptToken("google-access-token"),
      scopes: [
        "openid",
        "email",
        "https://www.googleapis.com/auth/calendar.readonly",
      ],
    });
    restoreFetch?.();
    restoreFetch = installRealApiFetch(app, {
      cookie: adminCookie,
      externalFetch: async () =>
        new Response(
          JSON.stringify({
            items: [
              { id: "family", summary: "Family", backgroundColor: "#8ec5b8" },
              { id: "school", summary: "School", backgroundColor: "#dca1b4" },
              {
                id: "holidays",
                summary: "Holidays",
                backgroundColor: "#b7abd8",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    });

    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Choose calendars" }),
    );

    const family = await screen.findByRole("checkbox", { name: "Family" });
    const school = screen.getByRole("checkbox", { name: "School" });
    const holidays = screen.getByRole("checkbox", { name: "Holidays" });
    expect(family).not.toBeChecked();
    expect(school).not.toBeChecked();
    expect(holidays).not.toBeChecked();

    await user.click(school);
    await user.click(screen.getByRole("button", { name: "Add selected (1)" }));
    expect(await screen.findByText("Added 1 calendar.")).toBeInTheDocument();

    const importedSources = await app.db.select().from(calendarSources);
    expect(importedSources).toHaveLength(1);
    expect(importedSources[0]).toMatchObject({
      externalCalendarId: "school",
      displayName: "School",
      enabled: true,
      personId: null,
    });
  });
});
