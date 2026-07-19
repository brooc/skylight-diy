export type SourceCalendarEvent = {
  id: string;
  iCalUID?: string;
  sourceId: string;
  sourceName: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  isAllDay: boolean;
  color: string | null;
};

export type MergedCalendarEvent = SourceCalendarEvent & {
  sourceIds: string[];
  sourceNames: string[];
  colors: string[];
  shared: boolean;
};

export function mergeSharedEvents(events: SourceCalendarEvent[]): MergedCalendarEvent[] {
  const merged = new Map<string, MergedCalendarEvent>();

  for (const event of events) {
    const key = event.iCalUID
      ? `${event.iCalUID}|${event.start}|${event.end}|${event.isAllDay}`
      : `source-event:${event.id}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...event,
        sourceIds: [event.sourceId],
        sourceNames: [event.sourceName],
        colors: event.color ? [event.color] : [],
        shared: false
      });
      continue;
    }

    if (!existing.sourceIds.includes(event.sourceId)) existing.sourceIds.push(event.sourceId);
    if (!existing.sourceNames.includes(event.sourceName)) existing.sourceNames.push(event.sourceName);
    if (event.color && !existing.colors.includes(event.color)) existing.colors.push(event.color);
    existing.sourceName = existing.sourceNames.join(", ");
    existing.shared = existing.sourceIds.length > 1;
    existing.description ||= event.description;
    existing.location ||= event.location;
  }

  return Array.from(merged.values()).sort(
    (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()
  );
}
