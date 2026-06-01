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
    <section className="grid gap-3 rounded-md border border-[#ecebe8] bg-[#fbfbfa] p-3">
      <h2 className="font-display text-4xl leading-none text-slate-900">{title}</h2>
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
