import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { DegradedStateBanner } from "../../components/DegradedStateBanner";
import { queryKeys } from "../../api/queryKeys";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { CalendarStatusBadge } from "../calendar/CalendarStatusBadge";
import { dateKeyInTimeZone, shiftDateKey } from "../calendar/dateKeys";
import { layoutTimedEvents } from "../calendar/layoutTimedEvents";

type RewardsResponse = {
  balances: Array<{
    personId: string;
    displayName: string;
    balance: number;
  }>;
};

type HouseholdResponse = {
  household: {
    name: string;
  };
};

type CalendarResponse = {
  cacheStatus: "fresh" | "refreshed" | "stale" | "miss";
  degraded: boolean;
  warnings: Array<{ code: string; message: string }>;
  events: Array<{
    id: string;
    title: string;
    start: string;
    end: string;
    isAllDay: boolean;
    sourceName?: string;
    color?: string;
  }>;
};

type MealsResponse = {
  days: Array<{
    date: string;
    entries: Array<{
      id: string;
      slot: string;
      mealName?: string | null;
      customTitle?: string | null;
    }>;
  }>;
};

type RenderEvent = {
  id: string;
  dayIndex: number;
  startHour: number;
  durationHours: number;
  title: string;
  timeLabel: string;
  compactTimeLabel: string;
  sourceName: string;
  color: string;
  ownerInitial?: string;
  ownerCount: number;
  striped: boolean;
};

function formatHourLabel(hour: number): string {
  const isPm = hour >= 12;
  const normalized = hour > 12 ? hour - 12 : hour;
  return `${normalized} ${isPm ? "PM" : "AM"}`;
}

function formatEventTime(start: Date, end: Date): string {
  return `${start.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  })} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function formatCompactEventTime(start: Date, end: Date): string {
  const compact = (value: Date) =>
    value
      .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      .replace(/\s?[AP]M$/i, "");
  return `${compact(start)}–${compact(end)}`;
}

export function TodayDashboard(): JSX.Element {
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<RenderEvent | null>(null);
  const [isCalendarRefreshing, setIsCalendarRefreshing] = useState(false);
  const [calendarRefreshError, setCalendarRefreshError] = useState<string | null>(null);

  useEffect(() => {
    const clockInterval = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(clockInterval);
  }, []);

  const householdQuery = useQuery({
    queryKey: queryKeys.household,
    queryFn: () => apiFetch<HouseholdResponse>("/household/current")
  });
  const rewardsQuery = useQuery({
    queryKey: queryKeys.rewardBalances,
    queryFn: () => apiFetch<RewardsResponse>("/rewards/balances")
  });
  const mealsQuery = useQuery({
    queryKey: queryKeys.weekMeals,
    queryFn: () => apiFetch<MealsResponse>("/meals/week")
  });
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const start = startOfToday.toISOString();
  const endDate = new Date(startOfToday);
  endDate.setDate(endDate.getDate() + 7);
  const end = endDate.toISOString();
  const calendarQueryKey = ["calendar-week-schedule", start, end, timezone] as const;
  const calendarEventsUrl = `/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=${encodeURIComponent(timezone)}`;

  const calendarQuery = useQuery({
    queryKey: calendarQueryKey,
    queryFn: () => apiFetch<CalendarResponse>(calendarEventsUrl)
  });

  if (householdQuery.isLoading || rewardsQuery.isLoading || mealsQuery.isLoading || calendarQuery.isLoading) {
    return <LoadingState label="Loading dashboard..." />;
  }
  if (householdQuery.isError) return <ErrorState message={householdQuery.error.message} />;
  if (rewardsQuery.isError) return <ErrorState message={rewardsQuery.error.message} />;
  if (mealsQuery.isError) return <ErrorState message={mealsQuery.error.message} />;
  if (calendarQuery.isError) return <ErrorState message={calendarQuery.error.message} />;

  const todayKey = dateKeyInTimeZone(now, timezone);
  const todaysMeals = mealsQuery.data?.days.find((day) => day.date === todayKey)?.entries ?? [];
  const tonightMeal =
    todaysMeals.find((entry) => entry.slot === "dinner")?.customTitle ??
    todaysMeals.find((entry) => entry.slot === "dinner")?.mealName ??
    "No dinner planned";

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startOfToday);
    date.setDate(startOfToday.getDate() + index);
    return {
      index,
      dayKey: dateKeyInTimeZone(date, timezone),
      weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
      dayNumber: date.getDate(),
      isToday: date.toDateString() === now.toDateString()
    };
  });

  const personPalette = [
    { soft: "#d7efef", accent: "#63bdc6" },
    { soft: "#f7dfe6", accent: "#ee8ea4" },
    { soft: "#e8dff4", accent: "#b69bd3" },
    { soft: "#ddf0db", accent: "#8bc58b" },
    { soft: "#f9e4df", accent: "#e7aa98" }
  ] as const;
  const paletteAt = (index: number) =>
    personPalette[index % personPalette.length] ?? personPalette[0]!;
  const balances = rewardsQuery.data?.balances ?? [];
  const personColorByName = new Map(
    balances.map((person, index) => [
      person.displayName.toLowerCase(),
      paletteAt(index)
    ])
  );
  const fallbackEventPalette = ["#bee8ea", "#f3cfd0", "#e4daf0", "#d5edd7", "#f7d8d4"] as const;
  const fallbackColorAt = (index: number) =>
    fallbackEventPalette[index % fallbackEventPalette.length] ?? fallbackEventPalette[0]!;

  const mappedEvents: RenderEvent[] = (calendarQuery.data?.events ?? [])
    .filter((event) => !event.isAllDay)
    .map((event, index) => {
      const startDate = new Date(event.start);
      const endDate = new Date(event.end);
      const dayKey = dateKeyInTimeZone(startDate, timezone);
      const dayIndex = days.find((day) => day.dayKey === dayKey)?.index ?? -1;
      const startHour = startDate.getHours() + startDate.getMinutes() / 60;
      const durationHours = Math.max(
        0.5,
        (endDate.getTime() - startDate.getTime()) / (60 * 60 * 1000)
      );
      const sourceName = (event.sourceName ?? "").toLowerCase();
      const matchedPersonColor = Array.from(personColorByName.entries()).find(([name]) =>
        sourceName.includes(name)
      )?.[1];
      const matchedPeople = balances.filter((person) =>
        sourceName.includes(person.displayName.toLowerCase())
      );
      const owner = matchedPeople[0];

      return {
        id: event.id,
        dayIndex,
        startHour,
        durationHours,
        title: event.title,
        timeLabel: formatEventTime(startDate, endDate),
        compactTimeLabel: formatCompactEventTime(startDate, endDate),
        sourceName: event.sourceName ?? "Calendar",
        ownerInitial: owner?.displayName.slice(0, 1).toUpperCase(),
        ownerCount: matchedPeople.length,
        striped: matchedPeople.length > 1,
        color:
          matchedPersonColor?.soft ??
          (event.color && /^#[0-9a-f]{6}$/i.test(event.color)
            ? `${event.color}30`
            : fallbackColorAt(index))
      };
    })
    .filter((event) => event.dayIndex >= 0);

  const scheduleEvents = mappedEvents;
  const timedEventLayout = new Map(
    days.flatMap((day) =>
      layoutTimedEvents(
        scheduleEvents
          .filter((event) => event.dayIndex === day.index)
          .map((event) => ({
            id: event.id,
            start: event.startHour,
            end: event.startHour + event.durationHours
          }))
      ).map((layout) => [layout.id, layout] as const)
    )
  );
  const allDayEvents = (calendarQuery.data?.events ?? [])
    .filter((event) => event.isAllDay)
    .map((event, index) => {
      const startKey = event.start.slice(0, 10);
      const endKey = shiftDateKey(event.end.slice(0, 10), -1);
      const startIndex = days.find((day) => day.dayKey === startKey)?.index ?? 0;
      const endIndex = days.find((day) => day.dayKey === endKey)?.index ?? startIndex;

      return {
        id: event.id,
        title: event.title,
        startIndex: Math.max(0, startIndex),
        endIndex: Math.max(startIndex, endIndex),
        striped: endIndex > startIndex,
        color: ["#d6efd8", "#f7d8d4", "#e4daf0", "#bee8ea"][index % 4]
      };
    });
  const startHour = 6;
  const endHour = 22;
  const hourSlots = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const slotHeight = 96;

  return (
    <section className="grid gap-3">
      <section className="relative overflow-hidden rounded-md border border-[#e7e7e5] bg-white">
        <header className="border-b border-[#ecebe8] px-3 pb-2 pt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <h1 className="font-display text-3xl leading-none text-slate-900 md:text-[34px]">
                {householdQuery.data?.household.name ?? "Family"}
              </h1>
              <div className="font-display text-3xl leading-none text-slate-900 md:text-[34px]">
                <time dateTime={now.toISOString()}>
                  {now.toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit"
                  })}
                </time>
              </div>
              <div className="text-2xl leading-none text-slate-500 md:text-[28px]">☀ 80°</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-[#f6f7f9] px-4 py-2 text-sm font-semibold text-slate-700">
                ▦ Schedule
              </div>
              <button
                type="button"
                disabled={isCalendarRefreshing}
                className="rounded-full bg-[#f6f7f9] px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-[#ebedf0]"
                onClick={async () => {
                  setIsCalendarRefreshing(true);
                  setCalendarRefreshError(null);
                  try {
                    const refreshed = await apiFetch<CalendarResponse>(`${calendarEventsUrl}&refresh=true`);
                    queryClient.setQueryData(calendarQueryKey, refreshed);
                  } catch (error) {
                    setCalendarRefreshError(error instanceof Error ? error.message : "Calendar refresh failed.");
                  } finally {
                    setIsCalendarRefreshing(false);
                  }
                }}
              >
                {isCalendarRefreshing ? "Refreshing…" : "Refresh"}
              </button>
              <div className="rounded-full bg-[#f6f7f9] px-4 py-2 text-sm font-semibold text-slate-700">
                ⊘ Filter
              </div>
              {calendarQuery.data ? (
                <CalendarStatusBadge cacheStatus={calendarQuery.data.cacheStatus} />
              ) : null}
            </div>
          </div>
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
            <div className="shrink-0 rounded-full border border-[#d8d6d1] bg-[#fbfbf9] px-4 py-1 text-sm font-semibold text-slate-700">
              🍽 Tonight: {tonightMeal}
            </div>
            {balances.map((person) => (
              <div
                key={person.personId}
                className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-3 py-1.5"
                style={{
                  backgroundColor:
                    personColorByName.get(person.displayName.toLowerCase())?.soft ?? "#ebf3f1"
                }}
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{
                    backgroundColor:
                      personColorByName.get(person.displayName.toLowerCase())?.accent ?? "#8ac7be"
                  }}
                >
                  {person.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="text-base font-semibold text-slate-800">{person.displayName}</div>
                <div className="text-base font-semibold text-slate-800">{person.balance}/20</div>
              </div>
            ))}
          </div>
        </header>
        {calendarRefreshError || calendarQuery.data?.warnings.length ? (
          <div className="border-b border-[#ecebe8] px-3 py-2">
            <DegradedStateBanner
              message={[
                calendarRefreshError,
                ...(calendarQuery.data?.warnings.map((warning) => warning.message) ?? [])
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </div>
        ) : null}
        <div className="max-h-[72vh] overflow-auto">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `76px repeat(${days.length}, minmax(180px, 1fr))`,
              minWidth: `${76 + days.length * 180}px`
            }}
          >
            <div className="sticky top-0 z-20 border-b border-r border-[#ecebe8] bg-white" />
            {days.map((day) => (
              <div
                key={day.dayKey}
                className="sticky top-0 z-20 flex items-center gap-1.5 border-b border-r border-[#ecebe8] bg-white px-3 py-2.5 font-display text-[26px] leading-none text-slate-900 md:text-[34px]"
              >
                <span>{day.weekday}</span>
                {day.isToday ? (
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#ff6b55] text-[19px] text-white">
                    {day.dayNumber}
                  </span>
                ) : (
                  <span>{day.dayNumber}</span>
                )}
              </div>
            ))}

            <div className="border-b border-r border-[#ecebe8] bg-white" />
            {days.map((day) => {
              const dayAllDayEvents = allDayEvents.filter(
                (event) => day.index >= event.startIndex && day.index <= event.endIndex
              );
              const event = dayAllDayEvents[0];
              return (
                <div key={`${day.dayKey}-all-day`} className="border-b border-r border-[#ecebe8] p-2">
                  {event ? (
                    <div
                      className="truncate rounded-full px-3 py-1 text-[14px] font-semibold text-slate-700"
                      style={{
                        background: event?.striped
                          ? "repeating-linear-gradient(125deg, #d6efd8 0 36px, #f7d8d4 36px 72px, #bee8ea 72px 108px, #e4daf0 108px 144px)"
                          : event?.color ?? "#d6efd8"
                      }}
                    >
                      {event.title}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {hourSlots.map((hour) => (
              <Fragment key={`row-${hour}`}>
                <div
                  className="border-r border-[#ecebe8] px-3 py-2 text-slate-500"
                  style={{ height: slotHeight }}
                >
                  <div className="font-display text-[22px] leading-[0.95] md:text-[30px]">
                    {formatHourLabel(hour)}
                  </div>
                </div>
                {days.map((day) => {
                  const hourEvents = scheduleEvents.filter(
                    (event) => event.dayIndex === day.index && Math.floor(event.startHour) === hour
                  );

                  return (
                    <div
                      key={`${day.dayKey}-${hour}`}
                      className="relative border-r border-t border-[#ecebe8]"
                      style={{ height: slotHeight }}
                    >
                      <div
                        aria-hidden="true"
                        data-half-hour-line="true"
                        className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-[#ecebe8]"
                      />
                      {hourEvents.map((event) => {
                        const offset = (event.startHour - hour) * slotHeight;
                        const availableHeight = Math.max(
                          0,
                          (endHour + 1 - event.startHour) * slotHeight - 4
                        );
                        const height = Math.min(
                          Math.max(24, event.durationHours * slotHeight - 6),
                          availableHeight
                        );
                        const layout = timedEventLayout.get(event.id) ?? {
                          column: 0,
                          columnCount: 1
                        };
                        const columnWidth = 100 / layout.columnCount;
                        const isCompact = event.durationHours <= 1 || layout.columnCount > 1;
                        const showOwner = event.durationHours >= 1.5 && layout.columnCount === 1;
                        return (
                          <button
                            type="button"
                            key={event.id}
                            data-event-id={event.id}
                            data-layout-column={layout.column}
                            data-layout-columns={layout.columnCount}
                            data-event-density={isCompact ? "compact" : "comfortable"}
                            aria-label={`${event.title}, ${event.timeLabel}, ${event.sourceName}`}
                            title={`${event.title} · ${event.timeLabel} · ${event.sourceName}`}
                            className="absolute z-10 min-w-0 overflow-hidden rounded-xl px-2 py-1 text-left text-slate-800 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                            onClick={() => setSelectedEvent(event)}
                            style={{
                              top: offset,
                              height,
                              left: `calc(${layout.column * columnWidth}% + 4px)`,
                              width: `calc(${columnWidth}% - 8px)`,
                              background: event.striped
                                ? "repeating-linear-gradient(125deg, #d6efd8 0 38px, #f7d8d4 38px 76px, #bee8ea 76px 114px, #e4daf0 114px 152px)"
                                : event.color
                            }}
                          >
                            <div className={`${isCompact ? "text-[13px]" : "text-[16px]"} break-normal font-semibold leading-tight`}>
                              {event.title}
                            </div>
                            <div className={`${isCompact ? "text-[10px]" : "text-[13px]"} mt-0.5 whitespace-nowrap leading-none text-slate-700`}>
                              {event.compactTimeLabel}
                            </div>
                            {showOwner && event.ownerInitial ? (
                              <div className="absolute bottom-2 right-2 flex items-center gap-1">
                                {event.ownerCount > 1 ? (
                                  <span className="rounded-full bg-white/80 px-1.5 text-[12px] font-semibold text-slate-700">
                                    +{event.ownerCount - 1}
                                  </span>
                                ) : null}
                                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#ffffffaa] bg-[#ffffffaa] text-[12px] font-semibold text-slate-700">
                                  {event.ownerInitial}
                                </span>
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
        <button
          type="button"
          aria-label="Add"
          className="absolute bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#2b98db] text-white shadow-[0_6px_16px_rgba(30,64,175,0.22)] transition-colors hover:bg-[#2588c3]"
          onClick={() => setIsAddMenuOpen((value) => !value)}
        >
          <span className="relative -top-px text-4xl font-normal leading-none">+</span>
        </button>
        {isAddMenuOpen ? (
          <div className="absolute bottom-20 right-5 z-30 grid min-w-[220px] gap-2 rounded-md border border-[#d9d8d4] bg-white p-2 shadow-lg">
            <button
              type="button"
              className="min-h-[40px] rounded-md bg-[#f6f7f9] px-3 text-left text-sm font-semibold text-slate-800 hover:bg-[#ebedf0]"
              onClick={() => navigate("/chores?add=1")}
            >
              Add task
            </button>
            <button
              type="button"
              className="min-h-[40px] rounded-md bg-[#f6f7f9] px-3 text-left text-sm font-semibold text-slate-800 hover:bg-[#ebedf0]"
              onClick={() => navigate("/import?add=1")}
            >
              Add list item
            </button>
            <button
              type="button"
              className="min-h-[40px] rounded-md bg-[#f6f7f9] px-3 text-left text-sm font-semibold text-slate-800 hover:bg-[#ebedf0]"
              onClick={() => navigate("/meals?add=1")}
            >
              Add meal
            </button>
            <div className="rounded-md border border-[#ecebe8] px-3 py-2 text-xs text-slate-500">
              Event creation from calendar is coming in a later version.
            </div>
          </div>
        ) : null}
        {selectedEvent ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-detail-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
            onClick={() => setSelectedEvent(null)}
          >
            <div
              className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="h-2" style={{ backgroundColor: selectedEvent.color }} />
              <div className="p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: selectedEvent.color }}
                      />
                      Calendar event
                    </div>
                    <h2 id="calendar-event-detail-title" className="font-display text-3xl leading-tight text-slate-950">
                      {selectedEvent.title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    aria-label="Close event details"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
                    onClick={() => setSelectedEvent(null)}
                  >
                    ×
                  </button>
                </div>
                <div className="mt-6 grid gap-3 rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-base shadow-sm">◷</span>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time</div>
                      <div className="font-medium text-slate-800">{selectedEvent.timeLabel}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-base shadow-sm">▦</span>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calendar</div>
                      <div className="font-medium text-slate-800">{selectedEvent.sourceName}</div>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-6 min-h-[44px] w-full rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
                  onClick={() => setSelectedEvent(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
