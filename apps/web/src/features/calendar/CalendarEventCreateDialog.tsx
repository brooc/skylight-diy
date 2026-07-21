import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { dateFromDateKeyInTimeZone, shiftDateKey } from "./dateKeys";
import {
  FamilyParticipantPicker,
  participantEmails,
  resolveFamilyParticipants,
  type CalendarFamilyMember,
} from "./FamilyParticipantPicker";

export type CalendarEventAccount = {
  id: string;
  displayName?: string | null;
  email?: string | null;
  calendarWriteAccessGranted: boolean;
  reauthorizationRequired: boolean;
};

export type CalendarEventSource = {
  id: string;
  connectedAccountId: string;
  displayName: string;
  externalCalendarId: string;
  enabled: boolean;
  allowEventWrites: boolean;
  googleAccessRole?: string | null;
  personId?: string | null;
  personName?: string | null;
};

type Props = {
  accounts: CalendarEventAccount[];
  sources: CalendarEventSource[];
  members: CalendarFamilyMember[];
  timezone: string;
  defaultDate: string;
  loading?: boolean;
  onClose: () => void;
  onCreated: (message: string) => Promise<void> | void;
};

type WeekdayCode = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

const weekdayIndex: Record<WeekdayCode, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
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

function weekdayForDate(dateKey: string): WeekdayCode {
  const codes: WeekdayCode[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  return codes[new Date(`${dateKey}T00:00:00.000Z`).getUTCDay()] ?? "MO";
}

export function minimumRecurrenceUntil(
  dateKey: string,
  frequency: "daily" | "weekly" | "monthly",
  days: WeekdayCode[],
): string {
  if (frequency !== "weekly" || days.length === 0) {
    return shiftDateKey(dateKey, 1);
  }
  const startDay = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  const finalOffset = Math.max(
    ...days.map((day) => (weekdayIndex[day] - startDay + 7) % 7),
  );
  return shiftDateKey(dateKey, finalOffset + 1);
}

function requestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16);
    const digit = value === "x" ? random : (random & 0x3) | 0x8;
    return digit.toString(16);
  });
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const total = (hour * 60 + minute + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function clockDurationMinutes(start: string, end: string): number {
  const [startHour = 0, startMinute = 0] = start.split(":").map(Number);
  const [endHour = 0, endMinute = 0] = end.split(":").map(Number);
  const difference =
    (endHour * 60 + endMinute - (startHour * 60 + startMinute) + 24 * 60) %
    (24 * 60);
  return difference || 60;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "The event could not be created.";
  try {
    const payload = JSON.parse(error.message) as { message?: string };
    return payload.message ?? "The event could not be created.";
  } catch {
    return error.message || "The event could not be created.";
  }
}

export function CalendarEventCreateDialog({
  accounts,
  sources,
  members,
  timezone,
  defaultDate,
  loading = false,
  onClose,
  onCreated,
}: Props): JSX.Element {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const destinations = sources.filter((source) => {
    const account = accountById.get(source.connectedAccountId);
    return (
      source.enabled &&
      source.allowEventWrites &&
      (source.googleAccessRole === "owner" ||
        source.googleAccessRole === "writer") &&
      account?.calendarWriteAccessGranted &&
      !account.reauthorizationRequired
    );
  });
  const [sourceId, setSourceId] = useState(destinations[0]?.id ?? "");
  const selectedDestination = destinations.find(
    (source) => source.id === sourceId,
  );
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<
    string[]
  >([]);
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly" | "monthly">(
    "none",
  );
  const [repeatEnds, setRepeatEnds] = useState<"never" | "on_date" | "after">(
    "never",
  );
  const [repeatUntil, setRepeatUntil] = useState(defaultDate);
  const [repeatCount, setRepeatCount] = useState(10);
  const [weeklyDays, setWeeklyDays] = useState<WeekdayCode[]>([
    weekdayForDate(defaultDate),
  ]);
  const [submissionId] = useState(requestId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minimumRepeatUntil = minimumRecurrenceUntil(
    date,
    repeat === "none" ? "daily" : repeat,
    weeklyDays,
  );

  useEffect(() => {
    if (repeatEnds === "on_date" && repeatUntil < minimumRepeatUntil) {
      setRepeatUntil(minimumRepeatUntil);
    }
  }, [minimumRepeatUntil, repeatEnds, repeatUntil]);

  const submit = async (): Promise<void> => {
    if (!sourceId || !title.trim()) return;
    setError(null);

    const attendees = participantEmails(
      participants,
      selectedParticipantIds,
      organizerEmail,
    );

    let start = date;
    let end = shiftDateKey(date, 1);
    if (!allDay) {
      const [startHour, startMinute] = startTime.split(":").map(Number);
      const [endHour, endMinute] = endTime.split(":").map(Number);
      const startDate = dateFromDateKeyInTimeZone(
        date,
        timezone,
        startHour,
        startMinute,
      );
      const endDate = dateFromDateKeyInTimeZone(
        endTime <= startTime ? shiftDateKey(date, 1) : date,
        timezone,
        endHour,
        endMinute,
      );
      start = startDate.toISOString();
      end = endDate.toISOString();
    }

    setIsSubmitting(true);
    try {
      const result = await apiFetch<{ duplicate: boolean }>(
        "/calendar/events",
        {
          method: "POST",
          body: JSON.stringify({
            sourceId,
            requestId: submissionId,
            title: title.trim(),
            location: location.trim() || undefined,
            attendees: attendees.length ? attendees : undefined,
            recurrence:
              repeat === "none"
                ? undefined
                : {
                    frequency: repeat,
                    ends: repeatEnds,
                    days: repeat === "weekly" ? weeklyDays : undefined,
                    until: repeatEnds === "on_date" ? repeatUntil : undefined,
                    count: repeatEnds === "after" ? repeatCount : undefined,
                  },
            allDay,
            start,
            end,
            timezone,
          }),
        },
      );
      await onCreated(
        result.duplicate ? "Event already added." : "Event added to calendar.",
      );
    } catch (submissionError) {
      setError(errorMessage(submissionError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const participants = resolveFamilyParticipants(members, sources, accounts);
  const selectedAccount = selectedDestination
    ? accountById.get(selectedDestination.connectedAccountId)
    : undefined;
  const organizerEmail = selectedDestination
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        selectedDestination.externalCalendarId,
      )
      ? selectedDestination.externalCalendarId
      : selectedDestination.externalCalendarId === "primary"
        ? selectedAccount?.email ?? undefined
        : undefined
    : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-calendar-event-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-950/45 p-2 backdrop-blur-[2px] sm:p-3"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-1rem)] w-full min-w-0 max-w-lg flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)] sm:max-h-[calc(100dvh-1.5rem)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="h-2 shrink-0 bg-gradient-to-r from-[#8ec5b8] via-[#dca1b4] to-[#b7abd8]" />
        <form
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div
            data-testid="event-form-scroll"
            className="grid min-h-0 min-w-0 flex-1 gap-3 overflow-x-hidden overflow-y-auto overscroll-contain p-4 sm:p-5"
          >
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#287f78]">
                Google Calendar
              </div>
              <h2
                id="add-calendar-event-title"
                className="font-display text-2xl text-slate-950 sm:text-3xl"
              >
                Add event
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close add event"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600 hover:bg-slate-200"
              onClick={onClose}
            >
              ×
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-slate-50 p-5 text-sm font-medium text-slate-600">
              Loading writable calendars...
            </div>
          ) : destinations.length === 0 ? (
            <div className="grid gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p>
                No calendars are enabled for event creation. In Settings,
                authorize the Google account and explicitly allow writes for the
                calendars family members may use.
              </p>
              <Link
                to="/settings"
                className="justify-self-start rounded-md bg-amber-100 px-3 py-2 font-semibold"
              >
                Open calendar settings
              </Link>
            </div>
          ) : (
            <>
              <label className="grid min-w-0 gap-1">
                <span className="text-sm font-semibold text-slate-700">
                  Event title
                </span>
                <input
                  autoFocus
                  required
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="min-h-[42px] w-full min-w-0 rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                />
              </label>

              <div className="grid min-w-0 gap-1">
                <label
                  htmlFor="calendar-event-source"
                  className="text-sm font-semibold text-slate-700"
                >
                  Calendar
                </label>
                <select
                  id="calendar-event-source"
                  required
                  value={sourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                  className="min-h-[42px] w-full min-w-0 max-w-full truncate rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950"
                >
                  {destinations.map((source) => {
                    const account = accountById.get(source.connectedAccountId);
                    const accountLabel =
                      account?.email ||
                      account?.displayName ||
                      "Google account";
                    const destinationLabel =
                      source.displayName.toLocaleLowerCase() ===
                      accountLabel.toLocaleLowerCase()
                        ? source.displayName
                        : `${source.displayName} — ${accountLabel}`;
                    const ownershipLabel = source.personName
                      ? `${source.personName} — ${destinationLabel}`
                      : `Unassigned — ${destinationLabel}`;
                    return (
                      <option key={source.id} value={source.id}>
                        {ownershipLabel}
                      </option>
                    );
                  })}
                </select>
                <span className="text-xs text-slate-500">
                  {selectedDestination?.personName
                    ? `Shown as ${selectedDestination.personName} in Daymark.`
                    : "This calendar is unassigned in Daymark settings."}
                </span>
              </div>

              <FamilyParticipantPicker
                participants={participants}
                organizerEmail={organizerEmail}
                selectedIds={selectedParticipantIds}
                onChange={setSelectedParticipantIds}
              />

              <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.72fr)]">
                <label className="grid min-w-0 gap-1">
                  <span className="text-sm font-semibold text-slate-700">
                    Date
                  </span>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="min-h-[42px] w-full min-w-0 rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                  />
                </label>
                <label className="flex min-h-[42px] min-w-0 items-center gap-3 self-end rounded-xl bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(event) => setAllDay(event.target.checked)}
                  />
                  All day
                </label>
              </div>

              {!allDay ? (
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                  <label className="grid min-w-0 gap-1">
                    <span className="text-sm font-semibold text-slate-700">
                      Start time
                    </span>
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={(event) => {
                        const nextStart = event.target.value;
                        setStartTime(nextStart);
                        setEndTime(
                          addMinutesToTime(nextStart, durationMinutes),
                        );
                      }}
                      className="min-h-[42px] w-full min-w-0 rounded-xl border border-slate-300 px-3 text-base text-slate-950"
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
                      onChange={(event) => {
                        const nextEnd = event.target.value;
                        setEndTime(nextEnd);
                        setDurationMinutes(
                          clockDurationMinutes(startTime, nextEnd),
                        );
                      }}
                      className="min-h-[42px] w-full min-w-0 rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                    />
                  </label>
                </div>
              ) : null}

              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1">
                  <span className="text-sm font-semibold text-slate-700">
                    Repeat
                  </span>
                  <select
                    aria-label="Repeat"
                    value={repeat}
                    onChange={(event) => {
                      const nextRepeat = event.target.value as typeof repeat;
                      setRepeat(nextRepeat);
                      if (nextRepeat === "weekly") {
                        setWeeklyDays([weekdayForDate(date)]);
                      }
                    }}
                    className="min-h-[42px] w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950"
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                {repeat !== "none" ? (
                  <label className="grid min-w-0 gap-1">
                    <span className="text-sm font-semibold text-slate-700">
                      Ends
                    </span>
                    <select
                      aria-label="Repeat ends"
                      value={repeatEnds}
                      onChange={(event) =>
                        setRepeatEnds(event.target.value as typeof repeatEnds)
                      }
                      className="min-h-[42px] w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950"
                    >
                      <option value="never">Never</option>
                      <option value="on_date">On date</option>
                      <option value="after">After occurrences</option>
                    </select>
                  </label>
                ) : null}
              </div>

              {repeat === "weekly" ? (
                <fieldset className="grid gap-1.5">
                  <legend className="text-sm font-semibold text-slate-700">
                    Repeats on
                  </legend>
                  <div className="grid grid-cols-7 gap-1.5">
                    {weekdays.map((weekday) => {
                      const selected = weeklyDays.includes(weekday.code);
                      return (
                        <label
                          key={weekday.code}
                          className={`flex min-h-[40px] cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold transition-colors ${
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
                            onChange={() => {
                              if (selected) {
                                if (weeklyDays.length > 1) {
                                  setWeeklyDays((days) =>
                                    days.filter((day) => day !== weekday.code),
                                  );
                                }
                              } else {
                                setWeeklyDays((days) => [
                                  ...days,
                                  weekday.code,
                                ]);
                              }
                            }}
                          />
                          {weekday.short}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}

              {repeat !== "none" && repeatEnds === "on_date" ? (
                <div className="grid min-w-0 gap-1">
                  <label
                    htmlFor="calendar-repeat-until"
                    className="text-sm font-semibold text-slate-700"
                  >
                    Last date
                  </label>
                  <input
                    id="calendar-repeat-until"
                    type="date"
                    min={minimumRepeatUntil}
                    required
                    value={repeatUntil}
                    onChange={(event) => setRepeatUntil(event.target.value)}
                    className="min-h-[42px] w-full min-w-0 rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                  />
                  <span className="text-xs text-slate-500">
                    Must be after the first repeat cycle.
                  </span>
                </div>
              ) : null}

              {repeat !== "none" && repeatEnds === "after" ? (
                <label className="grid min-w-0 gap-1">
                  <span className="text-sm font-semibold text-slate-700">
                    Number of occurrences
                  </span>
                  <input
                    type="number"
                    min={2}
                    max={365}
                    required
                    value={repeatCount}
                    onChange={(event) =>
                      setRepeatCount(Number(event.target.value))
                    }
                    className="min-h-[42px] w-full min-w-0 rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                  />
                </label>
              ) : null}

              <details className="group rounded-2xl border border-slate-200 bg-slate-50/70">
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-slate-700 marker:content-none">
                  <span>More options</span>
                  <span
                    aria-hidden="true"
                    className="text-lg leading-none text-slate-500 transition-transform group-open:rotate-180"
                  >
                    ⌄
                  </span>
                </summary>
                <div className="grid gap-3 border-t border-slate-200 p-3">
                  <label className="grid min-w-0 gap-1">
                    <span className="text-sm font-semibold text-slate-700">
                      Location <span className="font-normal">(optional)</span>
                    </span>
                    <input
                      maxLength={500}
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      className="min-h-[42px] w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950"
                    />
                  </label>

                </div>
              </details>

              {error ? (
                <p role="alert" className="text-sm font-medium text-rose-700">
                  {error}
                </p>
              ) : null}

            </>
          )}
          </div>
          {!loading && destinations.length > 0 ? (
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-5 sm:py-4">
              <button
                type="button"
                className="min-h-[44px] rounded-xl px-4 font-semibold text-slate-600 hover:bg-slate-100"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !sourceId || !title.trim()}
                className="min-h-[44px] rounded-xl bg-[#0f766e] px-5 font-semibold text-white hover:bg-[#0d5f59] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Adding event..." : "Add event"}
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
