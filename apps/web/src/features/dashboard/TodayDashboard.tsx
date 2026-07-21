import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { DegradedStateBanner } from "../../components/DegradedStateBanner";
import { queryKeys } from "../../api/queryKeys";
import {
  CALENDAR_AUTO_REFRESH_MS,
  DASHBOARD_AUTO_REFRESH_MS,
  WEATHER_AUTO_REFRESH_MS,
} from "../../api/refreshIntervals";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { toolbarFilterButtonClass } from "../../components/toolbarButtonStyles";
import { CalendarStatusBadge } from "../calendar/CalendarStatusBadge";
import { WeekNavigationControls } from "../calendar/WeekNavigationControls";
import {
  CalendarEventCreateDialog,
  type CalendarEventAccount,
  type CalendarEventSource,
} from "../calendar/CalendarEventCreateDialog";
import { CalendarEventEditDialog } from "../calendar/CalendarEventEditDialog";
import {
  dateFromDateKeyInTimeZone,
  dateKeyInTimeZone,
  shiftDateKey,
  startOfWeekDateKey,
} from "../calendar/dateKeys";
import { layoutTimedEvents } from "../calendar/layoutTimedEvents";
import {
  eventBandBackground,
  softenEventColor,
} from "../calendar/eventAppearance";
import {
  familyMemberColorForSource,
  memberAppearance,
} from "../family/memberAppearance";
import { weatherIconForCode } from "../weather/weatherIcons";

export const EVENT_STATUS_DURATION_MS = 4_000;

type RewardsResponse = {
  balances: Array<{
    personId: string;
    displayName: string;
    color: string;
    balance: number;
  }>;
};

type HouseholdResponse = {
  household: {
    name: string;
    timezone: string;
    weekStartsOn: "sunday" | "monday";
  };
};

type WeatherResponse =
  | { configured: false }
  | {
      configured: true;
      locationName: string;
      temperature: number;
      highTemperature: number;
      lowTemperature: number;
      temperatureUnit: string;
      weatherCode: number;
      isDay: boolean;
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
    location?: string;
    sourceName?: string;
    sourceNames?: string[];
    color?: string;
    colors?: string[];
    shared?: boolean;
    recurringEventId?: string;
    providerRefs?: Array<{
      sourceId: string;
      providerEventId: string;
      recurringEventId?: string;
    }>;
  }>;
};

type CalendarAccountsResponse = {
  accounts: CalendarEventAccount[];
};

type CalendarSourcesResponse = {
  sources: CalendarEventSource[];
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

type EventDetail = {
  id: string;
  title: string;
  timeLabel: string;
  sourceName: string;
  sourceNames: string[];
  color: string;
  colors: string[];
  providerRefs: NonNullable<CalendarResponse["events"][number]["providerRefs"]>;
  isRecurring: boolean;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string;
};

type RenderEvent = EventDetail & {
  dayIndex: number;
  startHour: number;
  durationHours: number;
  compactTimeLabel: string;
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
    minute: "2-digit",
  })} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function formatCompactEventTime(start: Date, end: Date): string {
  const compact = (value: Date) =>
    value
      .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      .replace(/\s?[AP]M$/i, "");
  return `${compact(start)}–${compact(end)}`;
}

export function hourInTimeZone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: "hour" | "minute" | "second") =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return (value("hour") % 24) + value("minute") / 60 + value("second") / 3600;
}

export function calendarHourRange(
  events: Array<{ startHour: number; durationHours: number }>,
): { startHour: number; endHour: number } {
  if (events.length === 0) return { startHour: 6, endHour: 22 };
  const earliest = Math.floor(
    Math.min(...events.map((event) => event.startHour)),
  );
  const latest =
    Math.ceil(
      Math.max(...events.map((event) => event.startHour + event.durationHours)),
    ) - 1;
  return {
    startHour: Math.max(0, Math.min(6, earliest)),
    endHour: Math.min(23, Math.max(22, latest)),
  };
}

export function LiveClock({ timezone }: { timezone: string }): JSX.Element {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <time dateTime={now.toISOString()}>
      {now.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone,
      })}
    </time>
  );
}

export function TodayDashboard(): JSX.Element {
  const [calendarNow, setCalendarNow] = useState(() => new Date());
  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const currentTimeLineRef = useRef<HTMLDivElement>(null);
  const deviceTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [weekOffset, setWeekOffset] = useState(0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [eventCreateStatus, setEventCreateStatus] = useState<string | null>(
    null,
  );
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedCalendarFilters, setSelectedCalendarFilters] = useState<
    string[]
  >([]);
  const [selectedEvent, setSelectedEvent] = useState<EventDetail | null>(null);
  const [isEditEventOpen, setIsEditEventOpen] = useState(false);
  const [deleteChoiceOpen, setDeleteChoiceOpen] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [eventDeleteError, setEventDeleteError] = useState<string | null>(null);
  const [isCalendarRefreshing, setIsCalendarRefreshing] = useState(false);
  const [calendarRefreshError, setCalendarRefreshError] = useState<
    string | null
  >(null);

  useEffect(() => {
    const clockInterval = window.setInterval(() => {
      const next = new Date();
      setCalendarNow((current) =>
        Math.floor(current.getTime() / 60_000) ===
        Math.floor(next.getTime() / 60_000)
          ? current
          : next,
      );
    }, 1_000);
    return () => window.clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    if (!eventCreateStatus) return;
    const dismissTimeout = window.setTimeout(
      () => setEventCreateStatus(null),
      EVENT_STATUS_DURATION_MS,
    );
    return () => window.clearTimeout(dismissTimeout);
  }, [eventCreateStatus]);

  const householdQuery = useQuery({
    queryKey: queryKeys.household,
    queryFn: () => apiFetch<HouseholdResponse>("/household/current"),
    refetchInterval: DASHBOARD_AUTO_REFRESH_MS,
    refetchIntervalInBackground: true,
  });
  const timezone = householdQuery.data?.household.timezone ?? deviceTimezone;
  const weatherQuery = useQuery({
    queryKey: ["current-weather"],
    queryFn: () => apiFetch<WeatherResponse>("/weather/current"),
    staleTime: 10 * 60 * 1_000,
    refetchInterval: WEATHER_AUTO_REFRESH_MS,
    refetchIntervalInBackground: true,
    retry: false,
  });
  const rewardsQuery = useQuery({
    queryKey: queryKeys.rewardBalances,
    queryFn: () => apiFetch<RewardsResponse>("/rewards/balances"),
    refetchInterval: DASHBOARD_AUTO_REFRESH_MS,
    refetchIntervalInBackground: true,
  });
  const mealsQuery = useQuery({
    queryKey: queryKeys.weekMeals,
    queryFn: () => apiFetch<MealsResponse>("/meals/week"),
    refetchInterval: DASHBOARD_AUTO_REFRESH_MS,
    refetchIntervalInBackground: true,
  });
  const calendarAccountsQuery = useQuery({
    queryKey: ["calendar-accounts"],
    queryFn: () => apiFetch<CalendarAccountsResponse>("/calendar/accounts"),
  });
  const calendarSourcesQuery = useQuery({
    queryKey: ["calendar-sources"],
    queryFn: () => apiFetch<CalendarSourcesResponse>("/calendar/sources"),
  });
  const todayKey = dateKeyInTimeZone(calendarNow, timezone);
  const currentWeekStartKey = startOfWeekDateKey(
    todayKey,
    householdQuery.data?.household.weekStartsOn ?? "monday",
  );
  const calendarStartKey = shiftDateKey(currentWeekStartKey, weekOffset * 7);
  const startOfCalendar = dateFromDateKeyInTimeZone(calendarStartKey, timezone);
  const start = startOfCalendar.toISOString();
  const endDate = dateFromDateKeyInTimeZone(
    shiftDateKey(calendarStartKey, 7),
    timezone,
  );
  const end = endDate.toISOString();
  const calendarQueryKey = [
    "calendar-week-schedule",
    start,
    end,
    timezone,
  ] as const;
  const calendarEventsUrl = `/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=${encodeURIComponent(timezone)}`;

  const calendarQuery = useQuery({
    queryKey: calendarQueryKey,
    queryFn: () => apiFetch<CalendarResponse>(calendarEventsUrl),
    enabled: householdQuery.isSuccess,
    refetchInterval: CALENDAR_AUTO_REFRESH_MS,
    refetchIntervalInBackground: true,
  });
  const currentHour = hourInTimeZone(calendarNow, timezone);
  const currentMinuteKey = `${todayKey}-${Math.floor(currentHour * 60)}`;
  const dashboardReady =
    householdQuery.isSuccess &&
    rewardsQuery.isSuccess &&
    mealsQuery.isSuccess &&
    calendarQuery.isSuccess;

  useEffect(() => {
    if (weekOffset !== 0 || !dashboardReady) return;
    const scrollContainer = calendarScrollRef.current;
    const currentTimeLine = currentTimeLineRef.current;
    if (!scrollContainer || !currentTimeLine) return;
    const containerRect = scrollContainer.getBoundingClientRect();
    const lineRect = currentTimeLine.getBoundingClientRect();
    const top =
      lineRect.top -
      containerRect.top +
      scrollContainer.scrollTop -
      scrollContainer.clientHeight / 2;
    if (typeof scrollContainer.scrollTo === "function") {
      scrollContainer.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    } else {
      scrollContainer.scrollTop = Math.max(0, top);
    }
  }, [currentMinuteKey, dashboardReady, weekOffset]);

  if (
    householdQuery.isLoading ||
    rewardsQuery.isLoading ||
    mealsQuery.isLoading ||
    calendarQuery.isLoading
  ) {
    return <LoadingState label="Loading dashboard..." />;
  }
  if (householdQuery.isError)
    return <ErrorState message={householdQuery.error.message} />;
  if (rewardsQuery.isError)
    return <ErrorState message={rewardsQuery.error.message} />;
  if (mealsQuery.isError)
    return <ErrorState message={mealsQuery.error.message} />;
  if (calendarQuery.isError)
    return <ErrorState message={calendarQuery.error.message} />;

  const todaysMeals =
    mealsQuery.data?.days.find((day) => day.date === todayKey)?.entries ?? [];
  const tonightMeal =
    todaysMeals.find((entry) => entry.slot === "dinner")?.customTitle ??
    todaysMeals.find((entry) => entry.slot === "dinner")?.mealName ??
    "No dinner planned";

  const days = Array.from({ length: 7 }, (_, index) => {
    const dayKey = shiftDateKey(calendarStartKey, index);
    const date = dateFromDateKeyInTimeZone(dayKey, timezone);
    return {
      index,
      dayKey,
      weekday: date.toLocaleDateString(undefined, {
        weekday: "short",
        timeZone: timezone,
      }),
      dayNumber: Number(dayKey.slice(-2)),
      isToday: dayKey === todayKey,
    };
  });

  const personPalette = [
    { soft: "#d7efef", accent: "#63bdc6" },
    { soft: "#f7dfe6", accent: "#ee8ea4" },
    { soft: "#e8dff4", accent: "#b69bd3" },
    { soft: "#ddf0db", accent: "#8bc58b" },
    { soft: "#f9e4df", accent: "#e7aa98" },
  ] as const;
  const paletteAt = (index: number) =>
    personPalette[index % personPalette.length] ?? personPalette[0]!;
  const balances = rewardsQuery.data?.balances ?? [];
  const personColorByName = new Map(
    balances.map((person, index) => [
      person.displayName.toLowerCase(),
      memberAppearance(person.color, paletteAt(index).accent),
    ]),
  );
  const fallbackEventPalette = [
    "#bee8ea",
    "#f3cfd0",
    "#e4daf0",
    "#d5edd7",
    "#f7d8d4",
  ] as const;
  const fallbackColorAt = (index: number) =>
    fallbackEventPalette[index % fallbackEventPalette.length] ??
    fallbackEventPalette[0]!;

  const eventSourceNames = (
    event: CalendarResponse["events"][number],
  ): string[] =>
    event.sourceNames?.length
      ? event.sourceNames
      : [event.sourceName ?? "Calendar"];
  const eventColors = (
    event: CalendarResponse["events"][number],
    index: number,
  ): string[] => {
    const sourceNames = eventSourceNames(event);
    const providerColors = event.colors?.length ? event.colors : [event.color];
    const colors = sourceNames.map((sourceName, sourceIndex) => {
      const familyColor = familyMemberColorForSource(sourceName, balances);
      return (
        (familyColor
          ? memberAppearance(familyColor, paletteAt(sourceIndex).accent).soft
          : undefined) ??
        softenEventColor(
          providerColors[sourceIndex] ?? event.color,
          fallbackColorAt(index + sourceIndex),
        )
      );
    });
    return Array.from(new Set(colors));
  };

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
        (endDate.getTime() - startDate.getTime()) / (60 * 60 * 1000),
      );
      const sourceNames = eventSourceNames(event);
      const lowerSourceNames = sourceNames.map((name) => name.toLowerCase());
      const matchedPeople = balances.filter((person) =>
        lowerSourceNames.some((sourceName) =>
          sourceName.includes(person.displayName.toLowerCase()),
        ),
      );
      const owner = matchedPeople[0];
      const colors = eventColors(event, index);

      return {
        id: event.id,
        dayIndex,
        startHour,
        durationHours,
        title: event.title,
        timeLabel: formatEventTime(startDate, endDate),
        compactTimeLabel: formatCompactEventTime(startDate, endDate),
        sourceName: sourceNames.join(", "),
        sourceNames,
        ownerInitial: owner?.displayName.slice(0, 1).toUpperCase(),
        ownerCount: Math.max(matchedPeople.length, sourceNames.length),
        striped: Boolean(event.shared && colors.length > 1),
        color: colors[0] ?? fallbackColorAt(index),
        colors,
        providerRefs: event.providerRefs ?? [],
        isRecurring: Boolean(
          event.recurringEventId ||
          event.providerRefs?.some((reference) => reference.recurringEventId),
        ),
        start: event.start,
        end: event.end,
        isAllDay: false,
        location: event.location,
      };
    })
    .filter((event) => event.dayIndex >= 0);

  const availableCalendarFilters = Array.from(
    new Set((calendarQuery.data?.events ?? []).flatMap(eventSourceNames)),
  ).sort((a, b) => a.localeCompare(b));
  const eventMatchesFilter = (sourceNames: string[]) =>
    selectedCalendarFilters.length === 0 ||
    sourceNames.some((sourceName) =>
      selectedCalendarFilters.includes(sourceName),
    );
  const scheduleEvents = mappedEvents.filter((event) =>
    eventMatchesFilter(event.sourceNames),
  );
  const timedEventLayout = new Map(
    days.flatMap((day) =>
      layoutTimedEvents(
        scheduleEvents
          .filter((event) => event.dayIndex === day.index)
          .map((event) => ({
            id: event.id,
            start: event.startHour,
            end: event.startHour + event.durationHours,
          })),
      ).map((layout) => [layout.id, layout] as const),
    ),
  );
  const allDayEvents = (calendarQuery.data?.events ?? [])
    .filter((event) => event.isAllDay)
    .map((event, index) => {
      const startKey = event.start.slice(0, 10);
      const endKey = shiftDateKey(event.end.slice(0, 10), -1);
      const startIndex =
        days.find((day) => day.dayKey === startKey)?.index ?? 0;
      const endIndex =
        days.find((day) => day.dayKey === endKey)?.index ?? startIndex;
      const sourceNames = eventSourceNames(event);
      const colors = eventColors(event, index);

      return {
        id: event.id,
        title: event.title,
        startIndex: Math.max(0, startIndex),
        endIndex: Math.max(startIndex, endIndex),
        striped: Boolean(event.shared && colors.length > 1),
        color: colors[0] ?? fallbackColorAt(index),
        colors,
        sourceName: sourceNames.join(", "),
        sourceNames,
        timeLabel: "All day",
        providerRefs: event.providerRefs ?? [],
        isRecurring: Boolean(
          event.recurringEventId ||
          event.providerRefs?.some((reference) => reference.recurringEventId),
        ),
        start: event.start,
        end: event.end,
        isAllDay: true,
        location: event.location,
      };
    })
    .filter((event) => eventMatchesFilter(event.sourceNames));
  const eventHourRange = calendarHourRange(scheduleEvents);
  const visibleToday = days.some((day) => day.isToday);
  const currentWholeHour = Math.floor(currentHour);
  const startHour = visibleToday
    ? Math.min(eventHourRange.startHour, currentWholeHour)
    : eventHourRange.startHour;
  const endHour = visibleToday
    ? Math.max(eventHourRange.endHour, currentWholeHour)
    : eventHourRange.endHour;
  const hourSlots = Array.from(
    { length: endHour - startHour + 1 },
    (_, i) => startHour + i,
  );
  const slotHeight = 96;
  const currentWeather = weatherQuery.data?.configured
    ? weatherIconForCode(weatherQuery.data.weatherCode, weatherQuery.data.isDay)
    : null;
  const writableSourceIds = new Set(
    (calendarSourcesQuery.data?.sources ?? [])
      .filter((source) => {
        const account = calendarAccountsQuery.data?.accounts.find(
          (candidate) => candidate.id === source.connectedAccountId,
        );
        return (
          source.enabled &&
          source.allowEventWrites &&
          (source.googleAccessRole === "owner" ||
            source.googleAccessRole === "writer") &&
          account?.calendarWriteAccessGranted &&
          !account.reauthorizationRequired
        );
      })
      .map((source) => source.id),
  );
  const writableSelectedEventRefs =
    selectedEvent?.providerRefs.filter((reference) =>
      writableSourceIds.has(reference.sourceId),
    ) ?? [];

  const deleteSelectedEvent = async (
    scope: "event" | "series",
  ): Promise<void> => {
    if (!selectedEvent || writableSelectedEventRefs.length === 0) return;
    setIsDeletingEvent(true);
    setEventDeleteError(null);
    try {
      await apiFetch("/calendar/events", {
        method: "DELETE",
        body: JSON.stringify({ targets: writableSelectedEventRefs, scope }),
      });
      await Promise.all([
        calendarQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["calendar-week"] }),
      ]);
      setSelectedEvent(null);
      setDeleteChoiceOpen(false);
      setEventCreateStatus(
        scope === "series" ? "Event series deleted." : "Event deleted.",
      );
    } catch (deleteError) {
      let message = "The event could not be deleted.";
      if (deleteError instanceof Error) {
        try {
          const payload = JSON.parse(deleteError.message) as {
            message?: string;
          };
          message = payload.message ?? message;
        } catch {
          message = deleteError.message || message;
        }
      }
      setEventDeleteError(message);
    } finally {
      setIsDeletingEvent(false);
    }
  };

  return (
    <section className="grid gap-3 md:h-[calc(100dvh-1.5rem)] md:min-h-0">
      <section className="relative flex min-h-0 flex-col overflow-hidden rounded-md border border-[#e7e7e5] bg-white">
        <header className="border-b border-[#ecebe8] px-3 pb-2 pt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <h1 className="font-display text-3xl leading-none text-slate-900 md:text-[34px]">
                {householdQuery.data?.household.name ?? "Family"}
              </h1>
              <div className="font-display text-3xl leading-none text-slate-900 md:text-[34px]">
                <LiveClock timezone={timezone} />
              </div>
              {weatherQuery.data?.configured ? (
                <div
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/90 py-1 pl-1 pr-3 text-slate-700 shadow-sm"
                  title={weatherQuery.data.locationName}
                  aria-label={`${currentWeather?.label ?? "Weather"}: high ${weatherQuery.data.highTemperature}°, low ${weatherQuery.data.lowTemperature}°`}
                >
                  {currentWeather ? (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800">
                      <img
                        src={currentWeather.src}
                        alt=""
                        aria-hidden="true"
                        className="h-9 w-9 object-contain"
                      />
                    </span>
                  ) : null}
                  <div className="grid gap-0.5">
                    <div className="text-[11px] font-semibold leading-none text-slate-500">
                      {currentWeather?.label ?? "Weather"}
                    </div>
                    <div className="flex items-baseline gap-2 font-display text-xl leading-none">
                      <span className="flex items-baseline gap-0.5 text-slate-400">
                        <span className="font-sans text-[9px] font-bold">
                          L
                        </span>
                        <span>{weatherQuery.data.lowTemperature}°</span>
                      </span>
                      <span className="flex items-baseline gap-0.5">
                        <span className="font-sans text-[9px] font-bold text-slate-400">
                          H
                        </span>
                        <span>{weatherQuery.data.highTemperature}°</span>
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <WeekNavigationControls
                isRefreshing={isCalendarRefreshing}
                onPrevious={() => setWeekOffset((value) => value - 1)}
                onToday={() => setWeekOffset(0)}
                onNext={() => setWeekOffset((value) => value + 1)}
                onRefresh={async () => {
                  setIsCalendarRefreshing(true);
                  setCalendarRefreshError(null);
                  try {
                    const refreshed = await apiFetch<CalendarResponse>(
                      `${calendarEventsUrl}&refresh=true`,
                    );
                    queryClient.setQueryData(calendarQueryKey, refreshed);
                  } catch (error) {
                    setCalendarRefreshError(
                      error instanceof Error
                        ? error.message
                        : "Calendar refresh failed.",
                    );
                  } finally {
                    setIsCalendarRefreshing(false);
                  }
                }}
              />
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={isFilterOpen}
                  className={toolbarFilterButtonClass(
                    selectedCalendarFilters.length > 0,
                  )}
                  onClick={() => setIsFilterOpen((value) => !value)}
                >
                  Filter
                  {selectedCalendarFilters.length
                    ? ` (${selectedCalendarFilters.length})`
                    : ""}
                </button>
                {isFilterOpen ? (
                  <div className="absolute right-0 top-12 z-40 grid min-w-[240px] gap-2 rounded-xl border border-[#d9d8d4] bg-white p-3 shadow-xl">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">
                        People & calendars
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold text-teal-700"
                        onClick={() => setSelectedCalendarFilters([])}
                      >
                        Show all
                      </button>
                    </div>
                    {availableCalendarFilters.length ? (
                      availableCalendarFilters.map((name) => (
                        <label
                          key={name}
                          className="flex min-h-[40px] items-center gap-2 rounded-lg px-2 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedCalendarFilters.includes(name)}
                            onChange={() =>
                              setSelectedCalendarFilters((current) =>
                                current.includes(name)
                                  ? current.filter((value) => value !== name)
                                  : [...current, name],
                              )
                            }
                          />
                          <span className="text-sm text-slate-700">{name}</span>
                        </label>
                      ))
                    ) : (
                      <div className="text-sm text-slate-500">
                        No calendars to filter.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              {calendarQuery.data ? (
                <CalendarStatusBadge
                  cacheStatus={calendarQuery.data.cacheStatus}
                />
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
                    personColorByName.get(person.displayName.toLowerCase())
                      ?.soft ?? "#ebf3f1",
                }}
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{
                    backgroundColor:
                      personColorByName.get(person.displayName.toLowerCase())
                        ?.accent ?? "#8ac7be",
                  }}
                >
                  {person.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="text-base font-semibold text-slate-800">
                  {person.displayName}
                </div>
              </div>
            ))}
          </div>
        </header>
        {calendarRefreshError || calendarQuery.data?.warnings.length ? (
          <div className="border-b border-[#ecebe8] px-3 py-2">
            <DegradedStateBanner
              message={[
                calendarRefreshError,
                ...(calendarQuery.data?.warnings.map(
                  (warning) => warning.message,
                ) ?? []),
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </div>
        ) : null}
        <div
          data-testid="dashboard-calendar-scroll"
          ref={calendarScrollRef}
          className="min-h-0 flex-1 overflow-auto"
        >
          <div
            data-testid="dashboard-calendar-grid"
            data-calendar-start-hour={startHour}
            data-calendar-end-hour={endHour}
            className="grid min-w-[720px]"
            style={{
              gridTemplateColumns: `clamp(58px, 7vw, 88px) repeat(${days.length}, minmax(0, 1fr))`,
            }}
          >
            <div className="sticky top-0 z-20 border-b border-r border-[#ecebe8] bg-white" />
            {days.map((day) => (
              <div
                key={day.dayKey}
                data-calendar-day-header="true"
                className="sticky top-0 z-20 flex items-center gap-1 border-b border-r border-[#ecebe8] bg-white px-1.5 py-2 font-display text-[clamp(18px,2.5vw,34px)] leading-none text-slate-900 md:px-2 xl:gap-1.5 xl:px-3 xl:py-2.5"
              >
                <span>{day.weekday}</span>
                {day.isToday ? (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#ff6b55] text-[14px] text-white xl:h-8 xl:w-8 xl:text-[19px]">
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
                (event) =>
                  day.index >= event.startIndex && day.index <= event.endIndex,
              );
              const event = dayAllDayEvents[0];
              return (
                <div
                  key={`${day.dayKey}-all-day`}
                  className="border-b border-r border-[#ecebe8] p-2"
                >
                  {event ? (
                    <button
                      type="button"
                      aria-label={`${event.title}, All day, ${event.sourceName}`}
                      className="block w-full min-w-0 max-w-full truncate rounded-full px-1.5 py-1 text-[11px] font-semibold text-slate-700 md:px-2 md:text-[12px] xl:px-3 xl:text-[14px]"
                      onClick={() => {
                        setDeleteChoiceOpen(false);
                        setEventDeleteError(null);
                        setSelectedEvent(event);
                      }}
                      style={{
                        background: eventBandBackground(
                          event.colors,
                          event.color,
                        ),
                      }}
                    >
                      {event.title}
                    </button>
                  ) : null}
                </div>
              );
            })}

            {hourSlots.map((hour) => (
              <Fragment key={`row-${hour}`}>
                <div
                  className="overflow-hidden border-r border-[#ecebe8] px-1 py-2 text-slate-500 md:px-1.5 xl:px-2"
                  style={{ height: slotHeight }}
                >
                  <div
                    data-calendar-hour-label="true"
                    className="whitespace-nowrap font-display text-[clamp(14px,1.45vw,22px)] leading-none"
                  >
                    {formatHourLabel(hour)}
                  </div>
                </div>
                {days.map((day) => {
                  const hourEvents = scheduleEvents.filter(
                    (event) =>
                      event.dayIndex === day.index &&
                      Math.floor(event.startHour) === hour,
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
                      {day.isToday && hour === currentWholeHour ? (
                        <div
                          ref={currentTimeLineRef}
                          aria-hidden="true"
                          data-current-time-line="true"
                          className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                          style={{
                            top: (currentHour - currentWholeHour) * slotHeight,
                          }}
                        >
                          <span className="-ml-1.5 h-3 w-3 shrink-0 rounded-full bg-[#ff5c45] shadow-sm" />
                          <span className="w-full border-t-2 border-[#ff5c45]" />
                        </div>
                      ) : null}
                      {hourEvents.map((event) => {
                        const offset = (event.startHour - hour) * slotHeight;
                        const availableHeight = Math.max(
                          0,
                          (endHour + 1 - event.startHour) * slotHeight - 4,
                        );
                        const height = Math.min(
                          Math.max(24, event.durationHours * slotHeight - 6),
                          availableHeight,
                        );
                        const layout = timedEventLayout.get(event.id) ?? {
                          column: 0,
                          columnCount: 1,
                        };
                        const columnWidth = 100 / layout.columnCount;
                        const isCompact =
                          event.durationHours <= 1 || layout.columnCount > 1;
                        const showOwner =
                          event.durationHours >= 1.5 &&
                          layout.columnCount === 1;
                        return (
                          <button
                            type="button"
                            key={event.id}
                            data-event-id={event.id}
                            data-layout-column={layout.column}
                            data-layout-columns={layout.columnCount}
                            data-event-density={
                              isCompact ? "compact" : "comfortable"
                            }
                            data-event-shared={event.striped ? "true" : "false"}
                            aria-label={`${event.title}, ${event.timeLabel}, ${event.sourceName}`}
                            title={`${event.title} · ${event.timeLabel} · ${event.sourceName}`}
                            className="absolute z-10 min-w-0 overflow-hidden rounded-xl px-2 py-1 text-left text-slate-800 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                            onClick={() => {
                              setDeleteChoiceOpen(false);
                              setEventDeleteError(null);
                              setSelectedEvent(event);
                            }}
                            style={{
                              top: offset,
                              height,
                              left: `calc(${layout.column * columnWidth}% + 4px)`,
                              width: `calc(${columnWidth}% - 8px)`,
                              background: eventBandBackground(
                                event.colors,
                                event.color,
                              ),
                            }}
                          >
                            <div
                              className={`${isCompact ? "text-[13px]" : "text-[16px]"} break-normal font-semibold leading-tight`}
                            >
                              {event.title}
                            </div>
                            <div
                              className={`${isCompact ? "text-[10px]" : "text-[13px]"} mt-0.5 whitespace-nowrap leading-none text-slate-700`}
                            >
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
          <span className="relative -top-px text-4xl font-normal leading-none">
            +
          </span>
        </button>
        {isAddMenuOpen ? (
          <div className="absolute bottom-20 right-5 z-30 grid min-w-[220px] gap-2 rounded-md border border-[#d9d8d4] bg-white p-2 shadow-lg">
            <button
              type="button"
              className="min-h-[40px] rounded-md bg-[#f6f7f9] px-3 text-left text-sm font-semibold text-slate-800 hover:bg-[#ebedf0]"
              onClick={() => {
                setIsAddMenuOpen(false);
                setEventCreateStatus(null);
                setIsAddEventOpen(true);
              }}
            >
              Add event
            </button>
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
          </div>
        ) : null}
        {eventCreateStatus ? (
          <div
            role="status"
            className="absolute bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-emerald-800 px-4 py-2 text-sm font-semibold text-white shadow-lg"
          >
            {eventCreateStatus}
          </div>
        ) : null}
        {isAddEventOpen ? (
          <CalendarEventCreateDialog
            accounts={calendarAccountsQuery.data?.accounts ?? []}
            sources={calendarSourcesQuery.data?.sources ?? []}
            timezone={timezone}
            defaultDate={todayKey}
            loading={
              calendarAccountsQuery.isLoading || calendarSourcesQuery.isLoading
            }
            onClose={() => setIsAddEventOpen(false)}
            onCreated={async (message) => {
              await Promise.all([
                calendarQuery.refetch(),
                queryClient.invalidateQueries({
                  queryKey: ["calendar-week"],
                }),
              ]);
              setEventCreateStatus(message);
              setIsAddEventOpen(false);
            }}
          />
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
              <div
                className="h-2"
                style={{
                  background: eventBandBackground(
                    selectedEvent.colors,
                    selectedEvent.color,
                  ),
                }}
              />
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
                    <h2
                      id="calendar-event-detail-title"
                      className="font-display text-3xl leading-tight text-slate-950"
                    >
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
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-base shadow-sm"
                    >
                      ◷
                    </span>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Time
                      </div>
                      <div className="font-medium text-slate-800">
                        {selectedEvent.timeLabel}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-base shadow-sm"
                    >
                      ▦
                    </span>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {selectedEvent.sourceNames.length > 1
                          ? "Calendars"
                          : "Calendar"}
                      </div>
                      <div className="font-medium text-slate-800">
                        {selectedEvent.sourceNames.join(" · ")}
                      </div>
                    </div>
                  </div>
                </div>
                {eventDeleteError ? (
                  <p
                    role="alert"
                    className="mt-4 text-sm font-medium text-rose-700"
                  >
                    {eventDeleteError}
                  </p>
                ) : null}
                {deleteChoiceOpen ? (
                  <div className="mt-6 grid gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3">
                    <p className="text-sm font-semibold text-rose-950">
                      {selectedEvent.isRecurring
                        ? "Which events should be deleted?"
                        : "Delete this event from Google Calendar?"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isDeletingEvent}
                        className="min-h-[42px] rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
                        onClick={() => void deleteSelectedEvent("event")}
                      >
                        {isDeletingEvent
                          ? "Deleting..."
                          : selectedEvent.isRecurring
                            ? "This occurrence"
                            : "Delete event"}
                      </button>
                      {selectedEvent.isRecurring ? (
                        <button
                          type="button"
                          disabled={isDeletingEvent}
                          className="min-h-[42px] rounded-xl border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-800 disabled:opacity-50"
                          onClick={() => void deleteSelectedEvent("series")}
                        >
                          Entire series
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={isDeletingEvent}
                        className="min-h-[42px] rounded-xl px-3 text-sm font-semibold text-slate-600"
                        onClick={() => setDeleteChoiceOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="mt-6 flex gap-2">
                  {writableSelectedEventRefs.length > 0 && !deleteChoiceOpen ? (
                    <button
                      type="button"
                      className="min-h-[44px] rounded-xl bg-[#0f766e] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0d5f59]"
                      onClick={() => setIsEditEventOpen(true)}
                    >
                      Edit
                    </button>
                  ) : null}
                  {writableSelectedEventRefs.length > 0 && !deleteChoiceOpen ? (
                    <button
                      type="button"
                      className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                      onClick={() => setDeleteChoiceOpen(true)}
                    >
                      Delete
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="min-h-[44px] flex-1 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
                    onClick={() => setSelectedEvent(null)}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {selectedEvent && isEditEventOpen ? (
          <CalendarEventEditDialog
            event={selectedEvent}
            targets={writableSelectedEventRefs}
            timezone={timezone}
            onClose={() => setIsEditEventOpen(false)}
            onUpdated={async () => {
              await Promise.all([
                calendarQuery.refetch(),
                queryClient.invalidateQueries({ queryKey: ["calendar-week"] }),
              ]);
              setIsEditEventOpen(false);
              setSelectedEvent(null);
              setEventCreateStatus("Event updated.");
            }}
          />
        ) : null}
      </section>
    </section>
  );
}
