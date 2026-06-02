import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";

type AccountsResponse = {
  accounts: Array<{
    id: string;
    provider: string;
    displayName?: string | null;
    email?: string | null;
    reauthorizationRequired: boolean;
  }>;
};

type SourcesResponse = {
  sources: Array<{
    id: string;
    connectedAccountId: string;
    externalCalendarId: string;
    displayName: string;
    color?: string | null;
    enabled: boolean;
    personId?: string | null;
    personName?: string | null;
  }>;
};

type HouseholdResponse = {
  people: Array<{
    id: string;
    displayName: string;
  }>;
};

type CalendarSource = SourcesResponse["sources"][number];

type SourcePatch = {
  enabled?: boolean;
  personId?: string | null;
  displayName?: string;
  color?: string | null;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(error.message) as { message?: string; error?: string };
    return parsed.message ?? parsed.error ?? fallback;
  } catch {
    return error.message || fallback;
  }
}

function CalendarSourceCard({
  source,
  people,
  busySourceId,
  onPatch
}: {
  source: CalendarSource;
  people: HouseholdResponse["people"];
  busySourceId: string | null;
  onPatch: (sourceId: string, patch: SourcePatch) => Promise<void>;
}): JSX.Element {
  const [displayName, setDisplayName] = useState(source.displayName);
  const [color, setColor] = useState(source.color ?? "#8ec5b8");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const isBusy = busySourceId === source.id;
  const normalizedColor = color.trim();
  const hasValidColor = /^#[0-9a-f]{6}$/i.test(normalizedColor);
  const hasChanges =
    displayName.trim() !== source.displayName || normalizedColor !== (source.color ?? "#8ec5b8");

  useEffect(() => {
    setDisplayName(source.displayName);
    setColor(source.color ?? "#8ec5b8");
    setSourceError(null);
  }, [source.id, source.displayName, source.color]);

  return (
    <div className="grid gap-3 rounded-md border border-[#e4dbcc] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-5 w-5 rounded-full border border-[#d8d6d1]"
            style={{ backgroundColor: source.color ?? "#8ec5b8" }}
          />
          <div className="text-sm font-semibold text-slate-900">{source.displayName}</div>
        </div>
        <button
          type="button"
          disabled={isBusy}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            source.enabled
              ? "bg-emerald-100 text-emerald-800"
              : "bg-slate-100 text-slate-600"
          }`}
          onClick={async () => {
            setSourceError(null);
            try {
              await onPatch(source.id, { enabled: !source.enabled });
            } catch (error) {
              setSourceError(getErrorMessage(error, "Failed to update visibility."));
            }
          }}
        >
          {source.enabled ? "Enabled" : "Disabled"}
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_96px_auto]">
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Source name</span>
          <input
            value={displayName}
            disabled={isBusy}
            onChange={(event) => setDisplayName(event.target.value)}
            className="min-h-[38px] rounded-md border border-[#d9d8d4] bg-white px-2 text-sm text-slate-900"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Color</span>
          <input
            value={color}
            disabled={isBusy}
            type="color"
            onChange={(event) => setColor(event.target.value)}
            className="min-h-[38px] rounded-md border border-[#d9d8d4] bg-white px-2 py-1"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            disabled={isBusy || !hasChanges || displayName.trim().length === 0 || !hasValidColor}
            className="min-h-[38px] rounded-md border border-[#c7b8a2] bg-[#fff7ea] px-3 text-sm font-semibold text-slate-800 hover:bg-[#fcedd8] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={async () => {
              setSourceError(null);
              try {
                await onPatch(source.id, {
                  displayName: displayName.trim(),
                  color: normalizedColor
                });
              } catch (error) {
                setSourceError(getErrorMessage(error, "Failed to save source."));
              }
            }}
          >
            Save
          </button>
        </div>
      </div>

      <label className="grid gap-1 md:max-w-xs">
        <span className="text-xs font-medium text-slate-600">Assigned person</span>
        <select
          value={source.personId ?? ""}
          disabled={isBusy}
          className="min-h-[38px] rounded-md border border-[#d9d8d4] bg-white px-2 text-sm text-slate-900"
          onChange={async (event) => {
            setSourceError(null);
            try {
              await onPatch(source.id, { personId: event.target.value || null });
            } catch (error) {
              setSourceError(getErrorMessage(error, "Failed to assign person."));
            }
          }}
        >
          <option value="">Unassigned</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.displayName}
            </option>
          ))}
        </select>
      </label>
      {sourceError ? <p className="text-xs text-rose-700">{sourceError}</p> : null}
    </div>
  );
}

export function GoogleCalendarSettings(): JSX.Element {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);
  const [busySourceId, setBusySourceId] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["calendar-accounts"],
    queryFn: () => apiFetch<AccountsResponse>("/calendar/accounts")
  });
  const sourcesQuery = useQuery({
    queryKey: ["calendar-sources"],
    queryFn: () => apiFetch<SourcesResponse>("/calendar/sources")
  });
  const peopleQuery = useQuery({
    queryKey: ["household-people-for-calendar"],
    queryFn: () => apiFetch<HouseholdResponse>("/household/current")
  });
  const oauthStatusQuery = useQuery({
    queryKey: ["google-oauth-status"],
    queryFn: () => apiFetch<{ available: boolean; redirectUri: string | null }>("/integrations/google/status")
  });

  if (accountsQuery.isLoading || sourcesQuery.isLoading || peopleQuery.isLoading || oauthStatusQuery.isLoading) {
    return <LoadingState label="Loading calendar settings..." />;
  }
  if (accountsQuery.isError) {
    return <ErrorState message={accountsQuery.error.message} />;
  }
  if (sourcesQuery.isError) {
    return <ErrorState message={sourcesQuery.error.message} />;
  }
  if (peopleQuery.isError) {
    return <ErrorState message={peopleQuery.error.message} />;
  }
  if (oauthStatusQuery.isError) {
    return <ErrorState message={oauthStatusQuery.error.message} />;
  }

  const accounts = accountsQuery.data?.accounts ?? [];
  const sources = sourcesQuery.data?.sources ?? [];
  const people = peopleQuery.data?.people ?? [];
  const oauthAvailable = oauthStatusQuery.data?.available ?? false;
  const patchSource = async (sourceId: string, patch: SourcePatch): Promise<void> => {
    setBusySourceId(sourceId);
    try {
      await apiFetch(`/calendar/sources/${sourceId}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["calendar-sources"] }),
        queryClient.invalidateQueries({ queryKey: ["calendar-week"] }),
        queryClient.invalidateQueries({ queryKey: ["calendar-week-schedule"] })
      ]);
    } finally {
      setBusySourceId(null);
    }
  };

  return (
    <section className="grid gap-3 rounded-md border border-[#e0d6c7] bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">Google Calendar</h2>
      <p className="text-sm text-slate-600">
        Connect and import sources, then choose which calendars are visible on the tablet.
      </p>
      {status ? <p className="text-sm text-slate-700">{status}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!oauthAvailable}
          className="min-h-[44px] rounded-md bg-[#0f766e] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d5f59]"
          onClick={async () => {
            try {
              const result = await apiFetch<{ available: boolean; authUrl?: string; message?: string }>(
                "/integrations/google/connect"
              );
              if (result.authUrl) {
                window.location.assign(result.authUrl);
                return;
              }
              setStatus(result.message ?? "Google OAuth is unavailable.");
            } catch (error) {
              setStatus(getErrorMessage(error, "Google OAuth is unavailable."));
            }
          }}
        >
          Connect Google
        </button>
        <button
          type="button"
          className="min-h-[44px] rounded-md border border-[#c7b8a2] bg-[#fff7ea] px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-[#fcedd8]"
          onClick={async () => {
            try {
              const result = await apiFetch<{ imported: number }>("/calendar/sources/import-from-google", {
                method: "POST"
              });
              setStatus(`Imported ${result.imported} sources.`);
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["calendar-accounts"] }),
                queryClient.invalidateQueries({ queryKey: ["calendar-sources"] }),
                queryClient.invalidateQueries({ queryKey: ["calendar-week"] }),
                queryClient.invalidateQueries({ queryKey: ["calendar-week-schedule"] })
              ]);
            } catch (error) {
              setStatus(getErrorMessage(error, "Failed to import calendars."));
            }
          }}
        >
          Import calendars
        </button>
      </div>
      {!oauthAvailable ? (
        <p className="text-xs text-amber-700">
          Google OAuth is not configured in environment variables yet.
        </p>
      ) : null}

      <div className="grid gap-2 rounded-md border border-[#ece6db] bg-[#fbf8f3] p-3">
        <h3 className="text-sm font-semibold text-slate-900">Connected accounts</h3>
        {accounts.length === 0 ? (
          <p className="text-sm text-slate-600">No connected accounts yet.</p>
        ) : (
          accounts.map((account) => (
            <div key={account.id} className="rounded-md border border-[#e4dbcc] bg-white px-3 py-2 text-sm">
              <div className="font-semibold text-slate-900">
                {account.displayName || "Google account"}
              </div>
              <div className="text-slate-600">{account.email || "No email available"}</div>
            </div>
          ))
        )}
      </div>

      <div className="grid gap-2 rounded-md border border-[#ece6db] bg-[#fbf8f3] p-3">
        <h3 className="text-sm font-semibold text-slate-900">Calendar sources</h3>
        {sources.length === 0 ? (
          <p className="text-sm text-slate-600">Import calendars to configure sources.</p>
        ) : (
          sources.map((source) => (
            <CalendarSourceCard
              key={source.id}
              source={source}
              people={people}
              busySourceId={busySourceId}
              onPatch={patchSource}
            />
          ))
        )}
      </div>
    </section>
  );
}
