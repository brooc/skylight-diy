export type SourceCalendarEvent = {
  id: string;
  providerEventId: string;
  recurringEventId?: string;
  iCalUID?: string;
  sourceId: string;
  sourceName: string;
  title: string;
  description?: string;
  location?: string;
  attendeeEmails?: string[];
  organizerEmail?: string;
  meetingUrl?: string;
  reminderMinutesBefore?: number[];
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
  providerRefs: Array<{
    sourceId: string;
    providerEventId: string;
    recurringEventId?: string;
  }>;
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
        shared: false,
        providerRefs: [
          {
            sourceId: event.sourceId,
            providerEventId: event.providerEventId,
            recurringEventId: event.recurringEventId
          }
        ]
      });
      continue;
    }

    if (!existing.sourceIds.includes(event.sourceId)) existing.sourceIds.push(event.sourceId);
    if (!existing.sourceNames.includes(event.sourceName)) existing.sourceNames.push(event.sourceName);
    if (event.color && !existing.colors.includes(event.color)) existing.colors.push(event.color);
    if (
      !existing.providerRefs.some(
        (reference) => reference.sourceId === event.sourceId && reference.providerEventId === event.providerEventId
      )
    ) {
      existing.providerRefs.push({
        sourceId: event.sourceId,
        providerEventId: event.providerEventId,
        recurringEventId: event.recurringEventId
      });
    }
    existing.sourceName = existing.sourceNames.join(", ");
    existing.shared = existing.sourceIds.length > 1;
    existing.description ||= event.description;
    existing.location ||= event.location;
    existing.attendeeEmails = Array.from(
      new Set([...(existing.attendeeEmails ?? []), ...(event.attendeeEmails ?? [])])
    );
    existing.organizerEmail ||= event.organizerEmail;
    existing.meetingUrl ||= event.meetingUrl;
    existing.reminderMinutesBefore = Array.from(
      new Set([...(existing.reminderMinutesBefore ?? []), ...(event.reminderMinutesBefore ?? [])])
    ).sort((left, right) => right - left);
  }

  return Array.from(merged.values()).sort(
    (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()
  );
}
