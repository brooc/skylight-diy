import { useState } from "react";
import { apiFetch } from "../../api/client";

export function GoogleCalendarSettings(): JSX.Element {
  const [status, setStatus] = useState<string | null>(null);

  return (
    <section className="grid gap-3 rounded-md border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold">Google Calendar</h2>
      <p className="text-sm text-slate-300">
        OAuth connect/import routes are scaffolded and ready for the next integration slice.
      </p>
      {status ? <p className="text-sm text-slate-200">{status}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-600"
          onClick={async () => {
            const result = await apiFetch<{ message: string }>("/integrations/google/connect");
            setStatus(result.message);
          }}
        >
          Connect Google
        </button>
        <button
          type="button"
          className="rounded-md bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-600"
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
