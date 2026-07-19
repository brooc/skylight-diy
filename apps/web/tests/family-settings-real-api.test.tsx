import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { households, people } from "../../../packages/db/src/index";
import { FamilySettings } from "../src/features/settings/FamilySettings";
import {
  createRealApiApp,
  installRealApiFetch,
  resetRealApiApp,
  unlockRealApiAdmin
} from "./helpers/real-api";
import { renderWithProviders } from "./helpers/test-utils";

describe("FamilySettings with the real API", () => {
  let app: FastifyInstance;
  let restoreFetch: (() => void) | null = null;

  beforeAll(async () => {
    app = await createRealApiApp();
  });

  beforeEach(async () => {
    await resetRealApiApp(app);
    const cookie = await unlockRealApiAdmin(app);
    restoreFetch = installRealApiFetch(app, {
      cookie,
      externalFetch: async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                id: 1,
                name: "Los Angeles",
                admin1: "California",
                country: "United States",
                latitude: 34.0522,
                longitude: -118.2437
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    });
  });

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = null;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it("updates family details, edits a member, and adds a member", async () => {
    renderWithProviders(<FamilySettings />, { route: "/settings" });
    const user = userEvent.setup();

    const familyName = await screen.findByLabelText("Family name");
    expect(familyName).toHaveValue("Test Household");
    await user.clear(familyName);
    await user.type(familyName, "Daymark Family");
    const timezone = screen.getByLabelText("Time zone");
    await user.clear(timezone);
    await user.type(timezone, "America/New_York");
    await user.selectOptions(screen.getByLabelText("First day of week"), "sunday");
    await user.type(screen.getByLabelText("Weather city"), "Los Angeles");
    await user.click(screen.getByRole("button", { name: "Find city" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Los Angeles, California, United States"
      })
    );
    await user.click(screen.getByRole("button", { name: "Save family" }));
    expect(await screen.findByText("Family details saved.")).toBeInTheDocument();

    const kiddoForm = screen.getByRole("form", { name: "Edit Kiddo" });
    const kiddoName = within(kiddoForm).getByLabelText("Member name");
    await user.clear(kiddoName);
    await user.type(kiddoName, "Alex");
    await user.selectOptions(within(kiddoForm).getByLabelText("Role"), "adult");
    await user.click(within(kiddoForm).getByRole("button", { name: "Save" }));
    expect(await within(kiddoForm).findByText("Saved.")).toBeInTheDocument();

    const addMemberForm = screen.getByRole("form", { name: "Add family member" });
    await user.type(within(addMemberForm).getByLabelText("New member name"), "Sam");
    await user.selectOptions(within(addMemberForm).getByLabelText("Role"), "child");
    await user.click(within(addMemberForm).getByRole("button", { name: "Add member" }));
    expect(await screen.findByText("Family member added.")).toBeInTheDocument();
    expect(await screen.findByRole("form", { name: "Edit Sam" })).toBeInTheDocument();

    await waitFor(async () => {
      expect((await app.db.select().from(households))[0]).toMatchObject({
        name: "Daymark Family",
        timezone: "America/New_York",
        weekStartsOn: "sunday",
        locationName: "Los Angeles, California, United States",
        latitude: 34.0522,
        longitude: -118.2437
      });
      expect(await app.db.select().from(people)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ displayName: "Alex", role: "adult" }),
          expect.objectContaining({ displayName: "Sam", role: "child" })
        ])
      );
    });
  });
});
