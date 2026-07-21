import {
  calendarEventCache,
  calendarEventWriteLogs,
  calendarFetchLogs,
  calendarSources,
  connectedAccounts,
  households,
  people
} from "@daymark/db";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../env";
import {
  buildCalendarCacheKey,
  buildSourceFingerprint,
  readCalendarCache,
  writeCalendarCache
} from "../modules/calendar/cache";
import { decryptToken, encryptToken } from "../modules/integrations/token-crypto";
import {
  mergeSharedEvents,
  type SourceCalendarEvent
} from "../modules/calendar/merge-shared-events";

const eventsQuerySchema = z
  .object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    timezone: z.string().min(1).refine((timezone) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
        return true;
      } catch {
        return false;
      }
    }, "Invalid IANA timezone."),
    refresh: z.enum(["true", "false"]).optional().transform((value) => value === "true")
  })
  .refine((query) => new Date(query.end).getTime() > new Date(query.start).getTime(), {
    message: "End must be after start.",
    path: ["end"]
  });

const patchSourceBodySchema = z.object({
  enabled: z.boolean().optional(),
  allowEventWrites: z.boolean().optional(),
  personId: z.string().uuid().nullable().optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional()
});

const accountSourcesBodySchema = z.object({
  accountId: z.string().uuid()
});

const importSourcesBodySchema = accountSourcesBodySchema.extend({
  externalCalendarIds: z.array(z.string().min(1)).max(250)
});

type RecurrenceWeekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

const recurrenceWeekdayIndex: Record<RecurrenceWeekday, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6
};

function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

export function minimumRecurrenceUntil(
  dateKey: string,
  frequency: "daily" | "weekly" | "monthly",
  days: RecurrenceWeekday[] = []
): string {
  if (frequency !== "weekly" || days.length === 0) return shiftDateKey(dateKey, 1);
  const startDay = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  const finalOffset = Math.max(
    ...days.map((day) => (recurrenceWeekdayIndex[day] - startDay + 7) % 7)
  );
  return shiftDateKey(dateKey, finalOffset + 1);
}

function eventDateKey(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

const calendarEventBodySchema = z
  .object({
    sourceId: z.string().uuid(),
    requestId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(8_000).optional(),
    location: z.string().trim().max(500).optional(),
    attendees: z.array(z.string().email()).max(50).optional(),
    allDay: z.boolean(),
    start: z.string().min(1),
    end: z.string().min(1),
    recurrence: z
      .object({
        frequency: z.enum(["daily", "weekly", "monthly"]),
        ends: z.enum(["never", "on_date", "after"]),
        days: z.array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])).min(1).max(7).optional(),
        until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        count: z.number().int().min(2).max(365).optional()
      })
      .optional(),
    timezone: z.string().min(1).refine((timezone) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
        return true;
      } catch {
        return false;
      }
    }, "Invalid IANA timezone.")
  })
  .superRefine((event, context) => {
    if (event.recurrence?.ends === "on_date" && !event.recurrence.until) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recurring events ending on a date require an end date.",
        path: ["recurrence", "until"]
      });
    }
    if (event.recurrence?.ends === "after" && !event.recurrence.count) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recurring events ending after occurrences require a count.",
        path: ["recurrence", "count"]
      });
    }
    if (event.recurrence?.frequency === "weekly" && !event.recurrence.days?.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Weekly recurring events require at least one weekday.",
        path: ["recurrence", "days"]
      });
    }
    let eventStartDate = event.start.slice(0, 10);
    if (!event.allDay) {
      try {
        eventStartDate = eventDateKey(event.start, event.timezone);
      } catch {
        // Other schema checks report malformed dates or timezones.
      }
    }
    const minimumUntil = event.recurrence
      ? minimumRecurrenceUntil(
          eventStartDate,
          event.recurrence.frequency,
          event.recurrence.days
        )
      : eventStartDate;
    if (
      event.recurrence?.ends === "on_date" &&
      event.recurrence.until &&
      event.recurrence.until < minimumUntil
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The recurrence end date must be ${minimumUntil} or later.`,
        path: ["recurrence", "until"]
      });
    }
    if (event.allDay) {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!datePattern.test(event.start) || !datePattern.test(event.end)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "All-day events require YYYY-MM-DD dates.",
          path: ["start"]
        });
        return;
      }
      if (event.end <= event.start) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "End must be after start.",
          path: ["end"]
        });
      }
      return;
    }

    const start = z.string().datetime().safeParse(event.start);
    const end = z.string().datetime().safeParse(event.end);
    if (!start.success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Timed events require an ISO start timestamp.",
        path: ["start"]
      });
    }
    if (!end.success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Timed events require an ISO end timestamp.",
        path: ["end"]
      });
    }
    if (
      start.success &&
      end.success &&
      new Date(event.end).getTime() <= new Date(event.start).getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End must be after start.",
        path: ["end"]
      });
    }
  });

const deleteCalendarEventsBodySchema = z.object({
  targets: z.array(z.object({
    sourceId: z.string().uuid(),
    providerEventId: z.string().min(1).max(1024),
    recurringEventId: z.string().min(1).max(1024).optional()
  })).min(1).max(25),
  scope: z.enum(["event", "series"]).default("event")
});

const editCalendarEventsBodySchema = z
  .object({
    targets: deleteCalendarEventsBodySchema.shape.targets,
    scope: z.enum(["event", "following"]).default("event"),
    title: z.string().trim().min(1).max(200),
    location: z.string().trim().max(500).nullable().optional(),
    attendees: z.array(z.string().email()).max(50).optional(),
    allDay: z.boolean(),
    start: z.string().min(1),
    end: z.string().min(1),
    originalStart: z.string().min(1),
    recurrenceEnd: z
      .object({
        mode: z.enum(["keep", "on_date", "never"]),
        until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      })
      .optional(),
    timezone: z.string().min(1)
  })
  .superRefine((event, context) => {
    if (event.scope === "following" && !event.targets.every((target) => target.recurringEventId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Following-event edits require a recurring series.",
        path: ["scope"]
      });
    }
    if (event.recurrenceEnd?.mode !== undefined && event.scope !== "following") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Series ending changes require a following-events edit.",
        path: ["recurrenceEnd"]
      });
    }
    if (event.recurrenceEnd?.mode === "on_date") {
      if (!event.recurrenceEnd.until) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Choose when the recurring series should end.",
          path: ["recurrenceEnd", "until"]
        });
      } else {
        let selectedDate = event.originalStart.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(event.originalStart)) {
          try {
            selectedDate = eventDateKey(event.originalStart, event.timezone);
          } catch {
            // Other schema checks report malformed dates or timezones.
          }
        }
        if (event.recurrenceEnd.until < selectedDate) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `The series end date must be ${selectedDate} or later.`,
            path: ["recurrenceEnd", "until"]
          });
        }
      }
    }
    if (event.allDay) {
      if (event.end <= event.start) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "End must be after start.", path: ["end"] });
      }
      return;
    }
    const start = z.string().datetime().safeParse(event.start);
    const end = z.string().datetime().safeParse(event.end);
    if (!start.success || !end.success || new Date(event.end).getTime() <= new Date(event.start).getTime()) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "End must be after start.", path: ["end"] });
    }
  });

type GoogleCalendarCandidate = {
  externalCalendarId: string;
  displayName: string;
  color: string;
  accessRole: string;
  sortOrder: number;
};

type GoogleCalendarLoadResult =
  | { ok: true; calendars: GoogleCalendarCandidate[] }
  | {
      ok: false;
      statusCode: 400 | 502;
      body: {
        error: string;
        message: string;
        statusCode?: number;
        details?: string;
      };
    };

type GoogleEventItem = {
  id?: string;
  iCalUID?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  recurringEventId?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  recurrence?: string[];
  attendees?: Array<Record<string, unknown>>;
  organizer?: { email?: string; self?: boolean };
  reminders?: Record<string, unknown>;
  transparency?: string;
  visibility?: string;
  colorId?: string;
  guestsCanInviteOthers?: boolean;
  guestsCanModify?: boolean;
  guestsCanSeeOtherGuests?: boolean;
  extendedProperties?: Record<string, unknown>;
};

function editableGoogleEvent(event: GoogleEventItem): Record<string, unknown> {
  return {
    summary: event.summary || "Untitled event",
    ...(event.description ? { description: event.description } : {}),
    ...(event.location ? { location: event.location } : {}),
    start: event.start,
    end: event.end,
    ...(event.recurrence ? { recurrence: event.recurrence } : {}),
    ...(event.attendees ? { attendees: event.attendees } : {}),
    ...(event.reminders ? { reminders: event.reminders } : {}),
    ...(event.transparency ? { transparency: event.transparency } : {}),
    ...(event.visibility ? { visibility: event.visibility } : {}),
    ...(event.colorId ? { colorId: event.colorId } : {}),
    ...(typeof event.guestsCanInviteOthers === "boolean" ? { guestsCanInviteOthers: event.guestsCanInviteOthers } : {}),
    ...(typeof event.guestsCanModify === "boolean" ? { guestsCanModify: event.guestsCanModify } : {}),
    ...(typeof event.guestsCanSeeOtherGuests === "boolean" ? { guestsCanSeeOtherGuests: event.guestsCanSeeOtherGuests } : {}),
    ...(event.extendedProperties ? { extendedProperties: event.extendedProperties } : {})
  };
}

function replaceRulePart(rule: string, name: "COUNT" | "UNTIL", value: string): string {
  const withoutEnd = rule.replace(/;(COUNT|UNTIL)=[^;]+/g, "");
  return `${withoutEnd};${name}=${value}`;
}

function changeRuleEnd(
  rule: string,
  recurrenceEnd: { mode: "keep" | "on_date" | "never"; until?: string } | undefined,
  timezone: string,
  allDay: boolean
): string {
  if (!recurrenceEnd || recurrenceEnd.mode === "keep") return rule;
  const withoutEnd = rule.replace(/;(COUNT|UNTIL)=[^;]+/g, "");
  if (recurrenceEnd.mode === "never") return withoutEnd;
  if (allDay) return `${withoutEnd};UNTIL=${recurrenceEnd.until!.replaceAll("-", "")}`;
  const until = dateFromDateKeyInTimeZone(recurrenceEnd.until!, timezone, 23, 59, 59)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.000Z$/, "Z");
  return `${withoutEnd};UNTIL=${until}`;
}

function utcUntilBefore(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return shiftDateKey(value, -1).replaceAll("-", "");
  }
  return new Date(new Date(value).getTime() - 1_000)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.000Z$/, "Z");
}

function dateFromDateKeyInTimeZone(
  dateKey: string,
  timeZone: string,
  hour: number,
  minute: number,
  second: number
): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const target = Date.UTC(year!, month! - 1, day!, hour, minute, second);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  let result = target;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Map(
      formatter.formatToParts(new Date(result)).map((part) => [part.type, part.value])
    );
    const represented = Date.UTC(
      Number(parts.get("year")),
      Number(parts.get("month")) - 1,
      Number(parts.get("day")),
      Number(parts.get("hour")),
      Number(parts.get("minute")),
      Number(parts.get("second"))
    );
    result += target - represented;
  }
  return new Date(result);
}

function googleRecurrenceRule(
  recurrence: NonNullable<z.infer<typeof calendarEventBodySchema>["recurrence"]>,
  timeZone: string
): string {
  const parts = [`RRULE:FREQ=${recurrence.frequency.toUpperCase()}`];
  if (recurrence.frequency === "weekly" && recurrence.days?.length) {
    parts.push(`BYDAY=${recurrence.days.join(",")}`);
  }
  if (recurrence.ends === "after") parts.push(`COUNT=${recurrence.count}`);
  if (recurrence.ends === "on_date" && recurrence.until) {
    const until = dateFromDateKeyInTimeZone(recurrence.until, timeZone, 23, 59, 59);
    parts.push(`UNTIL=${until.toISOString().replace(/[-:]/g, "").replace(/\.000Z$/, "Z")}`);
  }
  return parts.join(";");
}

type GoogleEventLoadResult =
  | { ok: true; items: GoogleEventItem[] }
  | { ok: false; statusCode: number };

type GoogleTokenAccount = {
  id: string;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  scopes: string[];
};

type GoogleAccessTokenResult =
  | { ok: true; accessToken: string; refreshed: boolean }
  | { ok: false; error: string; message: string; reauthorizationRequired: boolean };

const GOOGLE_TOKEN_REFRESH_MARGIN_MS = 60_000;
const GOOGLE_CALENDAR_READ_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_CALENDAR_WRITE_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_CALENDAR_FULL_SCOPE =
  "https://www.googleapis.com/auth/calendar";

function hasGoogleCalendarWriteScope(scopes: string[]): boolean {
  return (
    scopes.includes(GOOGLE_CALENDAR_WRITE_SCOPE) ||
    scopes.includes(GOOGLE_CALENDAR_FULL_SCOPE)
  );
}

function hasGoogleCalendarReadScope(scopes: string[]): boolean {
  return (
    scopes.includes(GOOGLE_CALENDAR_READ_SCOPE) ||
    scopes.includes(GOOGLE_CALENDAR_FULL_SCOPE)
  );
}

function isGoogleCalendarWritable(accessRole: string | null): boolean {
  return accessRole === "owner" || accessRole === "writer";
}

async function requireGoogleAccessToken(
  app: FastifyInstance,
  account: GoogleTokenAccount
): Promise<GoogleAccessTokenResult> {
  const tokenIsFresh =
    !account.accessTokenExpiresAt ||
    account.accessTokenExpiresAt.getTime() > Date.now() + GOOGLE_TOKEN_REFRESH_MARGIN_MS;
  if (account.encryptedAccessToken && tokenIsFresh) {
    try {
      return {
        ok: true,
        accessToken: decryptToken(account.encryptedAccessToken),
        refreshed: false
      };
    } catch {
      // A usable refresh token can still recover a malformed access token.
    }
  }

  const markReauthorizationRequired = async (): Promise<void> => {
    await app.db
      .update(connectedAccounts)
      .set({ reauthorizationRequired: true, updatedAt: new Date() })
      .where(eq(connectedAccounts.id, account.id));
  };
  if (!account.encryptedRefreshToken || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    await markReauthorizationRequired();
    return {
      ok: false,
      error: "google_reauthorization_required",
      message: "Reconnect Google Calendar to continue syncing.",
      reauthorizationRequired: true
    };
  }

  let refreshToken = "";
  try {
    refreshToken = decryptToken(account.encryptedRefreshToken);
  } catch {
    await markReauthorizationRequired();
    return {
      ok: false,
      error: "google_refresh_token_decrypt_failed",
      message: "Stored Google refresh credentials are unreadable. Reconnect Google Calendar.",
      reauthorizationRequired: true
    };
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });
    if (!response.ok) {
      await markReauthorizationRequired();
      return {
        ok: false,
        error: "google_token_refresh_failed",
        message: "Google authorization expired or was revoked. Reconnect Google Calendar.",
        reauthorizationRequired: true
      };
    }

    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!payload.access_token) {
      await markReauthorizationRequired();
      return {
        ok: false,
        error: "google_token_refresh_failed",
        message: "Google did not return a refreshed access token. Reconnect Google Calendar.",
        reauthorizationRequired: true
      };
    }

    const expiresAt = typeof payload.expires_in === "number"
      ? new Date(Date.now() + payload.expires_in * 1000)
      : null;
    const refreshedScopes = payload.scope?.split(/\s+/).filter(Boolean);
    await app.db
      .update(connectedAccounts)
      .set({
        encryptedAccessToken: encryptToken(payload.access_token),
        accessTokenExpiresAt: expiresAt,
        scopes: refreshedScopes?.length ? refreshedScopes : account.scopes,
        reauthorizationRequired: false,
        updatedAt: new Date()
      })
      .where(eq(connectedAccounts.id, account.id));
    return { ok: true, accessToken: payload.access_token, refreshed: true };
  } catch {
    return {
      ok: false,
      error: "google_token_refresh_request_failed",
      message: "Google token refresh could not be reached. Daymark will retry later.",
      reauthorizationRequired: false
    };
  }
}

async function loadGoogleCalendars(accessToken: string): Promise<GoogleCalendarLoadResult> {
  try {
    const fallbackColors = ["#8ec5b8", "#dca1b4", "#b7abd8"] as const;
    const calendars: GoogleCalendarCandidate[] = [];
    const seenPageTokens = new Set<string>();
    let pageToken: string | undefined;

    do {
      const calendarsUrl = new URL(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList"
      );
      if (pageToken) calendarsUrl.searchParams.set("pageToken", pageToken);
      const response = await fetch(calendarsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) {
        return {
          ok: false,
          statusCode: 502,
          body: {
            error: "google_calendar_list_failed",
            message: "Failed to load calendars from Google.",
            statusCode: response.status,
            details: await response.text()
          }
        };
      }

      const payload = (await response.json()) as {
        items?: Array<{
          id?: string;
          summary?: string;
          backgroundColor?: string;
          accessRole?: string;
        }>;
        nextPageToken?: string;
      };
      for (const item of payload.items ?? []) {
        if (!item.id || !item.summary) continue;
        const index = calendars.length;
        calendars.push({
          externalCalendarId: item.id,
          displayName: item.summary,
          color: item.backgroundColor ?? fallbackColors[index % fallbackColors.length]!,
          accessRole: item.accessRole ?? "reader",
          sortOrder: index
        });
      }

      pageToken = payload.nextPageToken;
      if (pageToken && seenPageTokens.has(pageToken)) {
        throw new Error("Google Calendar returned a repeated calendar-list page token.");
      }
      if (pageToken) seenPageTokens.add(pageToken);
    } while (pageToken);

    return { ok: true, calendars };
  } catch {
    return {
      ok: false,
      statusCode: 502,
      body: {
        error: "google_calendar_list_request_failed",
        message: "Unexpected error while loading calendars from Google."
      }
    };
  }
}

async function loadGoogleEvents(input: {
  accessToken: string;
  externalCalendarId: string;
  start: string;
  end: string;
  timezone: string;
}): Promise<GoogleEventLoadResult> {
  const items: GoogleEventItem[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken: string | undefined;

  do {
    const eventsUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.externalCalendarId)}/events`
    );
    eventsUrl.searchParams.set("singleEvents", "true");
    eventsUrl.searchParams.set("orderBy", "startTime");
    eventsUrl.searchParams.set("timeMin", input.start);
    eventsUrl.searchParams.set("timeMax", input.end);
    eventsUrl.searchParams.set("timeZone", input.timezone);
    if (pageToken) eventsUrl.searchParams.set("pageToken", pageToken);

    const response = await fetch(eventsUrl, {
      headers: { Authorization: `Bearer ${input.accessToken}` }
    });
    if (!response.ok) return { ok: false, statusCode: response.status };

    const payload = (await response.json()) as {
      items?: GoogleEventItem[];
      nextPageToken?: string;
    };
    items.push(...(payload.items ?? []));
    pageToken = payload.nextPageToken;
    if (pageToken && seenPageTokens.has(pageToken)) {
      throw new Error("Google Calendar returned a repeated event page token.");
    }
    if (pageToken) seenPageTokens.add(pageToken);
  } while (pageToken);

  return { ok: true, items };
}

export const calendarRoutes: FastifyPluginAsync = async (app) => {
  app.get("/calendar/accounts", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return { accounts: [] };
    }

    const accounts = await app.db
      .select({
        id: connectedAccounts.id,
        provider: connectedAccounts.provider,
        displayName: connectedAccounts.displayName,
        email: connectedAccounts.email,
        scopes: connectedAccounts.scopes,
        reauthorizationRequired: connectedAccounts.reauthorizationRequired,
        createdAt: connectedAccounts.createdAt
      })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.householdId, household.id))
      .orderBy(asc(connectedAccounts.createdAt));

    return {
      accounts: accounts.map((account) => ({
        ...account,
        calendarAccessGranted: hasGoogleCalendarReadScope(account.scopes),
        calendarWriteAccessGranted: hasGoogleCalendarWriteScope(account.scopes)
      }))
    };
  });

  app.get("/calendar/sources", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return { sources: [] };
    }

    const sources = await app.db
      .select({
        id: calendarSources.id,
        connectedAccountId: calendarSources.connectedAccountId,
        externalCalendarId: calendarSources.externalCalendarId,
        displayName: calendarSources.displayName,
        color: calendarSources.color,
        enabled: calendarSources.enabled,
        allowEventWrites: calendarSources.allowEventWrites,
        googleAccessRole: calendarSources.googleAccessRole,
        personId: calendarSources.personId,
        personName: people.displayName
      })
      .from(calendarSources)
      .leftJoin(people, eq(calendarSources.personId, people.id))
      .where(eq(calendarSources.householdId, household.id))
      .orderBy(asc(calendarSources.sortOrder), asc(calendarSources.createdAt));

    return { sources };
  });

  app.post("/calendar/sources/discover-from-google", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    const parsed = accountSourcesBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const [account] = await app.db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.id, parsed.data.accountId),
          eq(connectedAccounts.householdId, household.id),
          eq(connectedAccounts.provider, "google")
        )
      )
      .limit(1);

    if (!account) {
      return reply.status(409).send({
        error: "google_account_not_connected",
        message: "Connect Google Calendar before importing calendars."
      });
    }
    if (!account.encryptedAccessToken && !account.encryptedRefreshToken) {
      return reply.status(409).send({
        error: "google_account_not_connected",
        message: "Reconnect Google Calendar before importing calendars."
      });
    }

    const token = await requireGoogleAccessToken(app, account);
    if (!token.ok) {
      return reply
        .status(token.reauthorizationRequired ? 409 : 502)
        .send({ error: token.error, message: token.message });
    }
    const loaded = await loadGoogleCalendars(token.accessToken);
    if (!loaded.ok) {
      if (loaded.body.statusCode === 401) {
        await app.db
          .update(connectedAccounts)
          .set({ reauthorizationRequired: true, updatedAt: new Date() })
          .where(eq(connectedAccounts.id, account.id));
      }
      return reply.status(loaded.statusCode).send(loaded.body);
    }

    const trackedSources = await app.db
      .select({
        id: calendarSources.id,
        externalCalendarId: calendarSources.externalCalendarId,
        enabled: calendarSources.enabled,
        allowEventWrites: calendarSources.allowEventWrites
      })
      .from(calendarSources)
      .where(eq(calendarSources.connectedAccountId, account.id));
    const trackedByExternalId = new Map(
      trackedSources.map((source) => [source.externalCalendarId, source])
    );

    for (const calendar of loaded.calendars) {
      const trackedSource = trackedByExternalId.get(calendar.externalCalendarId);
      if (!trackedSource) continue;
      await app.db
        .update(calendarSources)
        .set({
          googleAccessRole: calendar.accessRole,
          ...(!isGoogleCalendarWritable(calendar.accessRole) &&
          trackedSource.allowEventWrites
            ? { allowEventWrites: false }
            : {}),
          updatedAt: new Date()
        })
        .where(eq(calendarSources.id, trackedSource.id));
    }

    return {
      calendars: loaded.calendars.map((calendar) => {
        const trackedSource = trackedByExternalId.get(calendar.externalCalendarId);
        return {
          ...calendar,
          tracked: Boolean(trackedSource),
          sourceId: trackedSource?.id ?? null,
          enabled: trackedSource?.enabled ?? false,
          writable: isGoogleCalendarWritable(calendar.accessRole)
        };
      })
    };
  });

  app.post("/calendar/sources/import-from-google", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    const parsed = importSourcesBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const [account] = await app.db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.id, parsed.data.accountId),
          eq(connectedAccounts.householdId, household.id),
          eq(connectedAccounts.provider, "google")
        )
      )
      .limit(1);
    if (!account || (!account.encryptedAccessToken && !account.encryptedRefreshToken)) {
      return reply.status(409).send({
        error: "google_account_not_connected",
        message: "Connect or reconnect Google Calendar before adding calendars."
      });
    }

    const token = await requireGoogleAccessToken(app, account);
    if (!token.ok) {
      return reply
        .status(token.reauthorizationRequired ? 409 : 502)
        .send({ error: token.error, message: token.message });
    }
    const loaded = await loadGoogleCalendars(token.accessToken);
    if (!loaded.ok) {
      if (loaded.body.statusCode === 401) {
        await app.db
          .update(connectedAccounts)
          .set({ reauthorizationRequired: true, updatedAt: new Date() })
          .where(eq(connectedAccounts.id, account.id));
      }
      return reply.status(loaded.statusCode).send(loaded.body);
    }
    const selectedIds = new Set(parsed.data.externalCalendarIds);
    const importCandidates = loaded.calendars.filter((calendar) => selectedIds.has(calendar.externalCalendarId));

    let imported = 0;
    for (const source of importCandidates) {
      const [existing] = await app.db
        .select({ id: calendarSources.id })
        .from(calendarSources)
        .where(
          and(
            eq(calendarSources.connectedAccountId, account.id),
            eq(calendarSources.externalCalendarId, source.externalCalendarId)
          )
        )
        .limit(1);
      if (existing) {
        continue;
      }
      imported += 1;
      await app.db.insert(calendarSources).values({
        householdId: household.id,
        connectedAccountId: account.id,
        provider: "google",
        externalCalendarId: source.externalCalendarId,
        displayName: source.displayName,
        color: source.color,
        enabled: true,
        googleAccessRole: source.accessRole,
        sortOrder: source.sortOrder
      });
    }

    const sources = await app.db
      .select({
        id: calendarSources.id,
        connectedAccountId: calendarSources.connectedAccountId,
        displayName: calendarSources.displayName,
        color: calendarSources.color,
        enabled: calendarSources.enabled,
        allowEventWrites: calendarSources.allowEventWrites,
        googleAccessRole: calendarSources.googleAccessRole,
        externalCalendarId: calendarSources.externalCalendarId,
        personId: calendarSources.personId
      })
      .from(calendarSources)
      .where(eq(calendarSources.householdId, household.id))
      .orderBy(asc(calendarSources.sortOrder), asc(calendarSources.createdAt));

    return { imported, sources };
  });

  app.patch("/calendar/sources/:sourceId", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    const parsed = patchSourceBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_body",
        details: parsed.error.flatten()
      });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const sourceId = (request.params as { sourceId: string }).sourceId;
    const [source] = await app.db
      .select({
        id: calendarSources.id,
        googleAccessRole: calendarSources.googleAccessRole
      })
      .from(calendarSources)
      .where(and(eq(calendarSources.id, sourceId), eq(calendarSources.householdId, household.id)))
      .limit(1);
    if (!source) {
      return reply.status(404).send({ error: "source_not_found" });
    }
    if (
      parsed.data.allowEventWrites === true &&
      !isGoogleCalendarWritable(source.googleAccessRole)
    ) {
      return reply.status(409).send({
        error: "google_calendar_not_writable",
        message: "Google has not granted write access to this calendar."
      });
    }

    if (typeof parsed.data.personId !== "undefined" && parsed.data.personId !== null) {
      const [person] = await app.db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, parsed.data.personId), eq(people.householdId, household.id)))
        .limit(1);
      if (!person) {
        return reply.status(400).send({ error: "invalid_person_id" });
      }
    }

    const updatePayload: {
      enabled?: boolean;
      allowEventWrites?: boolean;
      personId?: string | null;
      displayName?: string;
      color?: string | null;
      updatedAt: Date;
    } = {
      updatedAt: new Date()
    };
    if (typeof parsed.data.enabled === "boolean") {
      updatePayload.enabled = parsed.data.enabled;
    }
    if (typeof parsed.data.allowEventWrites === "boolean") {
      updatePayload.allowEventWrites = parsed.data.allowEventWrites;
    }
    if (typeof parsed.data.personId !== "undefined") {
      updatePayload.personId = parsed.data.personId;
    }
    if (typeof parsed.data.displayName === "string") {
      updatePayload.displayName = parsed.data.displayName;
    }
    if (typeof parsed.data.color !== "undefined") {
      updatePayload.color = parsed.data.color;
    }
    const [updated] = await app.db
      .update(calendarSources)
      .set(updatePayload)
      .where(eq(calendarSources.id, sourceId))
      .returning({
        id: calendarSources.id,
        displayName: calendarSources.displayName,
        enabled: calendarSources.enabled,
        allowEventWrites: calendarSources.allowEventWrites,
        personId: calendarSources.personId,
        color: calendarSources.color
      });

    return { updated: true, source: updated };
  });

  app.delete("/calendar/sources/:sourceId", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const sourceId = (request.params as { sourceId: string }).sourceId;
    const [deleted] = await app.db
      .delete(calendarSources)
      .where(and(eq(calendarSources.id, sourceId), eq(calendarSources.householdId, household.id)))
      .returning({ id: calendarSources.id });
    if (!deleted) {
      return reply.status(404).send({ error: "source_not_found" });
    }

    await app.db
      .delete(calendarEventCache)
      .where(eq(calendarEventCache.householdId, household.id));

    return { untracked: true, sourceId: deleted.id };
  });

  app.post("/calendar/events", async (request, reply) => {
    const parsed = calendarEventBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_calendar_event",
        details: parsed.error.flatten()
      });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const [destination] = await app.db
      .select({
        sourceId: calendarSources.id,
        externalCalendarId: calendarSources.externalCalendarId,
        displayName: calendarSources.displayName,
        enabled: calendarSources.enabled,
        allowEventWrites: calendarSources.allowEventWrites,
        googleAccessRole: calendarSources.googleAccessRole,
        accountId: connectedAccounts.id,
        encryptedAccessToken: connectedAccounts.encryptedAccessToken,
        encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
        accessTokenExpiresAt: connectedAccounts.accessTokenExpiresAt,
        scopes: connectedAccounts.scopes
      })
      .from(calendarSources)
      .innerJoin(
        connectedAccounts,
        eq(calendarSources.connectedAccountId, connectedAccounts.id)
      )
      .where(
        and(
          eq(calendarSources.id, parsed.data.sourceId),
          eq(calendarSources.householdId, household.id),
          eq(connectedAccounts.provider, "google")
        )
      )
      .limit(1);

    if (!destination) {
      return reply.status(404).send({ error: "calendar_source_not_found" });
    }
    if (!destination.enabled) {
      return reply.status(409).send({
        error: "calendar_source_disabled",
        message: "Enable this calendar before adding events to it."
      });
    }
    if (!isGoogleCalendarWritable(destination.googleAccessRole)) {
      return reply.status(403).send({
        error: "google_calendar_not_writable",
        message: `Google only allows viewing events on "${destination.displayName}".`
      });
    }
    if (!destination.allowEventWrites) {
      return reply.status(403).send({
        error: "calendar_writes_disabled",
        message: `Event creation is disabled for "${destination.displayName}" in Daymark settings.`
      });
    }
    if (!hasGoogleCalendarWriteScope(destination.scopes)) {
      return reply.status(409).send({
        error: "google_write_authorization_required",
        message: "Reconnect this Google account and allow event creation."
      });
    }

    const [existingWrite] = await app.db
      .select({ providerEventId: calendarEventWriteLogs.providerEventId })
      .from(calendarEventWriteLogs)
      .where(
        and(
          eq(calendarEventWriteLogs.householdId, household.id),
          eq(calendarEventWriteLogs.requestId, parsed.data.requestId)
        )
      )
      .limit(1);
    if (existingWrite) {
      return {
        created: true,
        duplicate: true,
        eventId: existingWrite.providerEventId,
        sourceId: destination.sourceId
      };
    }

    const token = await requireGoogleAccessToken(app, {
      id: destination.accountId,
      encryptedAccessToken: destination.encryptedAccessToken,
      encryptedRefreshToken: destination.encryptedRefreshToken,
      accessTokenExpiresAt: destination.accessTokenExpiresAt,
      scopes: destination.scopes
    });
    if (!token.ok) {
      return reply
        .status(token.reauthorizationRequired ? 409 : 502)
        .send({ error: token.error, message: token.message });
    }

    const eventId = parsed.data.requestId.replaceAll("-", "");
    const googleEvent = {
      id: eventId,
      summary: parsed.data.title,
      ...(parsed.data.description
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.location ? { location: parsed.data.location } : {}),
      ...(parsed.data.attendees?.length
        ? {
            attendees: parsed.data.attendees.map((email) => ({ email }))
          }
        : {}),
      ...(parsed.data.recurrence
        ? { recurrence: [googleRecurrenceRule(parsed.data.recurrence, parsed.data.timezone)] }
        : {}),
      start: parsed.data.allDay
        ? { date: parsed.data.start }
        : { dateTime: parsed.data.start, timeZone: parsed.data.timezone },
      end: parsed.data.allDay
        ? { date: parsed.data.end }
        : { dateTime: parsed.data.end, timeZone: parsed.data.timezone }
    };

    const createEventUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(destination.externalCalendarId)}/events`
    );
    if (parsed.data.attendees?.length) {
      createEventUrl.searchParams.set("sendUpdates", "all");
    }
    let googleResponse: Response;
    try {
      googleResponse = await fetch(
        createEventUrl,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(googleEvent)
        }
      );
    } catch {
      return reply.status(502).send({
        error: "google_event_create_request_failed",
        message: "Google Calendar could not be reached. Try again."
      });
    }

    if (googleResponse.status === 401) {
      await app.db
        .update(connectedAccounts)
        .set({ reauthorizationRequired: true, updatedAt: new Date() })
        .where(eq(connectedAccounts.id, destination.accountId));
      return reply.status(409).send({
        error: "google_reauthorization_required",
        message: "Reconnect this Google account before adding events."
      });
    }
    if (googleResponse.status === 403) {
      return reply.status(403).send({
        error: "google_calendar_not_writable",
        message: `Google does not allow this account to add events to "${destination.displayName}".`
      });
    }
    if (!googleResponse.ok && googleResponse.status !== 409) {
      return reply.status(502).send({
        error: "google_event_create_failed",
        message: "Google Calendar did not accept the event. Try again.",
        statusCode: googleResponse.status
      });
    }

    await app.db
      .delete(calendarEventCache)
      .where(eq(calendarEventCache.householdId, household.id));

    let providerEventId = eventId;
    let htmlLink: string | null = null;
    if (googleResponse.status !== 409) {
      const createdEvent = (await googleResponse.json()) as {
        id?: string;
        htmlLink?: string;
      };
      providerEventId = createdEvent.id ?? eventId;
      htmlLink = createdEvent.htmlLink ?? null;
    }
    await app.db
      .insert(calendarEventWriteLogs)
      .values({
        householdId: household.id,
        calendarSourceId: destination.sourceId,
        requestId: parsed.data.requestId,
        providerEventId,
        title: parsed.data.title
      })
      .onConflictDoNothing();

    if (googleResponse.status === 409) {
      return {
        created: true,
        duplicate: true,
        eventId: providerEventId,
        sourceId: destination.sourceId
      };
    }

    return reply.status(201).send({
      created: true,
      duplicate: false,
      eventId: providerEventId,
      htmlLink,
      sourceId: destination.sourceId
    });
  });

  app.patch("/calendar/events", async (request, reply) => {
    const parsed = editCalendarEventsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_calendar_event_edit", details: parsed.error.flatten() });
    }
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });

    const seenProviderEvents = new Set<string>();
    const mutationTargets = parsed.data.targets.filter((target) => {
      const providerIdentity = parsed.data.scope === "following"
        ? target.recurringEventId ?? target.providerEventId
        : target.providerEventId;
      if (seenProviderEvents.has(providerIdentity)) return false;
      seenProviderEvents.add(providerIdentity);
      return true;
    });
    const updated: Array<{ sourceId: string; providerEventId: string }> = [];
    for (const target of mutationTargets) {
      const [destination] = await app.db
        .select({
          sourceId: calendarSources.id,
          externalCalendarId: calendarSources.externalCalendarId,
          displayName: calendarSources.displayName,
          enabled: calendarSources.enabled,
          allowEventWrites: calendarSources.allowEventWrites,
          googleAccessRole: calendarSources.googleAccessRole,
          accountId: connectedAccounts.id,
          encryptedAccessToken: connectedAccounts.encryptedAccessToken,
          encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
          accessTokenExpiresAt: connectedAccounts.accessTokenExpiresAt,
          scopes: connectedAccounts.scopes
        })
        .from(calendarSources)
        .innerJoin(connectedAccounts, eq(calendarSources.connectedAccountId, connectedAccounts.id))
        .where(and(
          eq(calendarSources.id, target.sourceId),
          eq(calendarSources.householdId, household.id),
          eq(connectedAccounts.provider, "google")
        ))
        .limit(1);
      if (!destination) return reply.status(404).send({ error: "calendar_source_not_found" });
      if (!destination.enabled || !destination.allowEventWrites || !isGoogleCalendarWritable(destination.googleAccessRole)) {
        return reply.status(403).send({
          error: "calendar_writes_disabled",
          message: `Event editing is disabled for "${destination.displayName}".`
        });
      }
      if (!hasGoogleCalendarWriteScope(destination.scopes)) {
        return reply.status(409).send({ error: "google_write_authorization_required", message: "Reconnect this Google account and allow event changes." });
      }
      const token = await requireGoogleAccessToken(app, {
        id: destination.accountId,
        encryptedAccessToken: destination.encryptedAccessToken,
        encryptedRefreshToken: destination.encryptedRefreshToken,
        accessTokenExpiresAt: destination.accessTokenExpiresAt,
        scopes: destination.scopes
      });
      if (!token.ok) {
        return reply.status(token.reauthorizationRequired ? 409 : 502).send({ error: token.error, message: token.message });
      }

      const eventFields = {
        summary: parsed.data.title,
        location: parsed.data.location ?? "",
        ...(parsed.data.attendees
          ? { attendees: parsed.data.attendees.map((email) => ({ email })) }
          : {}),
        start: parsed.data.allDay
          ? { date: parsed.data.start }
          : { dateTime: parsed.data.start, timeZone: parsed.data.timezone },
        end: parsed.data.allDay
          ? { date: parsed.data.end }
          : { dateTime: parsed.data.end, timeZone: parsed.data.timezone }
      };
      const eventUrl = (eventId: string) =>
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(destination.externalCalendarId)}/events/${encodeURIComponent(eventId)}`;
      const headers = { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" };

      if (parsed.data.scope === "event") {
        const response = await fetch(`${eventUrl(target.providerEventId)}?sendUpdates=all`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(eventFields)
        });
        if (!response.ok) {
          return reply.status(response.status === 403 ? 403 : 502).send({
            error: "google_event_update_failed",
            message: "Google Calendar did not update the event. Try again."
          });
        }
        updated.push({ sourceId: target.sourceId, providerEventId: target.providerEventId });
        continue;
      }

      const masterId = target.recurringEventId!;
      const masterResponse = await fetch(eventUrl(masterId), { headers: { Authorization: `Bearer ${token.accessToken}` } });
      if (!masterResponse.ok) {
        return reply.status(502).send({ error: "google_recurring_event_load_failed", message: "The recurring series could not be loaded." });
      }
      const master = (await masterResponse.json()) as GoogleEventItem;
      const recurrence = master.recurrence ?? [];
      const ruleIndex = recurrence.findIndex((rule) => rule.startsWith("RRULE:"));
      if (ruleIndex < 0) {
        return reply.status(409).send({ error: "google_recurrence_rule_missing", message: "This recurring series cannot be split safely." });
      }
      const originalRule = recurrence[ruleIndex]!;
      const countMatch = originalRule.match(/;COUNT=(\d+)/);
      const instancesUrl = new URL(`${eventUrl(masterId)}/instances`);
      instancesUrl.searchParams.set(
        "timeMax",
        /^\d{4}-\d{2}-\d{2}$/.test(parsed.data.originalStart)
          ? `${parsed.data.originalStart}T00:00:00.000Z`
          : parsed.data.originalStart
      );
      instancesUrl.searchParams.set("maxResults", "2500");
      const instancesResponse = await fetch(instancesUrl, { headers: { Authorization: `Bearer ${token.accessToken}` } });
      if (!instancesResponse.ok) {
        return reply.status(502).send({ error: "google_recurring_instances_load_failed", message: "The recurring occurrences could not be loaded." });
      }
      const instances = (await instancesResponse.json()) as { items?: unknown[] };
      const previousCount = instances.items?.length ?? 0;

      if (previousCount === 0) {
        const updatedRule = changeRuleEnd(
          originalRule,
          parsed.data.recurrenceEnd,
          parsed.data.timezone,
          parsed.data.allDay
        );
        const updatedRecurrence = [...recurrence];
        updatedRecurrence[ruleIndex] = updatedRule;
        const response = await fetch(`${eventUrl(masterId)}?sendUpdates=all`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            ...eventFields,
            ...(updatedRule !== originalRule ? { recurrence: updatedRecurrence } : {})
          })
        });
        if (!response.ok) return reply.status(502).send({ error: "google_event_update_failed" });
        updated.push({ sourceId: target.sourceId, providerEventId: masterId });
        continue;
      }

      const trimmedRule = countMatch
        ? replaceRulePart(originalRule, "COUNT", String(previousCount))
        : replaceRulePart(originalRule, "UNTIL", utcUntilBefore(parsed.data.originalStart));
      const remainingRule = countMatch
        ? replaceRulePart(originalRule, "COUNT", String(Math.max(1, Number(countMatch[1]) - previousCount)))
        : originalRule;
      const newRule = changeRuleEnd(
        remainingRule,
        parsed.data.recurrenceEnd,
        parsed.data.timezone,
        parsed.data.allDay
      );
      const trimmedRecurrence = [...recurrence];
      trimmedRecurrence[ruleIndex] = trimmedRule;
      const newRecurrence = [...recurrence];
      newRecurrence[ruleIndex] = newRule;
      const originalBody = editableGoogleEvent(master);
      const trimResponse = await fetch(`${eventUrl(masterId)}?sendUpdates=all`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ recurrence: trimmedRecurrence })
      });
      if (!trimResponse.ok) return reply.status(502).send({ error: "google_recurring_event_trim_failed" });

      const insertResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(destination.externalCalendarId)}/events?sendUpdates=all`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ...originalBody, ...eventFields, recurrence: newRecurrence })
        }
      );
      if (!insertResponse.ok) {
        await fetch(`${eventUrl(masterId)}?sendUpdates=none`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ recurrence })
        }).catch(() => undefined);
        return reply.status(502).send({ error: "google_recurring_event_split_failed", message: "Google Calendar could not create the updated series." });
      }
      const inserted = (await insertResponse.json()) as { id?: string };
      updated.push({ sourceId: target.sourceId, providerEventId: inserted.id ?? masterId });
    }

    await app.db.delete(calendarEventCache).where(eq(calendarEventCache.householdId, household.id));
    return { updated: true, scope: parsed.data.scope, events: updated };
  });

  app.delete("/calendar/events", async (request, reply) => {
    const parsed = deleteCalendarEventsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_calendar_event_delete",
        details: parsed.error.flatten()
      });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const uniqueTargets = Array.from(
      new Map(parsed.data.targets.map((target) => [
        `${target.sourceId}:${target.providerEventId}`,
        target
      ])).values()
    );
    const deleted: Array<{ sourceId: string; providerEventId: string }> = [];

    for (const target of uniqueTargets) {
      const [destination] = await app.db
        .select({
          sourceId: calendarSources.id,
          externalCalendarId: calendarSources.externalCalendarId,
          displayName: calendarSources.displayName,
          enabled: calendarSources.enabled,
          allowEventWrites: calendarSources.allowEventWrites,
          googleAccessRole: calendarSources.googleAccessRole,
          accountId: connectedAccounts.id,
          encryptedAccessToken: connectedAccounts.encryptedAccessToken,
          encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
          accessTokenExpiresAt: connectedAccounts.accessTokenExpiresAt,
          scopes: connectedAccounts.scopes
        })
        .from(calendarSources)
        .innerJoin(
          connectedAccounts,
          eq(calendarSources.connectedAccountId, connectedAccounts.id)
        )
        .where(and(
          eq(calendarSources.id, target.sourceId),
          eq(calendarSources.householdId, household.id),
          eq(connectedAccounts.provider, "google")
        ))
        .limit(1);

      if (!destination) {
        return reply.status(404).send({ error: "calendar_source_not_found" });
      }
      if (!destination.enabled || !destination.allowEventWrites) {
        return reply.status(403).send({
          error: "calendar_writes_disabled",
          message: `Event deletion is disabled for "${destination.displayName}" in Daymark settings.`
        });
      }
      if (!isGoogleCalendarWritable(destination.googleAccessRole)) {
        return reply.status(403).send({
          error: "google_calendar_not_writable",
          message: `Google only allows viewing events on "${destination.displayName}".`
        });
      }
      if (!hasGoogleCalendarWriteScope(destination.scopes)) {
        return reply.status(409).send({
          error: "google_write_authorization_required",
          message: "Reconnect this Google account and allow event changes."
        });
      }

      const token = await requireGoogleAccessToken(app, {
        id: destination.accountId,
        encryptedAccessToken: destination.encryptedAccessToken,
        encryptedRefreshToken: destination.encryptedRefreshToken,
        accessTokenExpiresAt: destination.accessTokenExpiresAt,
        scopes: destination.scopes
      });
      if (!token.ok) {
        return reply
          .status(token.reauthorizationRequired ? 409 : 502)
          .send({ error: token.error, message: token.message });
      }

      const providerEventId = parsed.data.scope === "series"
        ? target.recurringEventId ?? target.providerEventId
        : target.providerEventId;
      const deleteUrl = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(destination.externalCalendarId)}/events/${encodeURIComponent(providerEventId)}`
      );
      deleteUrl.searchParams.set("sendUpdates", "all");

      let googleResponse: Response;
      try {
        googleResponse = await fetch(deleteUrl, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token.accessToken}` }
        });
      } catch {
        return reply.status(502).send({
          error: "google_event_delete_request_failed",
          message: "Google Calendar could not be reached. Try again."
        });
      }
      if (googleResponse.status === 401) {
        await app.db
          .update(connectedAccounts)
          .set({ reauthorizationRequired: true, updatedAt: new Date() })
          .where(eq(connectedAccounts.id, destination.accountId));
        return reply.status(409).send({
          error: "google_reauthorization_required",
          message: "Reconnect this Google account before deleting events."
        });
      }
      if (googleResponse.status === 403) {
        return reply.status(403).send({
          error: "google_calendar_not_writable",
          message: `Google does not allow this account to delete events from "${destination.displayName}".`
        });
      }
      if (!googleResponse.ok && googleResponse.status !== 404 && googleResponse.status !== 410) {
        return reply.status(502).send({
          error: "google_event_delete_failed",
          message: "Google Calendar did not delete the event. Try again.",
          statusCode: googleResponse.status
        });
      }
      deleted.push({ sourceId: destination.sourceId, providerEventId });
    }

    await app.db
      .delete(calendarEventCache)
      .where(eq(calendarEventCache.householdId, household.id));

    return { deleted: true, scope: parsed.data.scope, events: deleted };
  });

  app.get("/calendar/events", async (request, reply) => {
    const parsed = eventsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_calendar_query",
        details: parsed.error.flatten()
      });
    }

    const rangeStart = new Date(parsed.data.start);
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return {
        rangeStart: parsed.data.start,
        rangeEnd: parsed.data.end,
        timezone: parsed.data.timezone,
        events: [],
        sources: [],
        cacheStatus: "miss",
        degraded: true,
        warnings: [
          {
            code: "SETUP_NOT_COMPLETED",
            message: "Setup not completed yet."
          }
        ]
      };
    }

    const sourceRows = await app.db
      .select({
        id: calendarSources.id,
        connectedAccountId: calendarSources.connectedAccountId,
        externalCalendarId: calendarSources.externalCalendarId,
        displayName: calendarSources.displayName,
        color: calendarSources.color,
        enabled: calendarSources.enabled,
        allowEventWrites: calendarSources.allowEventWrites,
        personId: calendarSources.personId,
        personName: people.displayName,
        encryptedAccessToken: connectedAccounts.encryptedAccessToken,
        encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
        accessTokenExpiresAt: connectedAccounts.accessTokenExpiresAt,
        accountScopes: connectedAccounts.scopes
      })
      .from(calendarSources)
      .leftJoin(people, eq(calendarSources.personId, people.id))
      .leftJoin(connectedAccounts, eq(calendarSources.connectedAccountId, connectedAccounts.id))
      .where(eq(calendarSources.householdId, household.id))
      .orderBy(asc(calendarSources.sortOrder), asc(calendarSources.createdAt));

    const sources = sourceRows.map((source) => ({
      id: source.id,
      connectedAccountId: source.connectedAccountId,
      externalCalendarId: source.externalCalendarId,
      displayName: source.displayName,
      color: source.color,
      enabled: source.enabled,
      allowEventWrites: source.allowEventWrites,
      personId: source.personId
    }));

    const enabledSources = sourceRows.filter((source) => source.enabled);
    const sourceFingerprint = buildSourceFingerprint(
      sourceRows.map((source) => ({
        id: source.id,
        enabled: source.enabled,
        externalCalendarId: source.externalCalendarId,
        displayName: source.displayName,
        color: source.color,
        personId: source.personId,
        personName: source.personName
      }))
    );
    const cacheKey = buildCalendarCacheKey({
      rangeStart: parsed.data.start,
      rangeEnd: parsed.data.end,
      timezone: parsed.data.timezone,
      sourceFingerprint
    });
    const cacheHit = await readCalendarCache(app.db, household.id, cacheKey);
    if (cacheHit.status === "fresh" && !parsed.data.refresh) {
      return {
        rangeStart: parsed.data.start,
        rangeEnd: parsed.data.end,
        timezone: parsed.data.timezone,
        events: cacheHit.payload.events,
        sources: cacheHit.payload.sources,
        cacheStatus: "fresh",
        degraded: cacheHit.payload.warnings.length > 0,
        warnings: cacheHit.payload.warnings
      };
    }

    const warnings: Array<{ code: string; message: string; sourceId?: string }> = [];
    const fallbackCachePayload = cacheHit.status === "miss" ? null : cacheHit.payload;
    const sourceEvents: SourceCalendarEvent[] = [];
    let successfulProviderFetches = 0;
    const accountTokens = new Map<string, GoogleAccessTokenResult>();

    const logFetch = async (
      sourceId: string,
      status: "success" | "skipped" | "error",
      errorMessage?: string
    ): Promise<void> => {
      await app.db.insert(calendarFetchLogs).values({
        householdId: household.id,
        calendarSourceId: sourceId,
        rangeStart: rangeStart,
        rangeEnd: new Date(parsed.data.end),
        status,
        errorMessage
      });
    };

    for (const source of enabledSources) {
      if (!source.encryptedAccessToken && !source.encryptedRefreshToken) {
        await logFetch(source.id, "skipped", "Source is missing an access token.");
        warnings.push({
          code: "SOURCE_MISSING_TOKEN",
          message: `Source "${source.displayName}" is missing an access token.`,
          sourceId: source.id
        });
        continue;
      }

      let token = accountTokens.get(source.connectedAccountId);
      if (!token) {
        token = await requireGoogleAccessToken(app, {
          id: source.connectedAccountId,
          encryptedAccessToken: source.encryptedAccessToken,
          encryptedRefreshToken: source.encryptedRefreshToken,
          accessTokenExpiresAt: source.accessTokenExpiresAt,
          scopes: source.accountScopes ?? []
        });
        accountTokens.set(source.connectedAccountId, token);
      }
      if (!token.ok) {
        await logFetch(source.id, "error", token.message);
        warnings.push({
          code: token.reauthorizationRequired
            ? "SOURCE_REAUTHORIZATION_REQUIRED"
            : "SOURCE_TOKEN_REFRESH_FAILED",
          message: `${token.message} Source: "${source.displayName}".`,
          sourceId: source.id
        });
        continue;
      }
      const accessToken = token.accessToken;

      try {
        const providerResult = await loadGoogleEvents({
          accessToken,
          externalCalendarId: source.externalCalendarId,
          start: parsed.data.start,
          end: parsed.data.end,
          timezone: parsed.data.timezone
        });
        if (!providerResult.ok) {
          if (providerResult.statusCode === 401) {
            await app.db
              .update(connectedAccounts)
              .set({ reauthorizationRequired: true, updatedAt: new Date() })
              .where(eq(connectedAccounts.id, source.connectedAccountId));
          }
          await logFetch(
            source.id,
            "error",
            `Google Calendar returned ${providerResult.statusCode}.`
          );
          warnings.push({
            code: "SOURCE_FETCH_FAILED",
            message: `Failed to fetch events for "${source.displayName}".`,
            sourceId: source.id
          });
          continue;
        }

        successfulProviderFetches += 1;
        await logFetch(source.id, "success");

        for (const item of providerResult.items) {
          if (item.status === "cancelled") {
            continue;
          }
          const start = item.start?.dateTime ?? item.start?.date;
          const end = item.end?.dateTime ?? item.end?.date;
          if (!start || !end) {
            continue;
          }
          const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
          sourceEvents.push({
            id: `${source.id}:${item.id ?? start}`,
            providerEventId: item.id ?? start,
            recurringEventId: item.recurringEventId,
            iCalUID: item.iCalUID,
            sourceId: source.id,
            title: item.summary || "Untitled event",
            description: item.description,
            location: item.location,
            attendeeEmails: (item.attendees ?? [])
              .map((attendee) =>
                typeof attendee.email === "string" ? attendee.email : undefined
              )
              .filter((email): email is string => Boolean(email)),
            organizerEmail: item.organizer?.email,
            start,
            end,
            isAllDay,
            sourceName: source.personName || source.displayName,
            color: source.color
          });
        }
      } catch {
        await logFetch(source.id, "error", "Unexpected error while fetching events from Google.");
        warnings.push({
          code: "SOURCE_REQUEST_ERROR",
          message: `Unexpected error while fetching "${source.displayName}".`,
          sourceId: source.id
        });
      }
    }

    if (successfulProviderFetches > 0) {
      const googleEvents = mergeSharedEvents(sourceEvents);
      const payload = {
        rangeStart: parsed.data.start,
        rangeEnd: parsed.data.end,
        timezone: parsed.data.timezone,
        events: googleEvents,
        sources,
        warnings
      };
      await writeCalendarCache(app.db, {
        householdId: household.id,
        cacheKey,
        rangeStart: parsed.data.start,
        rangeEnd: parsed.data.end,
        timezone: parsed.data.timezone,
        sourceFingerprint,
        payload,
        freshTtlSeconds: env.CALENDAR_CACHE_FRESH_TTL_SECONDS,
        staleTtlSeconds: env.CALENDAR_CACHE_STALE_TTL_SECONDS
      });
      return {
        rangeStart: parsed.data.start,
        rangeEnd: parsed.data.end,
        timezone: parsed.data.timezone,
        events: googleEvents,
        sources,
        cacheStatus: "refreshed",
        degraded: warnings.length > 0,
        warnings
      };
    }

    if (fallbackCachePayload) {
      return {
        rangeStart: parsed.data.start,
        rangeEnd: parsed.data.end,
        timezone: parsed.data.timezone,
        events: fallbackCachePayload.events,
        sources: fallbackCachePayload.sources,
        cacheStatus: "stale",
        degraded: true,
        warnings: [...fallbackCachePayload.warnings, ...warnings]
      };
    }

    if (enabledSources.length === 0) {
      warnings.push({
        code: "NO_ENABLED_SOURCES",
        message: "No enabled calendar sources yet."
      });
    } else {
      warnings.push({
        code: "NO_CALENDAR_DATA",
        message: "Calendar events are unavailable and no saved data is available yet."
      });
    }

    return {
      rangeStart: parsed.data.start,
      rangeEnd: parsed.data.end,
      timezone: parsed.data.timezone,
      events: [],
      sources,
      cacheStatus: "miss",
      degraded: true,
      warnings
    };
  });
};
