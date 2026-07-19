import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PwaRuntime } from "../src/components/PwaRuntime";

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
});
