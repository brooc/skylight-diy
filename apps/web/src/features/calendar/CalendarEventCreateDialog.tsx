import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { dateFromDateKeyInTimeZone, shiftDateKey } from "./dateKeys";

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
  enabled: boolean;
  allowEventWrites: boolean;
  googleAccessRole?: string | null;
};

type Props = {
  accounts: CalendarEventAccount[];
  sources: CalendarEventSource[];
  timezone: string;
  defaultDate: string;
  loading?: boolean;
  onClose: () => void;
  onCreated: (message: string) => Promise<void> | void;
};

function requestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16);
    const digit = value === "x" ? random : (random & 0x3) | 0x8;
    return digit.toString(16);
  });
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
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [guests, setGuests] = useState("");
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly" | "monthly">(
    "none",
  );
  const [repeatEnds, setRepeatEnds] = useState<"never" | "on_date" | "after">(
    "never",
  );
  const [repeatUntil, setRepeatUntil] = useState(defaultDate);
  const [repeatCount, setRepeatCount] = useState(10);
  const [submissionId] = useState(requestId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (!sourceId || !title.trim()) return;
    setError(null);

    const attendees = guests
      .split(/[,;\n]/)
      .map((email) => email.trim())
      .filter(Boolean);
    const invalidGuest = attendees.find(
      (email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    );
    if (invalidGuest) {
      setError(`Enter a valid email address for ${invalidGuest}.`);
      return;
    }

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
        date,
        timezone,
        endHour,
        endMinute,
      );
      if (endDate.getTime() <= startDate.getTime()) {
        setError("End time must be after start time.");
        return;
      }
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
          className="grid min-h-0 min-w-0 gap-3 overflow-x-hidden overflow-y-auto overscroll-contain p-4 sm:p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
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

              <label className="grid min-w-0 gap-1">
                <span className="text-sm font-semibold text-slate-700">
                  Calendar
                </span>
                <select
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
                    return (
                      <option key={source.id} value={source.id}>
                        {destinationLabel}
                      </option>
                    );
                  })}
                </select>
              </label>

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
                      onChange={(event) => setStartTime(event.target.value)}
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
                      onChange={(event) => setEndTime(event.target.value)}
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
                    onChange={(event) =>
                      setRepeat(event.target.value as typeof repeat)
                    }
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

              {repeat !== "none" && repeatEnds === "on_date" ? (
                <label className="grid min-w-0 gap-1">
                  <span className="text-sm font-semibold text-slate-700">
                    Last date
                  </span>
                  <input
                    type="date"
                    min={date}
                    required
                    value={repeatUntil}
                    onChange={(event) => setRepeatUntil(event.target.value)}
                    className="min-h-[42px] w-full min-w-0 rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                  />
                </label>
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

              <label className="grid min-w-0 gap-1">
                <span className="text-sm font-semibold text-slate-700">
                  Location <span className="font-normal">(optional)</span>
                </span>
                <input
                  maxLength={500}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  className="min-h-[42px] w-full min-w-0 rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                />
              </label>

              <label className="grid min-w-0 gap-1">
                <span className="text-sm font-semibold text-slate-700">
                  Guests <span className="font-normal">(optional)</span>
                </span>
                <input
                  value={guests}
                  placeholder="name@example.com, another@example.com"
                  onChange={(event) => setGuests(event.target.value)}
                  className="min-h-[42px] w-full min-w-0 rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                />
                <span className="text-xs text-slate-500">
                  Google will email invitations to these guests.
                </span>
              </label>

              {error ? (
                <p role="alert" className="text-sm font-medium text-rose-700">
                  {error}
                </p>
              ) : null}

              <div className="sticky bottom-0 -mx-4 -mb-4 flex justify-end gap-2 border-t border-slate-100 bg-white/95 px-4 pb-4 pt-3 backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5 sm:pb-5">
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
            </>
          )}
        </form>
      </div>
    </div>
  );
}
