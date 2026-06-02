import { screen, waitFor } from "@testing-library/react";
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

  it("imports demo calendar sources and toggles source visibility", async () => {
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
  });
});
