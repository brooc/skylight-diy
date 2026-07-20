import { useState } from "react";
import { apiFetch } from "../../api/client";
import { dateFromDateKeyInTimeZone, dateKeyInTimeZone, shiftDateKey } from "./dateKeys";

type ProviderRef = {
  sourceId: string;
  providerEventId: string;
  recurringEventId?: string;
};

export type EditableCalendarEvent = {
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string;
  isRecurring: boolean;
  providerRefs: ProviderRef[];
};

type Props = {
  event: EditableCalendarEvent;
  targets: ProviderRef[];
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
  timezone,
  onClose,
  onUpdated,
}: Props): JSX.Element {
  const initialDate = event.isAllDay
    ? event.start.slice(0, 10)
    : dateKeyInTimeZone(event.start, timezone);
  const initialEndDate = event.isAllDay
    ? event.end.slice(0, 10)
    : dateKeyInTimeZone(event.end, timezone);
  const initialAllDayDuration = event.isAllDay
    ? Math.max(
        1,
        Math.round(
          (new Date(`${initialEndDate}T00:00:00Z`).getTime() -
            new Date(`${initialDate}T00:00:00Z`).getTime()) /
            86_400_000,
        ),
      )
    : 1;
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(
    event.isAllDay ? "09:00" : timeInTimeZone(event.start, timezone),
  );
  const [endTime, setEndTime] = useState(
    event.isAllDay ? "10:00" : timeInTimeZone(event.end, timezone),
  );
  const [allDay, setAllDay] = useState(event.isAllDay);
  const [location, setLocation] = useState(event.location ?? "");
  const [scope, setScope] = useState<"event" | "following">("event");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEditFollowing =
    event.isRecurring && targets.every((target) => target.recurringEventId);

  const submit = async (): Promise<void> => {
    setError(null);
    let start = date;
    let end = allDay ? shiftDateKey(date, initialAllDayDuration) : date;
    if (!allDay) {
      const [startHour, startMinute] = startTime.split(":").map(Number);
      const [endHour, endMinute] = endTime.split(":").map(Number);
      const startDate = dateFromDateKeyInTimeZone(date, timezone, startHour, startMinute);
      const endDate = dateFromDateKeyInTimeZone(endTime <= startTime ? shiftDateKey(date, 1) : date, timezone, endHour, endMinute);
      start = startDate.toISOString();
      end = endDate.toISOString();
    }
    setSaving(true);
    try {
      await apiFetch("/calendar/events", {
        method: "PATCH",
        body: JSON.stringify({
          targets,
          scope: canEditFollowing ? scope : "event",
          title: title.trim(),
          location: location.trim() || null,
          allDay,
          start,
          end,
          originalStart: event.start,
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

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="edit-calendar-event-title" className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]" onClick={(click) => click.stopPropagation()}>
        <form onSubmit={(submitEvent) => { submitEvent.preventDefault(); void submit(); }}>
          <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#287f78]">Google Calendar</div>
                <h2 id="edit-calendar-event-title" className="font-display text-3xl text-slate-950">Edit event</h2>
              </div>
              <button type="button" aria-label="Close edit event" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600" onClick={onClose}>×</button>
            </div>
            <div className="grid gap-3">
              <label className="grid gap-1"><span className="text-sm font-semibold text-slate-700">Event title</span><input autoFocus required value={title} onChange={(change) => setTitle(change.target.value)} className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-base" /></label>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,.7fr)]">
                <label className="grid gap-1"><span className="text-sm font-semibold text-slate-700">Date</span><input type="date" required value={date} onChange={(change) => setDate(change.target.value)} className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-base" /></label>
                <label className="flex min-h-[44px] items-center gap-3 self-end rounded-xl bg-slate-50 px-3 font-semibold text-slate-700"><input type="checkbox" checked={allDay} onChange={(change) => setAllDay(change.target.checked)} />All day</label>
              </div>
              {!allDay ? <div className="grid grid-cols-2 gap-3"><label className="grid gap-1"><span className="text-sm font-semibold text-slate-700">Start time</span><input type="time" required value={startTime} onChange={(change) => setStartTime(change.target.value)} className="min-h-[44px] min-w-0 rounded-xl border border-slate-300 px-3 text-base" /></label><label className="grid gap-1"><span className="text-sm font-semibold text-slate-700">End time</span><input type="time" required value={endTime} onChange={(change) => setEndTime(change.target.value)} className="min-h-[44px] min-w-0 rounded-xl border border-slate-300 px-3 text-base" /></label></div> : null}
              <label className="grid gap-1"><span className="text-sm font-semibold text-slate-700">Location <span className="font-normal">(optional)</span></span><input value={location} onChange={(change) => setLocation(change.target.value)} className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-base" /></label>
              {canEditFollowing ? <fieldset className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3"><legend className="px-1 text-sm font-semibold text-slate-700">Apply changes to</legend><label className="flex min-h-[42px] items-center gap-3"><input type="radio" name="edit-scope" checked={scope === "event"} onChange={() => setScope("event")} />This occurrence</label><label className="flex min-h-[42px] items-center gap-3"><input type="radio" name="edit-scope" checked={scope === "following"} onChange={() => setScope("following")} />This and following occurrences</label></fieldset> : null}
              {error ? <p role="alert" className="text-sm font-medium text-rose-700">{error}</p> : null}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4"><button type="button" className="min-h-[44px] rounded-xl px-4 font-semibold text-slate-600" onClick={onClose}>Cancel</button><button type="submit" disabled={saving || !title.trim()} className="min-h-[44px] rounded-xl bg-[#0f766e] px-5 font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button></div>
        </form>
      </div>
    </div>
  );
}
