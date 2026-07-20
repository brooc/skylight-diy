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
  const [description, setDescription] = useState("");
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
            description: description.trim() || undefined,
            location: location.trim() || undefined,
            attendees: attendees.length ? attendees : undefined,
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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-lg overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="h-2 bg-gradient-to-r from-[#8ec5b8] via-[#dca1b4] to-[#b7abd8]" />
        <form
          className="grid gap-4 p-5 sm:p-7"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#287f78]">
                Google Calendar
              </div>
              <h2
                id="add-calendar-event-title"
                className="font-display text-3xl text-slate-950"
              >
                Add event
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close add event"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600 hover:bg-slate-200"
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
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-slate-700">
                  Event title
                </span>
                <input
                  autoFocus
                  required
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="min-h-[46px] rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-semibold text-slate-700">
                  Calendar
                </span>
                <select
                  required
                  value={sourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                  className="min-h-[46px] rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950"
                >
                  {destinations.map((source) => {
                    const account = accountById.get(source.connectedAccountId);
                    return (
                      <option key={source.id} value={source.id}>
                        {source.displayName} —{" "}
                        {account?.email ||
                          account?.displayName ||
                          "Google account"}
                      </option>
                    );
                  })}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-slate-700">
                    Date
                  </span>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="min-h-[46px] rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                  />
                </label>
                <label className="flex min-h-[46px] items-center gap-3 self-end rounded-xl bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(event) => setAllDay(event.target.checked)}
                  />
                  All day
                </label>
              </div>

              {!allDay ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1">
                    <span className="text-sm font-semibold text-slate-700">
                      Start time
                    </span>
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={(event) => setStartTime(event.target.value)}
                      className="min-h-[46px] rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-semibold text-slate-700">
                      End time
                    </span>
                    <input
                      type="time"
                      required
                      value={endTime}
                      onChange={(event) => setEndTime(event.target.value)}
                      className="min-h-[46px] rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                    />
                  </label>
                </div>
              ) : null}

              <label className="grid gap-1">
                <span className="text-sm font-semibold text-slate-700">
                  Location <span className="font-normal">(optional)</span>
                </span>
                <input
                  maxLength={500}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-semibold text-slate-700">
                  Guests <span className="font-normal">(optional)</span>
                </span>
                <input
                  value={guests}
                  placeholder="name@example.com, another@example.com"
                  onChange={(event) => setGuests(event.target.value)}
                  className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                />
                <span className="text-xs text-slate-500">
                  Google will email invitations to these guests.
                </span>
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-semibold text-slate-700">
                  Notes <span className="font-normal">(optional)</span>
                </span>
                <textarea
                  rows={3}
                  maxLength={8_000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-base text-slate-950"
                />
              </label>

              {error ? (
                <p role="alert" className="text-sm font-medium text-rose-700">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
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
