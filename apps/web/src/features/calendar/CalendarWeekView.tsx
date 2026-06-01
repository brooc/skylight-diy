import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";
import { DegradedStateBanner } from "../../components/DegradedStateBanner";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { CalendarDayView } from "./CalendarDayView";
import { CalendarStatusBadge } from "./CalendarStatusBadge";

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
    color?: string;
  }>;
  cacheStatus: "fresh" | "refreshed" | "stale" | "miss";
  degraded: boolean;
  warnings: Array<{ code: string; message: string }>;
};

function getWeekRange(now = new Date()): { start: string; end: string } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

function toDayKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function CalendarWeekView(): JSX.Element {
  const queryClient = useQueryClient();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const { start, end } = getWeekRange();
  const calendarQuery = useQuery({
    queryKey: ["calendar-week", start, end, timezone],
    queryFn: () =>
      apiFetch<CalendarResponse>(
        `/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=${encodeURIComponent(timezone)}`
      )
  });

  if (calendarQuery.isLoading) {
    return <LoadingState label="Loading calendar..." />;
  }

  if (calendarQuery.isError) {
    return <ErrorState message={calendarQuery.error.message} />;
  }

  const data = calendarQuery.data;
  if (!data) {
    return <ErrorState message="Calendar data unavailable." />;
  }

  const eventsByDay = new Map<string, CalendarResponse["events"]>();
  for (const event of data.events) {
    const key = toDayKey(event.start);
    eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
  }

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    const dayKey = date.toISOString().slice(0, 10);
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
        <h1 className="font-display text-3xl text-slate-900">Week calendar</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="min-h-[40px] rounded-md border border-[#d8cbb8] bg-[#fff7ea] px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-[#fcedd8]"
            onClick={async () => {
              await queryClient.invalidateQueries({ queryKey: ["calendar-week"] });
            }}
          >
            Refresh
          </button>
          <CalendarStatusBadge cacheStatus={data.cacheStatus} />
        </div>
      </div>

      {data.warnings.length > 0 ? (
        <DegradedStateBanner message={data.warnings.map((item) => item.message).join(" ")} />
      ) : null}

      <div className="overflow-x-auto rounded-md border border-[#e7e7e5] bg-white p-3">
        <div className="grid min-w-[1120px] grid-flow-col auto-cols-[minmax(220px,1fr)] gap-3">
          {days.map((day) => (
            <CalendarDayView key={day.dayKey} title={day.label} events={day.events} />
          ))}
        </div>
      </div>
    </section>
  );
}
