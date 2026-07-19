import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { DegradedStateBanner } from "../../components/DegradedStateBanner";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { CalendarDayView } from "./CalendarDayView";
import { CalendarStatusBadge } from "./CalendarStatusBadge";
import { familyMemberColorForSource, type FamilyMemberColor } from "../family/memberAppearance";
import {
  dateFromLocalDateKey,
  dateKeyInTimeZone,
  shiftDateKey,
  startOfWeekDateKey
} from "./dateKeys";

type HouseholdResponse = {
  household: { weekStartsOn: "sunday" | "monday" };
  people: FamilyMemberColor[];
};

type CalendarResponse = {
  rangeStart: string;
  rangeEnd: string;
  timezone: string;
  events: Array<{
    id: string;
    title: string;
    start: string;
    end: string;
    isAllDay: boolean;
    sourceName?: string;
    sourceNames?: string[];
    color?: string;
    colors?: string[];
    shared?: boolean;
  }>;
  cacheStatus: "fresh" | "refreshed" | "stale" | "miss";
  degraded: boolean;
  warnings: Array<{ code: string; message: string }>;
};

function getWeekRange(startKey: string): { start: string; end: string } {
  const start = dateFromLocalDateKey(startKey);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function CalendarWeekView(): JSX.Element {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const todayKey = dateKeyInTimeZone(new Date(), timezone);
  const householdQuery = useQuery({
    queryKey: queryKeys.household,
    queryFn: () => apiFetch<HouseholdResponse>("/household/current")
  });
  const baseWeekStartKey = startOfWeekDateKey(
    todayKey,
    householdQuery.data?.household.weekStartsOn ?? "monday"
  );
  const weekStartKey = shiftDateKey(baseWeekStartKey, weekOffset * 7);
  const { start, end } = getWeekRange(weekStartKey);
  const queryKey = ["calendar-week", start, end, timezone] as const;
  const eventsUrl = `/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=${encodeURIComponent(timezone)}`;
  const calendarQuery = useQuery({
    queryKey,
    queryFn: () => apiFetch<CalendarResponse>(eventsUrl),
    enabled: householdQuery.isSuccess
  });

  if (householdQuery.isLoading || calendarQuery.isLoading) {
    return <LoadingState label="Loading calendar..." />;
  }

  if (householdQuery.isError) {
    return <ErrorState message={householdQuery.error.message} />;
  }

  if (calendarQuery.isError) {
    return <ErrorState message={calendarQuery.error.message} />;
  }

  const data = calendarQuery.data;
  if (!data) {
    return <ErrorState message="Calendar data unavailable." />;
  }

  const eventsByDay = new Map<string, CalendarResponse["events"]>();
  for (const rawEvent of data.events) {
    const sourceNames = rawEvent.sourceNames?.length
      ? rawEvent.sourceNames
      : [rawEvent.sourceName ?? "Calendar"];
    const providerColors = rawEvent.colors?.length ? rawEvent.colors : [rawEvent.color];
    const colors = sourceNames.map(
      (sourceName, index) =>
        familyMemberColorForSource(sourceName, householdQuery.data?.people ?? []) ??
        providerColors[index] ??
        rawEvent.color ??
        "#64748b"
    );
    const event = { ...rawEvent, color: colors[0], colors };
    const key = event.isAllDay
      ? event.start.slice(0, 10)
      : dateKeyInTimeZone(event.start, timezone);
    eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
  }

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    const dayKey = dateKeyInTimeZone(date, timezone);
    return {
      dayKey,
      label: date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric"
      }),
      events: eventsByDay.get(dayKey) ?? []
    };
  });

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#e7e7e5] bg-white p-4">
        <h1 className="font-display text-3xl text-slate-900">Agenda</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous week"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8cbb8] bg-[#fff7ea] text-xl text-slate-700 hover:bg-[#fcedd8]"
            onClick={() => setWeekOffset((value) => value - 1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="min-h-[40px] rounded-full border border-[#d8cbb8] bg-[#fff7ea] px-3 text-sm font-semibold text-slate-700 hover:bg-[#fcedd8]"
            onClick={() => setWeekOffset(0)}
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next week"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8cbb8] bg-[#fff7ea] text-xl text-slate-700 hover:bg-[#fcedd8]"
            onClick={() => setWeekOffset((value) => value + 1)}
          >
            ›
          </button>
          <button
            type="button"
            disabled={isRefreshing}
            className="min-h-[40px] rounded-md border border-[#d8cbb8] bg-[#fff7ea] px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-[#fcedd8]"
            onClick={async () => {
              setIsRefreshing(true);
              setRefreshError(null);
              try {
                const refreshed = await apiFetch<CalendarResponse>(`${eventsUrl}&refresh=true`);
                queryClient.setQueryData(queryKey, refreshed);
              } catch (error) {
                setRefreshError(error instanceof Error ? error.message : "Calendar refresh failed.");
              } finally {
                setIsRefreshing(false);
              }
            }}
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
          <CalendarStatusBadge cacheStatus={data.cacheStatus} />
        </div>
      </div>

      {refreshError || data.warnings.length > 0 ? (
        <DegradedStateBanner
          message={[refreshError, ...data.warnings.map((item) => item.message)].filter(Boolean).join(" ")}
        />
      ) : null}

      <div className="min-w-0 rounded-md border border-[#e7e7e5] bg-white p-2 sm:p-3">
        <div
          data-testid="week-grid"
          className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 xl:gap-3"
        >
          {days.map((day) => (
            <CalendarDayView
              key={day.dayKey}
              title={day.label}
              events={day.events}
              compact
            />
          ))}
        </div>
      </div>
    </section>
  );
}
