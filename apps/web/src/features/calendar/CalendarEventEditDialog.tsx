import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import {
  dateFromDateKeyInTimeZone,
  dateKeyInTimeZone,
  shiftDateKey,
} from "./dateKeys";
import type {
  CalendarEventAccount,
  CalendarEventSource,
} from "./CalendarEventCreateDialog";
import {
  FamilyParticipantPicker,
  participantEmails,
  resolveFamilyParticipants,
  type CalendarFamilyMember,
} from "./FamilyParticipantPicker";

type ProviderRef = {
  sourceId: string;
  providerEventId: string;
  recurringEventId?: string;
};

type WeekdayCode = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
type EditScope = "event" | "following" | "series";
type RepeatFrequency = "daily" | "weekly" | "monthly";
type SeriesEnd = "keep" | "on_date" | "after" | "never";

type RecurrenceSchedule = {
  editable: boolean;
  frequency: RepeatFrequency;
  days: WeekdayCode[];
  ends: "never" | "on_date" | "after";
  until?: string;
  count?: number;
  start?: string;
  end?: string;
  allDay: boolean;
  message?: string;
};

const weekdays: Array<{ code: WeekdayCode; label: string; short: string }> = [
  { code: "MO", label: "Monday", short: "M" },
  { code: "TU", label: "Tuesday", short: "T" },
  { code: "WE", label: "Wednesday", short: "W" },
  { code: "TH", label: "Thursday", short: "T" },
  { code: "FR", label: "Friday", short: "F" },
  { code: "SA", label: "Saturday", short: "S" },
  { code: "SU", label: "Sunday", short: "S" },
];

const weekdayIndex: Record<WeekdayCode, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

export type EditableCalendarEvent = {
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string;
  attendeeEmails?: string[];
  organizerEmail?: string;
  isRecurring: boolean;
  providerRefs: ProviderRef[];
};

type Props = {
  event: EditableCalendarEvent;
  targets: ProviderRef[];
  accounts: CalendarEventAccount[];
  sources: CalendarEventSource[];
  members: CalendarFamilyMember[];
  timezone: string;
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
};

function timeInTimeZone(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("hour")}:${values.get("minute")}`;
}

function dayDifference(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

function weekdayForDate(dateKey: string): WeekdayCode {
  return (["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as WeekdayCode[])[
    new Date(`${dateKey}T00:00:00Z`).getUTCDay()
  ]!;
}

function shiftWeekdays(days: WeekdayCode[], offset: number): WeekdayCode[] {
  const ordered = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as WeekdayCode[];
  return days.map((day) => ordered[(weekdayIndex[day] + offset + 700) % 7]!);
}

function eventDates(
  start: string,
  end: string,
  allDay: boolean,
  timezone: string,
): { startDate: string; endDate: string } {
  if (allDay) {
    return {
      startDate: start.slice(0, 10),
      endDate: shiftDateKey(end.slice(0, 10), -1),
    };
  }
  return {
    startDate: dateKeyInTimeZone(start, timezone),
    endDate: dateKeyInTimeZone(end, timezone),
  };
}

function messageFor(error: unknown): string {
  if (!(error instanceof Error)) return "The event could not be updated.";
  try {
    const parsed = JSON.parse(error.message) as { message?: string };
    return parsed.message ?? "The event could not be updated.";
  } catch {
    return error.message || "The event could not be updated.";
  }
}

export function CalendarEventEditDialog({
  event,
  targets,
  accounts,
  sources,
  members,
  timezone,
  onClose,
  onUpdated,
}: Props): JSX.Element {
  const participants = resolveFamilyParticipants(members, sources, accounts);
  const targetSource = sources.find(
    (source) => source.id === targets[0]?.sourceId,
  );
  const targetAccount = accounts.find(
    (account) => account.id === targetSource?.connectedAccountId,
  );
  const organizerEmail =
    event.organizerEmail ??
    (targetSource
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetSource.externalCalendarId)
        ? targetSource.externalCalendarId
        : targetSource.externalCalendarId === "primary"
          ? targetAccount?.email ?? undefined
          : undefined
      : undefined);
  const originalAttendeeEmails = event.attendeeEmails ?? [];
  const originalEmailSet = new Set(
    originalAttendeeEmails.map((email) => email.toLocaleLowerCase()),
  );
  const familyEmailSet = new Set(
    participants
      .map((participant) => participant.email?.toLocaleLowerCase())
      .filter((email): email is string => Boolean(email)),
  );
  const preservedExternalAttendees = originalAttendeeEmails.filter(
    (email) =>
      !familyEmailSet.has(email.toLocaleLowerCase()) &&
      email.toLocaleLowerCase() !== organizerEmail?.toLocaleLowerCase(),
  );
  const initialDates = eventDates(
    event.start,
    event.end,
    event.isAllDay,
    timezone,
  );
  const recurringTarget = targets.find((target) => target.recurringEventId);
  const canEditSeries = Boolean(event.isRecurring && recurringTarget);

  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(initialDates.startDate);
  const [endDate, setEndDate] = useState(initialDates.endDate);
  const [startTime, setStartTime] = useState(
    event.isAllDay ? "09:00" : timeInTimeZone(event.start, timezone),
  );
  const [endTime, setEndTime] = useState(
    event.isAllDay ? "10:00" : timeInTimeZone(event.end, timezone),
  );
  const [allDay, setAllDay] = useState(event.isAllDay);
  const [location, setLocation] = useState(event.location ?? "");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState(
    participants
      .filter(
        (participant) =>
          participant.email &&
          originalEmailSet.has(participant.email.toLocaleLowerCase()) &&
          participant.email.toLocaleLowerCase() !==
            organizerEmail?.toLocaleLowerCase(),
      )
      .map((participant) => participant.id),
  );
  const [scope, setScope] = useState<EditScope>("event");
  const [schedule, setSchedule] = useState<RecurrenceSchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(canEditSeries);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<RepeatFrequency>("weekly");
  const [weeklyDays, setWeeklyDays] = useState<WeekdayCode[]>([
    weekdayForDate(initialDates.startDate),
  ]);
  const [seriesEnd, setSeriesEnd] = useState<SeriesEnd>("keep");
  const [seriesUntil, setSeriesUntil] = useState(
    shiftDateKey(initialDates.startDate, 7),
  );
  const [seriesCount, setSeriesCount] = useState(10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attendeeEmailsForUpdate = Array.from(
    new Set([
      ...preservedExternalAttendees,
      ...participantEmails(
        participants,
        selectedParticipantIds,
        organizerEmail,
      ),
    ]),
  );

  useEffect(() => {
    if (!recurringTarget?.recurringEventId) return;
    let cancelled = false;
    const params = new URLSearchParams({
      sourceId: recurringTarget.sourceId,
      recurringEventId: recurringTarget.recurringEventId,
      timezone,
    });
    void apiFetch<RecurrenceSchedule>(
      `/calendar/events/recurrence?${params.toString()}`,
    )
      .then((result) => {
        if (cancelled) return;
        setSchedule(result);
        setRepeat(result.frequency);
        if (result.frequency === "weekly") {
          setWeeklyDays(
            result.days.length
              ? result.days
              : [weekdayForDate(initialDates.startDate)],
          );
        }
        setSeriesUntil(
          result.until ?? shiftDateKey(initialDates.startDate, 7),
        );
        setSeriesCount(result.count ?? 10);
        setScheduleError(result.editable ? null : result.message ?? null);
      })
      .catch((loadError) => {
        if (!cancelled) setScheduleError(messageFor(loadError));
      })
      .finally(() => {
        if (!cancelled) setScheduleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialDates.startDate, recurringTarget?.recurringEventId, recurringTarget?.sourceId, timezone]);

  const changeStartDate = (nextDate: string): void => {
    const offset = dayDifference(date, nextDate);
    setDate(nextDate);
    setEndDate(shiftDateKey(endDate, offset));
    if (scope !== "event" && repeat === "weekly") {
      setWeeklyDays((days) => shiftWeekdays(days, offset));
    }
  };

  const changeScope = (nextScope: EditScope): void => {
    setScope(nextScope);
    if (nextScope === "series" && schedule?.start && schedule.end) {
      const masterDates = eventDates(
        schedule.start,
        schedule.end,
        schedule.allDay,
        timezone,
      );
      setDate(masterDates.startDate);
      setEndDate(masterDates.endDate);
      if (!schedule.allDay) {
        setStartTime(timeInTimeZone(schedule.start, timezone));
        setEndTime(timeInTimeZone(schedule.end, timezone));
      }
      setAllDay(schedule.allDay);
    } else if (nextScope !== "series") {
      setDate(initialDates.startDate);
      setEndDate(initialDates.endDate);
      setAllDay(event.isAllDay);
      if (!event.isAllDay) {
        setStartTime(timeInTimeZone(event.start, timezone));
        setEndTime(timeInTimeZone(event.end, timezone));
      }
    }
  };

  const submit = async (): Promise<void> => {
    setError(null);
    let start = date;
    let end = shiftDateKey(endDate, 1);
    if (!allDay) {
      const [startHour, startMinute] = startTime.split(":").map(Number);
      const [endHour, endMinute] = endTime.split(":").map(Number);
      start = dateFromDateKeyInTimeZone(
        date,
        timezone,
        startHour,
        startMinute,
      ).toISOString();
      end = dateFromDateKeyInTimeZone(
        endDate,
        timezone,
        endHour,
        endMinute,
      ).toISOString();
    }
    setSaving(true);
    try {
      await apiFetch("/calendar/events", {
        method: "PATCH",
        body: JSON.stringify({
          targets,
          scope: canEditSeries ? scope : "event",
          title: title.trim(),
          location: location.trim() || null,
          attendees: attendeeEmailsForUpdate,
          allDay,
          start,
          end,
          originalStart: event.start,
          ...(canEditSeries && scope !== "event" && schedule?.editable
            ? {
                recurrencePattern: {
                  frequency: repeat,
                  ...(repeat === "weekly" ? { days: weeklyDays } : {}),
                },
                recurrenceEnd: {
                  mode: seriesEnd,
                  ...(seriesEnd === "on_date" ? { until: seriesUntil } : {}),
                  ...(seriesEnd === "after" ? { count: seriesCount } : {}),
                },
              }
            : {}),
          timezone,
        }),
      });
      await onUpdated();
    } catch (updateError) {
      setError(messageFor(updateError));
    } finally {
      setSaving(false);
    }
  };

  const showEndDate = allDay || endDate !== date;
  const scheduleUnavailable = scheduleLoading || !schedule?.editable;

  return (
    <div
      role="dialog"
      data-diagnostic-action="calendar:edit-event-dialog"
      aria-modal="true"
      aria-labelledby="edit-calendar-event-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#f7f7f5] p-2 sm:p-3"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white sm:max-h-[calc(100dvh-1.5rem)]"
        onClick={(click) => click.stopPropagation()}
      >
        <form
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            void submit();
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#287f78]">
                  Google Calendar
                </div>
                <h2
                  id="edit-calendar-event-title"
                  className="font-display text-3xl text-slate-950"
                >
                  Edit event
                </h2>
              </div>
              <button
                type="button"
                data-diagnostic-action="calendar:edit-event-close"
                aria-label="Close edit event"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600"
                onClick={onClose}
              >
                ×
              </button>
            </div>
            <div className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-slate-700">
                  Event title
                </span>
                <input
                  required
                  value={title}
                  onChange={(change) => setTitle(change.target.value)}
                  className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-base"
                />
              </label>

              {canEditSeries ? (
                <fieldset className="grid gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <legend className="px-1 text-sm font-semibold text-slate-700">
                    Apply changes to
                  </legend>
                  <label className="flex min-h-[38px] items-center gap-3">
                    <input
                      type="radio"
                      name="edit-scope"
                      checked={scope === "event"}
                      onChange={() => changeScope("event")}
                    />
                    This occurrence
                  </label>
                  <label className="flex min-h-[38px] items-center gap-3">
                    <input
                      type="radio"
                      name="edit-scope"
                      checked={scope === "following"}
                      disabled={scheduleUnavailable}
                      onChange={() => changeScope("following")}
                    />
                    This and following occurrences
                  </label>
                  <label className="flex min-h-[38px] items-center gap-3">
                    <input
                      type="radio"
                      name="edit-scope"
                      checked={scope === "series"}
                      disabled={scheduleUnavailable}
                      onChange={() => changeScope("series")}
                    />
                    Entire series
                  </label>
                  {scheduleLoading ? (
                    <p className="text-xs text-slate-500">Loading schedule…</p>
                  ) : scheduleError ? (
                    <p className="text-xs text-amber-700">{scheduleError}</p>
                  ) : null}
                </fieldset>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <label className="grid min-w-0 gap-1">
                  <span className="text-sm font-semibold text-slate-700">
                    {scope === "following" ? "Effective date" : "Start date"}
                  </span>
                  <input
                    type="date"
                    required
                    min={scope === "following" ? initialDates.startDate : undefined}
                    value={date}
                    onChange={(change) => changeStartDate(change.target.value)}
                    className="min-h-[44px] min-w-0 rounded-xl border border-slate-300 px-3 text-base"
                  />
                </label>
                {showEndDate ? (
                  <label className="grid min-w-0 gap-1">
                    <span className="text-sm font-semibold text-slate-700">
                      End date
                    </span>
                    <input
                      type="date"
                      required
                      min={date}
                      value={endDate}
                      onChange={(change) => setEndDate(change.target.value)}
                      className="min-h-[44px] min-w-0 rounded-xl border border-slate-300 px-3 text-base"
                    />
                  </label>
                ) : (
                  <label className="flex min-h-[44px] items-center gap-3 self-end rounded-xl bg-slate-50 px-3 font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={allDay}
                      onChange={(change) => setAllDay(change.target.checked)}
                    />
                    All day
                  </label>
                )}
              </div>
              {showEndDate ? (
                <label className="flex min-h-[40px] items-center gap-3 rounded-xl bg-slate-50 px-3 font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(change) => setAllDay(change.target.checked)}
                  />
                  All day
                </label>
              ) : null}

              {!allDay ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid min-w-0 gap-1">
                    <span className="text-sm font-semibold text-slate-700">
                      Start time
                    </span>
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={(change) => setStartTime(change.target.value)}
                      className="min-h-[44px] min-w-0 rounded-xl border border-slate-300 px-3 text-base"
                    />
                  </label>
                  <label className="grid min-w-0 gap-1">
                    <span className="text-sm font-semibold text-slate-700">
                      End time
                    </span>
                    <input
                      type="time"
                      required
                      value={endTime}
                      onChange={(change) => setEndTime(change.target.value)}
                      className="min-h-[44px] min-w-0 rounded-xl border border-slate-300 px-3 text-base"
                    />
                  </label>
                </div>
              ) : null}

              {canEditSeries && scope !== "event" && schedule?.editable ? (
                <section className="grid gap-3 rounded-2xl border border-slate-200 p-3">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Repeat schedule
                  </h3>
                  <label className="grid gap-1">
                    <span className="text-sm font-semibold text-slate-700">
                      Repeat
                    </span>
                    <select
                      aria-label="Repeat"
                      value={repeat}
                      onChange={(change) =>
                        setRepeat(change.target.value as RepeatFrequency)
                      }
                      className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-base"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </label>
                  {repeat === "weekly" ? (
                    <fieldset className="grid gap-1.5">
                      <legend className="text-sm font-semibold text-slate-700">
                        Repeats on
                      </legend>
                      <div className="grid grid-cols-7 gap-1">
                        {weekdays.map((weekday) => {
                          const selected = weeklyDays.includes(weekday.code);
                          return (
                            <label
                              key={weekday.code}
                              className={`flex min-h-[38px] cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold ${
                                selected
                                  ? "border-[#0f766e] bg-[#dcefeb] text-[#0f5f59]"
                                  : "border-slate-300 bg-white text-slate-600"
                              }`}
                            >
                              <input
                                type="checkbox"
                                aria-label={weekday.label}
                                className="sr-only"
                                checked={selected}
                                onChange={() =>
                                  setWeeklyDays((days) =>
                                    selected
                                      ? days.length > 1
                                        ? days.filter(
                                            (day) => day !== weekday.code,
                                          )
                                        : days
                                      : [...days, weekday.code],
                                  )
                                }
                              />
                              {weekday.short}
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-xs text-slate-500">
                        Moving the start date shifts these weekdays by the same
                        number of days. You can adjust them afterward.
                      </p>
                    </fieldset>
                  ) : null}
                  <label className="grid gap-1">
                    <span className="text-sm font-semibold text-slate-700">
                      Series ending
                    </span>
                    <select
                      aria-label="Series ending"
                      value={seriesEnd}
                      onChange={(change) =>
                        setSeriesEnd(change.target.value as SeriesEnd)
                      }
                      className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-base"
                    >
                      <option value="keep">Keep existing end</option>
                      <option value="on_date">End on date</option>
                      <option value="after">After occurrences</option>
                      <option value="never">Never end</option>
                    </select>
                  </label>
                  {seriesEnd === "on_date" ? (
                    <label className="grid gap-1">
                      <span className="text-sm font-semibold text-slate-700">
                        Last date
                      </span>
                      <input
                        type="date"
                        required
                        min={date}
                        value={seriesUntil}
                        onChange={(change) => setSeriesUntil(change.target.value)}
                        className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-base"
                      />
                    </label>
                  ) : null}
                  {seriesEnd === "after" ? (
                    <label className="grid gap-1">
                      <span className="text-sm font-semibold text-slate-700">
                        Remaining occurrences
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        required
                        value={seriesCount}
                        onChange={(change) =>
                          setSeriesCount(Number(change.target.value))
                        }
                        className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-base"
                      />
                    </label>
                  ) : null}
                </section>
              ) : null}

              <label className="grid gap-1">
                <span className="text-sm font-semibold text-slate-700">
                  Location <span className="font-normal">(optional)</span>
                </span>
                <input
                  value={location}
                  onChange={(change) => setLocation(change.target.value)}
                  className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-base"
                />
              </label>
              <FamilyParticipantPicker
                participants={participants}
                organizerEmail={organizerEmail}
                selectedIds={selectedParticipantIds}
                onChange={setSelectedParticipantIds}
              />
              {preservedExternalAttendees.length ? (
                <section
                  aria-labelledby="other-calendar-guests"
                  className="grid gap-2"
                >
                  <h3
                    id="other-calendar-guests"
                    className="text-sm font-semibold text-slate-700"
                  >
                    Other guests
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {preservedExternalAttendees.map((email) => (
                      <span
                        key={email}
                        className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
                        title={email}
                      >
                        {email}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    Existing guests remain invited.
                  </p>
                </section>
              ) : null}
              {attendeeEmailsForUpdate.length ? (
                <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">
                  Google Calendar will email participants about these changes.
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="text-sm font-medium text-rose-700">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-5 sm:py-4">
            <button
              type="button"
              className="min-h-[44px] rounded-xl px-4 font-semibold text-slate-600"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                saving ||
                !title.trim() ||
                endDate < date ||
                (scope !== "event" && scheduleUnavailable)
              }
              className="min-h-[44px] rounded-xl bg-[#0f766e] px-5 font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
