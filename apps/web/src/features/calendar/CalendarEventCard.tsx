import { eventBandBackground, softenEventColor } from "./eventAppearance";

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  sourceName?: string;
  sourceNames?: string[];
  color?: string;
  colors?: string[];
  shared?: boolean;
};

export function CalendarEventCard({
  event,
  compact = false
}: {
  event: CalendarEvent;
  compact?: boolean;
}): JSX.Element {
  const sourceNames = event.sourceNames?.length
    ? event.sourceNames
    : event.sourceName
      ? [event.sourceName]
      : [];
  const sourceColors = (event.colors?.length ? event.colors : [event.color])
    .filter((color): color is string => Boolean(color))
    .map((color) => softenEventColor(color, "#eef7f7"));
  const primaryColor = event.colors?.[0] ?? event.color;
  const isHexColor = Boolean(primaryColor && /^#[0-9a-f]{6}$/i.test(primaryColor));
  const softBackground = softenEventColor(primaryColor, "#eef7f7");
  const softBorder = isHexColor ? `${primaryColor}44` : "#d7ece8";
  const background = event.shared
    ? eventBandBackground(sourceColors, softBackground)
    : softBackground;

  return (
    <article
      className={`min-w-0 rounded-md border ${compact ? "p-2" : "p-3"}`}
      data-event-shared={event.shared ? "true" : "false"}
      style={{ background, borderColor: softBorder }}
    >
      <div className={`min-w-0 gap-1 ${compact ? "grid" : "flex items-center justify-between gap-2"}`}>
        <h3 className="min-w-0 break-words text-sm font-semibold leading-tight text-slate-900">
          {event.title}
        </h3>
        {sourceNames.length ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="flex shrink-0 -space-x-0.5">
              {(event.colors?.length ? event.colors : [event.color ?? "#64748b"]).map(
                (color, index) => (
                  <span
                    key={`${color}-${index}`}
                    className="h-2.5 w-2.5 rounded-full border border-white"
                    style={{ backgroundColor: color }}
                  />
                )
              )}
            </span>
            <span className="min-w-0 truncate text-xs text-slate-600">
              {sourceNames.join(" · ")}
            </span>
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
