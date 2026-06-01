import { CalendarEventCard } from "./CalendarEventCard";

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  sourceName?: string;
  color?: string;
};

export function CalendarDayView({
  title,
  events
}: {
  title: string;
  events: CalendarEvent[];
}): JSX.Element {
  return (
    <section className="grid gap-3 rounded-md border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      {events.length > 0 ? (
        <div className="grid gap-2">
          {events.map((event) => (
            <CalendarEventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-slate-500">No events</div>
      )}
    </section>
  );
}
