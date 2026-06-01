export type CalendarCacheStatus = "fresh" | "refreshed" | "stale" | "miss";

export type DisplayCalendarEvent = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  isAllDay: boolean;
  color?: string;
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
