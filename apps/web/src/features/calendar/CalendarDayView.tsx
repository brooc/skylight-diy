import { CalendarEventCard } from "./CalendarEventCard";

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

export function CalendarDayView({
  title,
  events,
  compact = false
}: {
  title: string;
  events: CalendarEvent[];
  compact?: boolean;
}): JSX.Element {
  return (
    <section
      className={`min-w-0 rounded-md border border-[#ecebe8] bg-[#fbfbfa] ${
        compact ? "grid content-start gap-2 p-2" : "grid gap-3 p-3"
      }`}
    >
      <h2
        className={`font-display leading-none text-slate-900 ${
          compact ? "text-xl xl:text-lg 2xl:text-xl" : "text-4xl"
        }`}
      >
        {title}
      </h2>
      {events.length > 0 ? (
        <div className="grid gap-2">
          {events.map((event) => (
            <CalendarEventCard key={event.id} event={event} compact={compact} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-slate-500">No events</div>
      )}
    </section>
  );
}
