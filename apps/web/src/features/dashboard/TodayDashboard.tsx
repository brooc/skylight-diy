import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment } from "react";
import { apiFetch } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { ChoreList } from "../chores/ChoreList";
import { RewardBalance } from "../chores/RewardBalance";

type ChoresResponse = {
  chores: Array<{
    id: string;
    title: string;
    points: number;
    assignedPersonName?: string | null;
    completed: boolean;
  }>;
};

type RewardsResponse = {
  balances: Array<{
    personId: string;
    displayName: string;
    balance: number;
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

type CalendarResponse = {
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

type RenderEvent = {
  id: string;
  dayIndex: number;
  startHour: number;
  durationHours: number;
  title: string;
  timeLabel: string;
  color: string;
};

const demoEvents: RenderEvent[] = [
  {
    id: "demo-1",
    dayIndex: 0,
    startHour: 10,
    durationHours: 1.5,
    title: "Grocery Run",
    timeLabel: "10:00 - 11:30 AM",
    color: "#bee8ea"
  },
  {
    id: "demo-2",
    dayIndex: 1,
    startHour: 9.75,
    durationHours: 1.25,
    title: "Coffee With Diane",
    timeLabel: "9:45 - 11:00 AM",
    color: "#f3cfd0"
  },
  {
    id: "demo-3",
    dayIndex: 2,
    startHour: 9.5,
    durationHours: 0.75,
    title: "Pickup Dry Cleaning",
    timeLabel: "9:30 - 10:15 AM",
    color: "#bfe6e8"
  },
  {
    id: "demo-4",
    dayIndex: 2,
    startHour: 10.5,
    durationHours: 0.5,
    title: "History Test",
    timeLabel: "10:30 - 11:00 AM",
    color: "#f8d9de"
  },
  {
    id: "demo-5",
    dayIndex: 3,
    startHour: 10.5,
    durationHours: 1.5,
    title: "Birthday Party",
    timeLabel: "10:30 - 12:00 PM",
    color: "#e4daf0"
  }
];

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
  const queryClient = useQueryClient();
  const choresQuery = useQuery({
    queryKey: queryKeys.todayChores,
    queryFn: () => apiFetch<ChoresResponse>("/chores/today")
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

  if (choresQuery.isLoading || rewardsQuery.isLoading || mealsQuery.isLoading || calendarQuery.isLoading) {
    return <LoadingState label="Loading dashboard..." />;
  }
  if (choresQuery.isError) return <ErrorState message={choresQuery.error.message} />;
  if (rewardsQuery.isError) return <ErrorState message={rewardsQuery.error.message} />;
  if (mealsQuery.isError) return <ErrorState message={mealsQuery.error.message} />;
  if (calendarQuery.isError) return <ErrorState message={calendarQuery.error.message} />;

  const todayKey = new Date().toISOString().slice(0, 10);
  const tonight =
    mealsQuery.data?.days.find((day) => day.date === todayKey)?.entries[0]?.customTitle ??
    mealsQuery.data?.days.find((day) => day.date === todayKey)?.entries[0]?.mealName ??
    "No dinner planned";

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startOfToday);
    date.setDate(startOfToday.getDate() + index);
    return {
      index,
      dayKey: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })
    };
  });

  const personPalette = [
    { soft: "#d7efef", accent: "#63bdc6" },
    { soft: "#f7dfe6", accent: "#ee8ea4" },
    { soft: "#e8dff4", accent: "#b69bd3" },
    { soft: "#ddf0db", accent: "#8bc58b" },
    { soft: "#f9e4df", accent: "#e7aa98" }
  ];
  const balances = rewardsQuery.data?.balances ?? [];
  const personColorByName = new Map(
    balances.map((person, index) => [
      person.displayName.toLowerCase(),
      personPalette[index % personPalette.length]
    ])
  );
  const fallbackEventPalette = ["#bee8ea", "#f3cfd0", "#e4daf0", "#d5edd7", "#f7d8d4"];

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
      return {
        id: event.id,
        dayIndex,
        startHour,
        durationHours,
        title: event.title,
        timeLabel: formatEventTime(startDate, endDate),
        color:
          matchedPersonColor?.soft ??
          (event.color && /^#[0-9a-f]{6}$/i.test(event.color)
          ? `${event.color}30`
          : fallbackEventPalette[index % fallbackEventPalette.length])
      };
    })
    .filter((event) => event.dayIndex >= 0);

  const scheduleEvents = mappedEvents.length > 0 ? mappedEvents : demoEvents;
  const allDayEvents = (calendarQuery.data?.events ?? []).filter((event) => event.isAllDay);
  const startHour = 9;
  const endHour = 14;
  const hourSlots = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const slotHeight = 80;

  return (
    <section className="grid gap-4">
      <header className="grid gap-2 rounded-md border border-[#e7e7e5] bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <h1 className="font-display text-3xl leading-none text-slate-900 md:text-[48px]">
              Miller Family
            </h1>
            <div className="font-display text-3xl leading-none text-slate-900 md:text-[48px]">
              {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </div>
            <div className="text-2xl leading-none text-slate-500 md:text-[44px]">☀ 80°</div>
          </div>
          <div className="rounded-full bg-[#f6f7f9] px-4 py-2 text-sm font-semibold text-slate-700">
            Schedule
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-[#d8d6d1] bg-[#fbfbf9] px-3 py-1 text-sm font-semibold text-slate-700">
            Vacation 48 days
          </div>
          {balances.map((person) => (
            <div
              key={person.personId}
              className="flex min-h-[40px] items-center gap-2 rounded-full px-3 py-1.5"
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
              <div className="text-sm font-semibold text-slate-800">{person.displayName}</div>
              <div className="rounded-full bg-white/65 px-2 py-0.5 text-xs font-medium text-slate-700">
                {person.balance} pts
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-700">Tonight: {tonight}</p>
      </header>

      <section className="rounded-md border border-[#e7e7e5] bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-xl text-slate-900">Schedule</h3>
          <div className="rounded-full bg-[#f6f7f9] px-3 py-1 text-sm font-medium text-slate-600">
            Week view
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {allDayEvents.length > 0 ? (
            allDayEvents.map((event, index) => (
              <div
                key={event.id}
                className="rounded-full px-3 py-1 text-sm font-semibold text-slate-700"
                style={{ backgroundColor: ["#d6efd8", "#f7d8d4", "#e4daf0", "#bee8ea"][index % 4] }}
              >
                {event.title}
              </div>
            ))
          ) : (
            <div className="rounded-full bg-[#d6efd8] px-3 py-1 text-sm font-semibold text-slate-700">
              Camping Trip
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `84px repeat(${days.length}, minmax(170px, 1fr))`,
              minWidth: `${84 + days.length * 170}px`
            }}
          >
            <div className="border-b border-r border-[#ecebe8]" />
            {days.map((day) => (
              <div
                key={day.dayKey}
                className="border-b border-r border-[#ecebe8] px-3 py-2 font-display text-2xl leading-none text-slate-900"
              >
                {day.label}
              </div>
            ))}

            {hourSlots.map((hour) => (
              <Fragment key={`row-${hour}`}>
                <div
                  className="border-r border-[#ecebe8] px-2 py-1 text-3xl text-slate-500"
                  style={{ height: slotHeight }}
                >
                  <div className="text-xl leading-tight">{formatHourLabel(hour)}</div>
                </div>
                {days.map((day) => {
                  const hourEvents = scheduleEvents.filter(
                    (event) =>
                      event.dayIndex === day.index && Math.floor(event.startHour) === hour
                  );

                  return (
                    <div
                      key={`${day.dayKey}-${hour}`}
                      className="relative border-r border-t border-[#ecebe8]"
                      style={{ height: slotHeight }}
                    >
                      {hourEvents.map((event) => {
                        const offset = (event.startHour - hour) * slotHeight;
                        const height = Math.max(50, event.durationHours * slotHeight - 8);
                        return (
                          <article
                            key={event.id}
                            className="absolute left-2 right-2 z-10 rounded-[18px] px-3 py-2 text-slate-800 shadow-sm"
                            style={{ top: offset, height, backgroundColor: event.color }}
                          >
                            <div className="text-base font-semibold leading-tight">{event.title}</div>
                            <div className="mt-1 text-sm">{event.timeLabel}</div>
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
      </section>

      <ChoreList
        chores={choresQuery.data?.chores ?? []}
        onToggle={async (chore, nextCompleted) => {
          if (nextCompleted) {
            await apiFetch(`/chores/${chore.id}/complete`, { method: "POST" });
          } else {
            const date = new Date().toISOString().slice(0, 10);
            await apiFetch(`/chores/${chore.id}/complete?date=${date}`, { method: "DELETE" });
          }

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.todayChores }),
            queryClient.invalidateQueries({ queryKey: queryKeys.rewardBalances })
          ]);
        }}
      />
      <RewardBalance balances={rewardsQuery.data?.balances ?? []} />
    </section>
  );
}
