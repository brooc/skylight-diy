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
  const isHexColor = Boolean(event.color && /^#[0-9a-f]{6}$/i.test(event.color));
  const softBackground = isHexColor ? `${event.color}22` : "#eef7f7";
  const softBorder = isHexColor ? `${event.color}44` : "#d7ece8";

  return (
    <article
      className="rounded-md border p-3"
      style={{ backgroundColor: softBackground, borderColor: softBorder }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{event.title}</h3>
        {event.sourceName ? (
          <div className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: event.color ?? "#64748b" }}
            />
            <span className="text-xs text-slate-600">{event.sourceName}</span>
          </div>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-slate-700">
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
