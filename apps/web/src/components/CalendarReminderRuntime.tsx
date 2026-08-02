import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/client";
import { CALENDAR_AUTO_REFRESH_MS } from "../api/refreshIntervals";
import { queryKeys } from "../api/queryKeys";
import {
  dateFromDateKeyInTimeZone,
  dateKeyInTimeZone,
  shiftDateKey,
  startOfWeekDateKey,
} from "../features/calendar/dateKeys";

const REMINDER_CHECK_MS = 5_000;
const REMINDER_GRACE_MS = 10 * 60_000;
const SNOOZE_DURATION_MS = 10 * 60_000;
const ANNOUNCED_STORAGE_KEY = "daymark-announced-reminders";
const SNOOZED_STORAGE_KEY = "daymark-snoozed-reminders";
const ANNOUNCED_RETENTION_MS = 7 * 24 * 60 * 60_000;

type HouseholdResponse = {
  household: {
    timezone: string;
    weekStartsOn: "sunday" | "monday";
  };
};

export type DaymarkReminderEvent = {
  id: string;
  title: string;
  start: string;
  isAllDay: boolean;
  reminderMinutesBefore?: number[];
  sourceName?: string;
  sourceNames?: string[];
};

type CalendarResponse = {
  events: DaymarkReminderEvent[];
};

type NativeDaymarkDisplay = Window & {
  DaymarkDisplay?: { speak: (message: string) => void };
  webkitAudioContext?: typeof AudioContext;
};

type ActiveReminder = {
  event: DaymarkReminderEvent;
  minutesBefore: number;
  snoozeId?: string;
};

export type SnoozedReminder = {
  id: string;
  event: DaymarkReminderEvent;
  minutesBefore: number;
  dueAt: number;
};

export function reminderOccurrenceKey(
  event: DaymarkReminderEvent,
  minutesBefore: number,
): string {
  return `${event.id}|${event.start}|${minutesBefore}`;
}

export function reminderAnnouncement(
  event: DaymarkReminderEvent,
  minutesBefore: number,
): string {
  if (minutesBefore === 0) return `Reminder. ${event.title} starts now.`;
  if (minutesBefore === 60)
    return `Reminder. ${event.title} starts in one hour.`;
  return `Reminder. ${event.title} starts in ${minutesBefore} minutes.`;
}

export function isReminderDue(
  event: DaymarkReminderEvent,
  minutesBefore: number,
  now: Date,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): boolean {
  const eventStart = event.isAllDay
    ? dateFromDateKeyInTimeZone(event.start.slice(0, 10), timezone).getTime()
    : new Date(event.start).getTime();
  const dueAt = eventStart - minutesBefore * 60_000;
  const current = now.getTime();
  return current >= dueAt && current < dueAt + REMINDER_GRACE_MS;
}

export function isSnoozedReminderDue(
  reminder: SnoozedReminder,
  now: Date,
): boolean {
  const current = now.getTime();
  return (
    current >= reminder.dueAt &&
    current < reminder.dueAt + REMINDER_GRACE_MS
  );
}

function readSnoozedReminders(now: number): SnoozedReminder[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SNOOZED_STORAGE_KEY) ?? "[]",
    ) as SnoozedReminder[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (reminder) =>
        typeof reminder?.id === "string" &&
        typeof reminder?.event?.id === "string" &&
        typeof reminder?.event?.title === "string" &&
        Number.isFinite(reminder?.minutesBefore) &&
        Number.isFinite(reminder?.dueAt) &&
        now < reminder.dueAt + REMINDER_GRACE_MS,
    );
  } catch {
    return [];
  }
}

function writeSnoozedReminders(reminders: SnoozedReminder[]): void {
  try {
    localStorage.setItem(SNOOZED_STORAGE_KEY, JSON.stringify(reminders));
  } catch {
    // In-memory snoozing still works when storage is restricted.
  }
}

function readAnnouncedReminders(now: number): Record<string, number> {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(ANNOUNCED_STORAGE_KEY) ?? "{}",
    ) as Record<string, number>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, announcedAt]) =>
          Number.isFinite(announcedAt) &&
          now - announcedAt < ANNOUNCED_RETENTION_MS,
      ),
    );
  } catch {
    return {};
  }
}

function markReminderAnnounced(key: string, now: number): void {
  try {
    localStorage.setItem(
      ANNOUNCED_STORAGE_KEY,
      JSON.stringify({ ...readAnnouncedReminders(now), [key]: now }),
    );
  } catch {
    // A privacy-restricted display can still announce once per mounted session.
  }
}

function playReminderChime(): void {
  try {
    const displayWindow = window as NativeDaymarkDisplay;
    const AudioContextClass =
      window.AudioContext ?? displayWindow.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Voice and the visible popup remain available when audio is blocked.
  }
}

export function announceDaymarkReminder(message: string): void {
  playReminderChime();
  const nativeDisplay = (window as NativeDaymarkDisplay).DaymarkDisplay;
  if (nativeDisplay?.speak) {
    nativeDisplay.speak(message);
    return;
  }
  if (
    !("speechSynthesis" in window) ||
    !("SpeechSynthesisUtterance" in window)
  ) {
    return;
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(message));
}

export function CalendarReminderRuntime(): JSX.Element | null {
  const [now, setNow] = useState(() => new Date());
  const [activeReminder, setActiveReminder] = useState<ActiveReminder | null>(
    null,
  );
  const [snoozedReminders, setSnoozedReminders] = useState(() =>
    readSnoozedReminders(Date.now()),
  );
  const [announcedThisSession] = useState(() => new Set<string>());
  const householdQuery = useQuery({
    queryKey: queryKeys.household,
    queryFn: () => apiFetch<HouseholdResponse>("/household/current"),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });
  const timezone =
    householdQuery.data?.household.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";
  const todayKey = dateKeyInTimeZone(now, timezone);
  const weekStart = startOfWeekDateKey(
    todayKey,
    householdQuery.data?.household.weekStartsOn ?? "monday",
  );
  const start = dateFromDateKeyInTimeZone(weekStart, timezone).toISOString();
  const end = dateFromDateKeyInTimeZone(
    shiftDateKey(weekStart, 8),
    timezone,
  ).toISOString();
  const calendarUrl = `/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=${encodeURIComponent(timezone)}`;
  const calendarQuery = useQuery({
    queryKey: ["calendar-week-schedule", start, end, timezone],
    queryFn: () => apiFetch<CalendarResponse>(calendarUrl),
    enabled: householdQuery.isSuccess,
    refetchInterval: CALENDAR_AUTO_REFRESH_MS,
    refetchIntervalInBackground: true,
  });
  const events = calendarQuery.data?.events;
  const announcedFromStorage = useMemo(
    () => readAnnouncedReminders(now.getTime()),
    [now],
  );

  useEffect(() => {
    const interval = window.setInterval(
      () => setNow(new Date()),
      REMINDER_CHECK_MS,
    );
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    writeSnoozedReminders(snoozedReminders);
  }, [snoozedReminders]);

  useEffect(() => {
    setSnoozedReminders((current) => {
      const retained = current.filter(
        (reminder) =>
          now.getTime() < reminder.dueAt + REMINDER_GRACE_MS,
      );
      return retained.length === current.length ? current : retained;
    });
  }, [now]);

  useEffect(() => {
    if (activeReminder) return;
    const snoozedReminder = snoozedReminders.find((reminder) =>
      isSnoozedReminderDue(reminder, now),
    );
    if (snoozedReminder) {
      setActiveReminder({
        event: snoozedReminder.event,
        minutesBefore: snoozedReminder.minutesBefore,
        snoozeId: snoozedReminder.id,
      });
      announceDaymarkReminder(
        `Snoozed reminder. ${snoozedReminder.event.title}.`,
      );
      return;
    }
    if (!events) return;
    const reminder = events
      .flatMap((event) =>
        (event.reminderMinutesBefore ?? []).map((minutesBefore) => ({
          event,
          minutesBefore,
        })),
      )
      .filter(({ event, minutesBefore }) =>
        isReminderDue(event, minutesBefore, now, timezone),
      )
      .sort(
        (left, right) =>
          new Date(left.event.start).getTime() -
          new Date(right.event.start).getTime(),
      )
      .find(({ event, minutesBefore }) => {
        const key = reminderOccurrenceKey(event, minutesBefore);
        return !announcedThisSession.has(key) && !announcedFromStorage[key];
      });
    if (!reminder) return;

    const key = reminderOccurrenceKey(reminder.event, reminder.minutesBefore);
    announcedThisSession.add(key);
    markReminderAnnounced(key, now.getTime());
    setActiveReminder(reminder);
    announceDaymarkReminder(
      reminderAnnouncement(reminder.event, reminder.minutesBefore),
    );
  }, [
    activeReminder,
    announcedFromStorage,
    announcedThisSession,
    events,
    now,
    snoozedReminders,
    timezone,
  ]);

  if (!activeReminder) return null;
  const reminderEvent = activeReminder.event;
  const sourceNames = reminderEvent.sourceNames?.length
    ? reminderEvent.sourceNames
    : reminderEvent.sourceName
      ? [reminderEvent.sourceName]
      : [];
  const time = reminderEvent.isAllDay
    ? "All day"
    : new Date(reminderEvent.start).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone,
      });
  const snoozeReminder = (): void => {
    const dueAt = Date.now() + SNOOZE_DURATION_MS;
    const snoozeId = `${reminderOccurrenceKey(reminderEvent, activeReminder.minutesBefore)}|snooze|${dueAt}`;
    setSnoozedReminders((current) => [
      ...current.filter((reminder) => reminder.id !== activeReminder.snoozeId),
      {
        id: snoozeId,
        event: reminderEvent,
        minutesBefore: activeReminder.minutesBefore,
        dueAt,
      },
    ]);
    setActiveReminder(null);
  };
  const dismissReminder = (): void => {
    if (activeReminder.snoozeId) {
      setSnoozedReminders((current) =>
        current.filter((reminder) => reminder.id !== activeReminder.snoozeId),
      );
    }
    setActiveReminder(null);
  };

  return (
    <div
      className="fixed left-1/2 top-1/2 z-[70] w-[min(26rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2"
      role="alertdialog"
      aria-labelledby="daymark-reminder-title"
    >
      <section className="grid gap-4 overflow-hidden rounded-2xl border border-amber-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#fff0cf] text-2xl"
            aria-hidden="true"
          >
            🔔
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6a18]">
              Event reminder
            </p>
            <h2
              id="daymark-reminder-title"
              className="mt-1 font-display text-2xl text-slate-950"
            >
              {reminderEvent.title}
            </h2>
            <p className="mt-1 font-semibold text-slate-700">
              {activeReminder.minutesBefore === 0
                ? reminderEvent.isAllDay
                  ? "Starting today · All day"
                  : `Starting now · ${time}`
                : reminderEvent.isAllDay
                  ? time
                  : `Starts at ${time}`}
            </p>
            {sourceNames.length ? (
              <p className="mt-1 text-sm text-slate-500">
                {sourceNames.join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            autoFocus
            className="min-h-[44px] rounded-xl border border-[#0f766e] bg-white px-4 font-semibold text-[#0f766e] hover:bg-teal-50"
            onClick={snoozeReminder}
          >
            Snooze 10 min
          </button>
          <button
            type="button"
            className="min-h-[44px] rounded-xl bg-[#0f766e] px-5 font-semibold text-white hover:bg-[#115e59]"
            onClick={dismissReminder}
          >
            Dismiss
          </button>
        </div>
      </section>
    </div>
  );
}
