import type { FastifyInstance } from "fastify";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createTestQueryClient } from "./helpers/test-utils";
import {
  clearRealApiApp,
  createRealApiApp,
  installRealApiFetch,
  resetRealApiApp
} from "./helpers/real-api";
import { RootRedirect, router } from "../src/routes";

describe("router", () => {
  let app: FastifyInstance;
  let restoreFetch: (() => void) | undefined;

  beforeAll(async () => {
    app = await createRealApiApp();
  });

  beforeEach(async () => {
    restoreFetch?.();
    restoreFetch = undefined;
    await clearRealApiApp(app);
  });

  afterAll(async () => {
    restoreFetch?.();
    await app.close();
  });

  it("registers the v0.1 app routes", () => {
    const root = router.routes.find((route) => route.path === "/");
    const childPaths = root?.children?.map((route) => route.index ? "index" : route.path);

    expect(childPaths).toEqual([
      "index",
      "setup",
      "settings/unlock",
      "today",
      "week",
      "chores",
      "meals",
      "import",
      "settings"
    ]);
  });

  it("sends first-run households to setup", async () => {
    restoreFetch = installRealApiFetch(app);

    renderRootRedirect();

    expect(await screen.findByText("Setup route")).toBeInTheDocument();
  });

  it("sends configured households to today", async () => {
    await resetRealApiApp(app);
    restoreFetch = installRealApiFetch(app);

    renderRootRedirect();

    expect(await screen.findByText("Today route")).toBeInTheDocument();
  });
});

function renderRootRedirect() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={createTestQueryClient()}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/setup" element={<div>Setup route</div>} />
          <Route path="/today" element={<div>Today route</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}
