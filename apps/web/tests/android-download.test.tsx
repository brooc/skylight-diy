import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AndroidDownloadPage } from "../src/features/download/AndroidDownloadPage";

describe("AndroidDownloadPage", () => {
  it("offers the APK hosted by the Daymark appliance", () => {
    render(
      <MemoryRouter>
        <AndroidDownloadPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: "Download Daymark Display" }),
    ).toHaveAttribute("href", "/downloads/daymark-display.apk");
    expect(
      screen.getByText(/built as part of the same Daymark release/),
    ).toBeInTheDocument();
  });
});
