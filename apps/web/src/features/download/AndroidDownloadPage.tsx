import { Link } from "react-router-dom";

export function AndroidDownloadPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-[#f7f7f5] px-4 py-8 text-slate-900">
      <section className="mx-auto grid max-w-2xl gap-5 rounded-lg border border-[#e0d6c7] bg-white p-6 shadow-sm">
        <header className="grid gap-2">
          <div className="font-display text-4xl text-[#0f766e]">D</div>
          <h1 className="text-3xl font-semibold">Daymark Display for Android</h1>
          <p className="text-slate-600">
            Turn this tablet into a dedicated Daymark display connected directly
            to the Raspberry Pi on your home network.
          </p>
        </header>

        <a
          href="/downloads/daymark-display.apk"
          download="Daymark-Display.apk"
          className="flex min-h-[52px] items-center justify-center rounded-md bg-[#0f766e] px-5 py-3 text-center text-base font-semibold text-white hover:bg-[#0d5f59]"
        >
          Download Daymark Display
        </a>

        <div className="grid gap-3 text-sm text-slate-700">
          <h2 className="text-lg font-semibold text-slate-900">Install it</h2>
          <ol className="grid list-decimal gap-2 pl-5">
            <li>Open the downloaded APK from Android&apos;s download notification.</li>
            <li>
              If prompted, allow this browser to install apps from this source,
              then return to the installer.
            </li>
            <li>Install and open <strong>Daymark Display</strong>.</li>
            <li>
              Keep the suggested address, or enter the Pi&apos;s LAN address if
              <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">
                daymark.local
              </code>
              is unavailable.
            </li>
            <li>
              Optionally make Daymark the Home app so it returns automatically
              after startup.
            </li>
          </ol>
        </div>

        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Android warns about apps installed outside Google Play. This APK was
          built as part of the same Daymark release currently running on this Pi.
        </p>

        <Link className="text-sm font-semibold text-[#0f766e] underline" to="/today">
          Return to Daymark
        </Link>
      </section>
    </main>
  );
}
