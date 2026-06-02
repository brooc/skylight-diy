import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { DegradedStateBanner } from "../../components/DegradedStateBanner";
import { queryKeys } from "../../api/queryKeys";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { CalendarStatusBadge } from "../calendar/CalendarStatusBadge";

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

export function TodayDashboard(): JSX.Element {
  const now = new Date();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
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

  const calendarQuery = useQuery({
    queryKey: ["calendar-week-schedule", start, end, timezone],
    queryFn: () =>
      apiFetch<CalendarResponse>(
        `/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=${encodeURIComponent(timezone)}`
      )
  });

  if (householdQuery.isLoading || rewardsQuery.isLoading || mealsQuery.isLoading || calendarQuery.isLoading) {
    return <LoadingState label="Loading dashboard..." />;
  }
  if (householdQuery.isError) return <ErrorState message={householdQuery.error.message} />;
  if (rewardsQuery.isError) return <ErrorState message={rewardsQuery.error.message} />;
  if (mealsQuery.isError) return <ErrorState message={mealsQuery.error.message} />;
  if (calendarQuery.isError) return <ErrorState message={calendarQuery.error.message} />;

  const todayKey = new Date().toISOString().slice(0, 10);
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
      dayKey: date.toISOString().slice(0, 10),
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
      const dayKey = startDate.toISOString().slice(0, 10);
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
  const allDayEvents = (calendarQuery.data?.events ?? [])
    .filter((event) => event.isAllDay)
    .map((event, index) => {
      const startDate = new Date(event.start);
      const endDate = new Date(event.end);
      const startKey = startDate.toISOString().slice(0, 10);
      const rawEndDate = new Date(endDate);
      rawEndDate.setDate(rawEndDate.getDate() - 1);
      const endKey = rawEndDate.toISOString().slice(0, 10);
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
  const startHour = 9;
  const endHour = 21;
  const hourSlots = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const slotHeight = 82;

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
                {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </div>
              <div className="text-2xl leading-none text-slate-500 md:text-[28px]">☀ 80°</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-[#f6f7f9] px-4 py-2 text-sm font-semibold text-slate-700">
                ▦ Schedule
              </div>
              <button
                type="button"
                className="rounded-full bg-[#f6f7f9] px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-[#ebedf0]"
                onClick={async () => {
                  await queryClient.invalidateQueries({ queryKey: ["calendar-week-schedule"] });
                }}
              >
                Refresh
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
            <div className="shrink-0 rounded-full border border-[#2f2f2f66] bg-[#fbfbf9] px-4 py-1 text-xl font-semibold text-slate-700">
              🌴 Vacation 48 days
            </div>
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
        {calendarQuery.data?.warnings.length ? (
          <div className="border-b border-[#ecebe8] px-3 py-2">
            <DegradedStateBanner
              message={calendarQuery.data.warnings.map((warning) => warning.message).join(" ")}
            />
          </div>
        ) : null}
        <div className="max-h-[72vh] overflow-auto">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `76px repeat(${days.length}, minmax(150px, 1fr))`,
              minWidth: `${76 + days.length * 150}px`
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
              const fallbackTitle = day.isToday ? "Camping Trip" : undefined;
              return (
                <div key={`${day.dayKey}-all-day`} className="border-b border-r border-[#ecebe8] p-2">
                  {event || fallbackTitle ? (
                    <div
                      className="truncate rounded-full px-3 py-1 text-[14px] font-semibold text-slate-700"
                      style={{
                        background: event?.striped
                          ? "repeating-linear-gradient(125deg, #d6efd8 0 36px, #f7d8d4 36px 72px, #bee8ea 72px 108px, #e4daf0 108px 144px)"
                          : event?.color ?? "#d6efd8"
                      }}
                    >
                      {event?.title ?? fallbackTitle}
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
                      {hourEvents.map((event) => {
                        const offset = (event.startHour - hour) * slotHeight;
                        const height = Math.max(56, event.durationHours * slotHeight - 8);
                        return (
                          <article
                            key={event.id}
                            className="absolute left-2 right-2 z-10 rounded-[20px] px-3 py-2 text-slate-800"
                            style={{
                              top: offset,
                              height,
                              background: event.striped
                                ? "repeating-linear-gradient(125deg, #d6efd8 0 38px, #f7d8d4 38px 76px, #bee8ea 76px 114px, #e4daf0 114px 152px)"
                                : event.color
                            }}
                          >
                            <div className="text-[20px] font-semibold leading-tight">{event.title}</div>
                            <div className="mt-1 text-[16px] leading-tight text-slate-700">
                              {event.timeLabel}
                            </div>
                            {event.ownerInitial ? (
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
                          </article>
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
      </section>
    </section>
  );
}
