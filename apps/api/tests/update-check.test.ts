import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/env";
import { checkForUpdate } from "../src/routes/update";

const originalChannel = env.DAYMARK_UPDATE_CHANNEL;
const originalRepository = env.DAYMARK_UPDATE_REPOSITORY;

describe("update availability checks", () => {
  beforeEach(() => {
    env.DAYMARK_UPDATE_CHANNEL = "main";
    env.DAYMARK_UPDATE_REPOSITORY = `test/daymark-${Math.random()}`;
  });

  afterAll(() => {
    env.DAYMARK_UPDATE_CHANNEL = originalChannel;
    env.DAYMARK_UPDATE_REPOSITORY = originalRepository;
    vi.unstubAllGlobals();
  });

  it("compares the installed main commit with the latest upstream commit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            sha: "2957f378ca7f6566cdb3f977208efb0191841685",
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(checkForUpdate("main@83fab8c")).resolves.toMatchObject({
      updateAvailable: true,
      latestVersion: "main@2957f37",
      checkError: null,
    });
    await expect(checkForUpdate("main@2957f37")).resolves.toMatchObject({
      updateAvailable: false,
      latestVersion: "main@2957f37",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("selects the highest semantic version on the stable channel", async () => {
    env.DAYMARK_UPDATE_CHANNEL = "stable";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            { ref: "refs/tags/v1.9.0" },
            { ref: "refs/tags/v1.10.0" },
            { ref: "refs/tags/v1.10.0-beta" },
          ]),
          { status: 200 },
        ),
      ),
    );

    await expect(checkForUpdate("1.9.0")).resolves.toMatchObject({
      updateAvailable: true,
      latestVersion: "1.10.0",
    });
  });

  it("reports an unknown state instead of claiming the device is current", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );

    await expect(checkForUpdate("main@83fab8c")).resolves.toMatchObject({
      updateAvailable: null,
      latestVersion: null,
      checkError: "GitHub returned 503",
    });
  });
});
