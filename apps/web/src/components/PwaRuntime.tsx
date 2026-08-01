import { useEffect, useRef } from "react";

type ScreenWakeLockSentinel = EventTarget & {
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
  };
};

const BUILD_CHECK_INTERVAL_MS = 60_000;
const BUILD_ASSET_PATTERN = /\/assets\/index-[^"'?]+\.js/;

export function daymarkBuildAssetFromHtml(html: string): string | null {
  return html.match(BUILD_ASSET_PATTERN)?.[0] ?? null;
}

export function currentDaymarkBuildAsset(
  scripts: Iterable<HTMLScriptElement>,
): string | null {
  for (const script of scripts) {
    if (!script.src) continue;
    const path = new URL(script.src, window.location.href).pathname;
    if (BUILD_ASSET_PATTERN.test(path)) return path;
  }
  return null;
}

export function daymarkBuildReloadUrl(
  currentUrl: string,
  buildAsset: string,
): string {
  const url = new URL(currentUrl);
  url.searchParams.set("daymark-build", buildAsset.split("/").pop() ?? buildAsset);
  return url.toString();
}

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

  useEffect(() => {
    let disposed = false;

    const checkForNewBuild = async (): Promise<void> => {
      if (disposed || document.visibilityState !== "visible") return;

      const currentAsset = currentDaymarkBuildAsset(document.scripts);
      if (!currentAsset) return;

      try {
        const checkUrl = new URL("/", window.location.origin);
        checkUrl.searchParams.set("daymark-shell-check", Date.now().toString());
        const response = await fetch(checkUrl, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return;

        const latestAsset = daymarkBuildAssetFromHtml(await response.text());
        if (!latestAsset || latestAsset === currentAsset || disposed) return;

        window.location.replace(
          daymarkBuildReloadUrl(window.location.href, latestAsset),
        );
      } catch {
        // Staying on the cached shell is preferable while Daymark is offline.
      }
    };

    const handleResume = (): void => {
      void checkForNewBuild();
    };
    const interval = window.setInterval(
      () => void checkForNewBuild(),
      BUILD_CHECK_INTERVAL_MS,
    );
    window.addEventListener("daymark-display-resume", handleResume);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("daymark-display-resume", handleResume);
    };
  }, []);

  return null;
}
