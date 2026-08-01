import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currentDaymarkBuildAsset,
  daymarkBuildAssetFromHtml,
  daymarkBuildReloadUrl,
  PwaRuntime,
} from "../src/components/PwaRuntime";
import { daymarkUpdateReloadUrl } from "../src/features/settings/UpdateSettings";

class TestWakeLockSentinel extends EventTarget {
  release = vi.fn(async () => undefined);
}

describe("PwaRuntime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "wakeLock");
  });

  it("keeps the visible dashboard awake and reacquires a released lock on interaction", async () => {
    const first = new TestWakeLockSentinel();
    const second = new TestWakeLockSentinel();
    const request = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");

    const view = render(<PwaRuntime />);
    await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));

    first.dispatchEvent(new Event("release"));
    fireEvent.pointerDown(window);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));

    view.unmount();
    await waitFor(() => expect(second.release).toHaveBeenCalledTimes(1));
  });

  it("does nothing when the browser does not support screen wake locks", () => {
    expect(() => render(<PwaRuntime />)).not.toThrow();
  });

  it("detects a newly published app shell and creates a cache-busting reload URL", () => {
    const script = document.createElement("script");
    script.src = "/assets/index-old.js";

    expect(currentDaymarkBuildAsset([script])).toBe(
      "/assets/index-old.js",
    );
    expect(
      daymarkBuildAssetFromHtml(
        '<script type="module" src="/assets/index-new.js"></script>',
      ),
    ).toBe("/assets/index-new.js");
    expect(
      daymarkBuildReloadUrl(
        "http://daymark.local:8080/settings?section=family",
        "/assets/index-new.js",
      ),
    ).toBe(
      "http://daymark.local:8080/settings?section=family&daymark-build=index-new.js",
    );
    expect(
      daymarkUpdateReloadUrl(
        "http://daymark.local:8080/settings",
        "2026-08-01T08:00:00.000Z",
      ),
    ).toBe(
      "http://daymark.local:8080/settings?daymark-update=2026-08-01T08%3A00%3A00.000Z",
    );
  });
});
