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
    calendarAccessGranted: boolean;
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

type DiscoveredCalendar = {
  externalCalendarId: string;
  displayName: string;
  color: string;
  tracked: boolean;
  sourceId?: string | null;
  enabled: boolean;
};

type DiscoveryResponse = {
  calendars: DiscoveredCalendar[];
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
  onPatch,
  onUntrack
}: {
  source: CalendarSource;
  people: HouseholdResponse["people"];
  busySourceId: string | null;
  onPatch: (sourceId: string, patch: SourcePatch) => Promise<void>;
  onUntrack: (source: CalendarSource) => Promise<void>;
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
      <div className="flex justify-end border-t border-[#ece6db] pt-3">
        <button
          type="button"
          aria-label={`Stop tracking ${source.displayName}`}
          disabled={isBusy}
          className="min-h-[38px] rounded-md border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={async () => {
            const confirmed = window.confirm(
              `Stop tracking ${source.displayName}? It will no longer appear in Daymark, but you can add it again later.`
            );
            if (!confirmed) return;
            setSourceError(null);
            try {
              await onUntrack(source);
            } catch (error) {
              setSourceError(getErrorMessage(error, "Failed to stop tracking calendar."));
            }
          }}
        >
          {isBusy ? "Removing..." : "Stop tracking"}
        </button>
      </div>
      {sourceError ? <p className="text-xs text-rose-700">{sourceError}</p> : null}
    </div>
  );
}

export function GoogleCalendarSettings(): JSX.Element {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);
  const [busySourceId, setBusySourceId] = useState<string | null>(null);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [discoveredCalendars, setDiscoveredCalendars] = useState<DiscoveredCalendar[] | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [calendarSearch, setCalendarSearch] = useState("");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["calendar-accounts"],
    queryFn: () => apiFetch<AccountsResponse>("/calendar/accounts"),
    refetchOnMount: "always"
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

  useEffect(() => {
    const url = new URL(window.location.href);
    const googleStatus = url.searchParams.get("google");
    if (googleStatus !== "connected" && googleStatus !== "calendar_access_required") {
      return;
    }
    setStatus(
      googleStatus === "connected"
        ? "Google Calendar connected."
        : "Google account identified, but Calendar access was not granted. Reconnect and allow read-only Calendar access."
    );
    void Promise.all([accountsQuery.refetch(), sourcesQuery.refetch()]);
    url.searchParams.delete("google");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

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
  const visibleDiscoveredCalendars = (discoveredCalendars ?? []).filter((calendar) =>
    calendar.displayName.toLocaleLowerCase().includes(calendarSearch.trim().toLocaleLowerCase())
  );
  const selectableVisibleCalendars = visibleDiscoveredCalendars.filter((calendar) => !calendar.tracked);
  const activeAccount = accounts.find((account) => account.id === activeAccountId);
  const startGoogleConnection = async (accountId?: string): Promise<void> => {
    try {
      const suffix = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
      const result = await apiFetch<{ available: boolean; authUrl?: string; message?: string }>(
        `/integrations/google/connect${suffix}`
      );
      if (result.authUrl) {
        window.location.assign(result.authUrl);
        return;
      }
      setStatus(result.message ?? "Google OAuth is unavailable.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Google OAuth is unavailable."));
    }
  };
  const chooseCalendars = async (accountId: string): Promise<void> => {
    setIsDiscovering(true);
    setActiveAccountId(accountId);
    try {
      const result = await apiFetch<DiscoveryResponse>("/calendar/sources/discover-from-google", {
        method: "POST",
        body: JSON.stringify({ accountId })
      });
      setDiscoveredCalendars(result.calendars);
      setSelectedCalendarIds([]);
      setCalendarSearch("");
      setStatus("Choose the calendars Daymark should track.");
    } catch (error) {
      setDiscoveredCalendars(null);
      setStatus(getErrorMessage(error, "Failed to load calendars."));
    } finally {
      setIsDiscovering(false);
    }
  };
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
  const untrackSource = async (source: CalendarSource): Promise<void> => {
    setBusySourceId(source.id);
    try {
      await apiFetch(`/calendar/sources/${source.id}`, { method: "DELETE" });
      setStatus(`${source.displayName} is no longer tracked.`);
      setDiscoveredCalendars(null);
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
        Connect Google, choose which calendars Daymark should track, then configure them below.
      </p>
      {status ? <p className="text-sm text-slate-700">{status}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!oauthAvailable}
          className="min-h-[44px] rounded-md bg-[#0f766e] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d5f59] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void startGoogleConnection()}
        >
          {accounts.length > 0 ? "Add Google Account" : "Connect Google Account"}
        </button>
      </div>
      {!oauthAvailable ? (
        <p className="text-xs text-amber-700">
          Google OAuth is not configured in environment variables yet.
        </p>
      ) : null}
      {accounts.length === 0 ? (
        <p className="text-xs text-slate-600">Connect Google before choosing calendars.</p>
      ) : null}
      {discoveredCalendars ? (
        <div className="grid gap-3 rounded-md border border-[#d8ccba] bg-[#fffaf1] p-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Choose calendars for {activeAccount?.email || activeAccount?.displayName || "Google account"}
            </h3>
            <p className="text-xs text-slate-600">
              New calendars are not selected by default. Added calendars start enabled and unassigned.
            </p>
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-slate-600">Search calendars</span>
            <input
              type="search"
              value={calendarSearch}
              onChange={(event) => setCalendarSearch(event.target.value)}
              placeholder="Search by name"
              className="min-h-[40px] rounded-md border border-[#d9d8d4] bg-white px-3 text-sm text-slate-900"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-[#c7b8a2] bg-white px-3 py-2 text-xs font-semibold text-slate-800"
              onClick={() => {
                const visibleIds = selectableVisibleCalendars.map((calendar) => calendar.externalCalendarId);
                setSelectedCalendarIds((current) => [...new Set([...current, ...visibleIds])]);
              }}
            >
              Select all visible
            </button>
            <button
              type="button"
              className="rounded-md border border-[#c7b8a2] bg-white px-3 py-2 text-xs font-semibold text-slate-800"
              onClick={() => {
                const visibleIds = new Set(selectableVisibleCalendars.map((calendar) => calendar.externalCalendarId));
                setSelectedCalendarIds((current) => current.filter((id) => !visibleIds.has(id)));
              }}
            >
              Clear visible
            </button>
          </div>
          <div className="grid max-h-72 gap-2 overflow-y-auto" role="group" aria-label="Google calendars">
            {visibleDiscoveredCalendars.length === 0 ? (
              <p className="text-sm text-slate-600">No calendars match that search.</p>
            ) : (
              visibleDiscoveredCalendars.map((calendar) => (
                <label
                  key={calendar.externalCalendarId}
                  className="flex min-h-[44px] items-center gap-3 rounded-md border border-[#e4dbcc] bg-white px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={calendar.tracked || selectedCalendarIds.includes(calendar.externalCalendarId)}
                    disabled={calendar.tracked}
                    onChange={(event) => {
                      setSelectedCalendarIds((current) => event.target.checked
                        ? [...current, calendar.externalCalendarId]
                        : current.filter((id) => id !== calendar.externalCalendarId));
                    }}
                  />
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 rounded-full border border-[#d8d6d1]"
                    style={{ backgroundColor: calendar.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{calendar.displayName}</span>
                  {calendar.tracked ? (
                    <span className="text-xs font-medium text-slate-500">
                      Already tracked · {calendar.enabled ? "Enabled" : "Disabled"}
                    </span>
                  ) : null}
                </label>
              ))
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={selectedCalendarIds.length === 0 || isImporting}
              className="min-h-[44px] rounded-md bg-[#0f766e] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0d5f59] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={async () => {
                setIsImporting(true);
                try {
                  const result = await apiFetch<{ imported: number }>("/calendar/sources/import-from-google", {
                    method: "POST",
                    body: JSON.stringify({
                      accountId: activeAccountId,
                      externalCalendarIds: selectedCalendarIds
                    })
                  });
                  setStatus(`Added ${result.imported} calendar${result.imported === 1 ? "" : "s"}.`);
                  setDiscoveredCalendars(null);
                  setActiveAccountId(null);
                  setSelectedCalendarIds([]);
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["calendar-sources"] }),
                    queryClient.invalidateQueries({ queryKey: ["calendar-week"] }),
                    queryClient.invalidateQueries({ queryKey: ["calendar-week-schedule"] })
                  ]);
                } catch (error) {
                  setStatus(getErrorMessage(error, "Failed to add calendars."));
                } finally {
                  setIsImporting(false);
                }
              }}
            >
              {isImporting ? "Adding calendars..." : `Add selected (${selectedCalendarIds.length})`}
            </button>
            <button
              type="button"
              className="min-h-[44px] rounded-md border border-[#c7b8a2] bg-white px-3 py-2 text-sm font-semibold text-slate-800"
              onClick={() => {
                setDiscoveredCalendars(null);
                setActiveAccountId(null);
                setSelectedCalendarIds([]);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 rounded-md border border-[#ece6db] bg-[#fbf8f3] p-3">
        <h3 className="text-sm font-semibold text-slate-900">Connected accounts</h3>
        {accounts.length === 0 ? (
          <p className="text-sm text-slate-600">No connected accounts yet.</p>
        ) : (
          accounts.map((account) => (
            <div
              key={account.id}
              role="group"
              aria-label={`Google account ${account.email || account.displayName || account.id}`}
              className="grid gap-3 rounded-md border border-[#e4dbcc] bg-white px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
            >
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">
                  {account.displayName || "Google account"}
                </div>
                <div className="truncate text-slate-600">
                  {account.email || "Reconnect Google to identify this account"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {sources.filter((source) => source.connectedAccountId === account.id).length} tracked calendar
                  {sources.filter((source) => source.connectedAccountId === account.id).length === 1 ? "" : "s"}
                </div>
                {!account.calendarAccessGranted || account.reauthorizationRequired ? (
                  <div className="mt-1 text-xs font-medium text-amber-700">
                    {account.reauthorizationRequired ? "Reconnect required" : "Calendar access required"}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <button
                  type="button"
                  disabled={
                    !account.calendarAccessGranted ||
                    account.reauthorizationRequired ||
                    (isDiscovering && activeAccountId === account.id)
                  }
                  className="min-h-[40px] rounded-md border border-[#c7b8a2] bg-[#fff7ea] px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-[#fcedd8] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void chooseCalendars(account.id)}
                >
                  {isDiscovering && activeAccountId === account.id
                    ? "Loading calendars..."
                    : "Choose calendars"}
                </button>
                {!account.calendarAccessGranted || account.reauthorizationRequired ? (
                  <button
                    type="button"
                    disabled={!oauthAvailable}
                    className="min-h-[40px] rounded-md bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50"
                    onClick={() => void startGoogleConnection(account.id)}
                  >
                    Reconnect
                  </button>
                ) : null}
                <details className="relative">
                  <summary className="flex min-h-[40px] cursor-pointer list-none items-center rounded-md px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                    More
                  </summary>
                  <div className="absolute right-0 top-11 z-20 min-w-[180px] rounded-md border border-[#e4dbcc] bg-white p-2 shadow-lg">
                    <button
                      type="button"
                      disabled={busyAccountId === account.id}
                      className="min-h-[40px] w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      onClick={async () => {
                        const confirmed = window.confirm(
                          `Disconnect ${account.email || account.displayName || "this Google account"}? Its tracked calendars will be removed from Daymark.`
                        );
                        if (!confirmed) return;
                        setBusyAccountId(account.id);
                        try {
                          const result = await apiFetch<{
                            disconnected: boolean;
                            revocationSucceeded: boolean;
                            warning?: string | null;
                          }>(`/integrations/google/accounts/${account.id}`, { method: "DELETE" });
                          setStatus(result.warning || "Google Calendar disconnected.");
                          setDiscoveredCalendars(null);
                          setActiveAccountId(null);
                          setSelectedCalendarIds([]);
                          await Promise.all([
                            queryClient.invalidateQueries({ queryKey: ["calendar-accounts"] }),
                            queryClient.invalidateQueries({ queryKey: ["calendar-sources"] }),
                            queryClient.invalidateQueries({ queryKey: ["calendar-week"] }),
                            queryClient.invalidateQueries({ queryKey: ["calendar-week-schedule"] })
                          ]);
                        } catch (error) {
                          setStatus(getErrorMessage(error, "Failed to disconnect Google Calendar."));
                        } finally {
                          setBusyAccountId(null);
                        }
                      }}
                    >
                      {busyAccountId === account.id ? "Disconnecting..." : "Disconnect account"}
                    </button>
                  </div>
                </details>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="grid gap-2 rounded-md border border-[#ece6db] bg-[#fbf8f3] p-3">
        <h3 className="text-sm font-semibold text-slate-900">Calendar sources</h3>
        <p className="text-xs text-slate-600">
          Disable calendars temporarily, stop tracking calendars you no longer want, or assign them to a person.
        </p>
        {sources.length === 0 ? (
          <p className="text-sm text-slate-600">Import calendars to configure sources.</p>
        ) : (
          accounts.map((account) => {
            const accountSources = sources.filter(
              (source) => source.connectedAccountId === account.id
            );
            if (accountSources.length === 0) return null;
            return (
              <div key={account.id} className="grid gap-2 rounded-md border border-[#e4dbcc] p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {account.email || account.displayName || "Google account"}
                </div>
                {accountSources.map((source) => (
                  <CalendarSourceCard
                    key={source.id}
                    source={source}
                    people={people}
                    busySourceId={busySourceId}
                    onPatch={patchSource}
                    onUntrack={untrackSource}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
