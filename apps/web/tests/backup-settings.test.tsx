import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackupSettings } from "../src/features/settings/BackupSettings";
import { mockJsonResponse, renderWithProviders } from "./helpers/test-utils";

const configuredStatus = {
  available: true,
  configured: true,
  state: "idle",
  lastSuccessAt: "2026-07-30T10:15:00.000Z",
  lastAttemptAt: "2026-07-30T10:15:00.000Z",
  lastBackupName: "daymark-20260730T101500Z.tar.gz.age",
  lastBackupBytes: 1_572_864,
  message: "Encrypted backup uploaded to Google Drive.",
  recoveryKeyAvailable: true,
  updatedAt: "2026-07-30T10:16:00.000Z",
} as const;

describe("BackupSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("explains which production data is backed up", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockJsonResponse(configuredStatus),
    );

    renderWithProviders(<BackupSettings />, { route: "/settings" });

    expect(
      await screen.findByRole("heading", { name: "Google Drive backup" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Google calendar cache/)).toBeInTheDocument();
    expect(screen.getByText(/daymark-20260730T101500Z/)).toHaveTextContent(
      "1.5 MB",
    );
    expect(
      screen.getByRole("button", { name: "Download recovery key" }),
    ).toBeInTheDocument();
  });

  it("queues an immediate backup", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_input, init) =>
        mockJsonResponse(
          init?.method === "POST"
            ? { ...configuredStatus, state: "queued" }
            : configuredStatus,
        ),
      );

    renderWithProviders(<BackupSettings />, { route: "/settings" });
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Back up now" }));

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/system/backup",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows one-time setup guidance before Drive is connected", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockJsonResponse({
        ...configuredStatus,
        configured: false,
        state: "not_configured",
        recoveryKeyAvailable: false,
      }),
    );

    renderWithProviders(<BackupSettings />, { route: "/settings" });

    expect(
      await screen.findByText("Google Drive is not connected for backups."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back up now" }),
    ).not.toBeInTheDocument();
  });
});
