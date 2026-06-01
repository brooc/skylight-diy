import { useState } from "react";
import { apiFetch } from "../../api/client";

export function GoogleCalendarSettings(): JSX.Element {
  const [status, setStatus] = useState<string | null>(null);

  return (
    <section className="grid gap-3 rounded-md border border-[#e0d6c7] bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">Google Calendar</h2>
      <p className="text-sm text-slate-600">
        OAuth connect/import routes are scaffolded and ready for the next integration slice.
      </p>
      {status ? <p className="text-sm text-slate-700">{status}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-[44px] rounded-md bg-[#0f766e] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d5f59]"
          onClick={async () => {
            const result = await apiFetch<{ message: string }>("/integrations/google/connect");
            setStatus(result.message);
          }}
        >
          Connect Google
        </button>
        <button
          type="button"
          className="min-h-[44px] rounded-md border border-[#c7b8a2] bg-[#fff7ea] px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-[#fcedd8]"
          onClick={async () => {
            const result = await apiFetch<{ imported: number }>("/calendar/sources/import-from-google", {
              method: "POST"
            });
            setStatus(`Imported ${result.imported} sources.`);
          }}
        >
          Import calendars
        </button>
      </div>
    </section>
  );
}
