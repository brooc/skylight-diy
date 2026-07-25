export type CalendarCacheStatus = "fresh" | "refreshed" | "stale" | "miss";

export type DisplayCalendarEvent = {
  id: string;
  sourceId: string;
  sourceIds?: string[];
  sourceName: string;
  sourceNames?: string[];
  title: string;
  description?: string;
  location?: string;
  attendeeEmails?: string[];
  organizerEmail?: string;
  meetingUrl?: string;
  start: string;
  end: string;
  isAllDay: boolean;
  color?: string;
  colors?: string[];
  shared?: boolean;
};

export type CalendarDisplaySource = {
  id: string;
  displayName: string;
  color?: string;
  personId?: string;
  enabled: boolean;
};

export type CalendarEventsResponse = {
  rangeStart: string;
  rangeEnd: string;
  timezone: string;
  events: DisplayCalendarEvent[];
  sources: CalendarDisplaySource[];
  fetchedAt?: string;
  cacheStatus: CalendarCacheStatus;
  degraded: boolean;
  warnings: Array<{
    code: string;
    message: string;
    sourceId?: string;
  }>;
};
