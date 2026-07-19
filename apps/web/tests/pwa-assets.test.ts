import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PWA assets", () => {
  it("provides a fullscreen landscape manifest with installable icons", () => {
    const manifest = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "public/manifest.webmanifest"),
        "utf8",
      ),
    ) as {
      display: string;
      orientation: string;
      icons: Array<{ src: string; sizes: string; purpose: string }>;
    };

    expect(manifest.display).toBe("fullscreen");
    expect(manifest.orientation).toBe("landscape");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192" }),
        expect.objectContaining({ sizes: "512x512", purpose: "any maskable" }),
      ]),
    );
    expect(
      statSync(resolve(process.cwd(), "public/icons/daymark-192.png")).size,
    ).toBeGreaterThan(0);
    expect(
      statSync(resolve(process.cwd(), "public/icons/daymark-maskable-512.png"))
        .size,
    ).toBeGreaterThan(0);
  });

  it("ships an app-shell service worker that leaves API requests uncached", () => {
    const serviceWorker = readFileSync(
      resolve(process.cwd(), "public/sw.js"),
      "utf8",
    );
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
    expect(serviceWorker).toContain('request.mode === "navigate"');
  });
});
