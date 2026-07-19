type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  sourceName?: string;
  color?: string;
};

export function CalendarEventCard({
  event,
  compact = false
}: {
  event: CalendarEvent;
  compact?: boolean;
}): JSX.Element {
  const isHexColor = Boolean(event.color && /^#[0-9a-f]{6}$/i.test(event.color));
  const softBackground = isHexColor ? `${event.color}22` : "#eef7f7";
  const softBorder = isHexColor ? `${event.color}44` : "#d7ece8";

  return (
    <article
      className={`min-w-0 rounded-md border ${compact ? "p-2" : "p-3"}`}
      style={{ backgroundColor: softBackground, borderColor: softBorder }}
    >
      <div className={`min-w-0 gap-1 ${compact ? "grid" : "flex items-center justify-between gap-2"}`}>
        <h3 className="min-w-0 break-words text-sm font-semibold leading-tight text-slate-900">
          {event.title}
        </h3>
        {event.sourceName ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: event.color ?? "#64748b" }}
            />
            <span className="min-w-0 truncate text-xs text-slate-600">{event.sourceName}</span>
          </div>
        ) : null}
      </div>
      <p className={`${compact ? "text-xs" : "text-sm"} mt-1 truncate whitespace-nowrap text-slate-700`}>
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
