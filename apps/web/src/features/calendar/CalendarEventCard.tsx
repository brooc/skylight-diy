type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  sourceName?: string;
  color?: string;
};

export function CalendarEventCard({ event }: { event: CalendarEvent }): JSX.Element {
  return (
    <article className="rounded-md border border-slate-800 bg-slate-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{event.title}</h3>
        {event.sourceName ? (
          <span className="text-xs text-slate-400" style={{ color: event.color ?? undefined }}>
            {event.sourceName}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-slate-300">
        {event.isAllDay
          ? "All day"
          : `${new Date(event.start).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit"
            })} - ${new Date(event.end).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit"
            })}`}
      </p>
    </article>
  );
}
