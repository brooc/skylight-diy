import { useEffect, useRef } from "react";

type ScreenWakeLockSentinel = EventTarget & {
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
  };
};

export function PwaRuntime(): null {
  const wakeLockRef = useRef<ScreenWakeLockSentinel | null>(null);

  useEffect(() => {
    let disposed = false;

    const requestWakeLock = async (): Promise<void> => {
      const wakeLock = (navigator as WakeLockNavigator).wakeLock;
      if (
        !wakeLock ||
        document.visibilityState !== "visible" ||
        wakeLockRef.current
      )
        return;

      try {
        const sentinel = await wakeLock.request("screen");
        if (disposed) {
          await sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        });
      } catch {
        // Battery saver, browser policy, or an older Fire OS may deny the request.
      }
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pointerdown", requestWakeLock);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pointerdown", requestWakeLock);
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      if (sentinel) void sentinel.release();
    };
  }, []);

  return null;
}
