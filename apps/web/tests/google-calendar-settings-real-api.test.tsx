import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GoogleCalendarSettings } from "../src/features/settings/GoogleCalendarSettings";
import {
  createRealApiApp,
  installRealApiFetch,
  resetRealApiApp,
  unlockRealApiAdmin
} from "./helpers/real-api";
import { renderWithProviders } from "./helpers/test-utils";

describe("GoogleCalendarSettings with the real API", () => {
  let app: FastifyInstance;
  let restoreFetch: (() => void) | null = null;

  beforeAll(async () => {
    app = await createRealApiApp();
  });

  beforeEach(async () => {
    await resetRealApiApp(app);
    const cookie = await unlockRealApiAdmin(app);
    restoreFetch = installRealApiFetch(app, { cookie });
  });

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = null;
  });

  afterAll(async () => {
    await app.close();
  });

  it("imports demo calendar sources and edits source visibility, label, color, and assignment", async () => {
    renderWithProviders(<GoogleCalendarSettings />, { route: "/settings" });
    const user = userEvent.setup();

    expect(await screen.findByText("No connected accounts yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Import calendars" }));

    expect(await screen.findByText("Imported 3 sources.")).toBeInTheDocument();
    expect(await screen.findByText("Demo Google Account")).toBeInTheDocument();
    expect(screen.getByText("demo@local.invalid")).toBeInTheDocument();
    expect(await screen.findByText("Family Calendar")).toBeInTheDocument();
    expect(screen.getByText("School Events")).toBeInTheDocument();
    expect(screen.getByText("Activities")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Enabled" })[0]!);
    await waitFor(() => expect(screen.getByRole("button", { name: "Disabled" })).toBeInTheDocument());

    const firstNameInput = screen.getAllByLabelText("Source name")[0]!;
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Family Room");

    const firstColorInput = screen.getAllByLabelText("Color")[0]!;
    fireEvent.change(firstColorInput, { target: { value: "#f7d8d4" } });
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]!);

    expect(await screen.findByText("Family Room")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Source name")[0]).toHaveValue("Family Room");
    expect(screen.getAllByLabelText("Color")[0]).toHaveValue("#f7d8d4");

    const firstPersonSelect = screen.getAllByLabelText("Assigned person")[0]!;
    const parentOption = within(firstPersonSelect).getByRole("option", { name: "Parent" });
    await user.selectOptions(firstPersonSelect, parentOption);
    await waitFor(() => expect(firstPersonSelect).toHaveValue(parentOption.getAttribute("value")));
  });
});
