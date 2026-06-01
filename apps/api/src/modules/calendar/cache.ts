import { calendarEventCache } from "@skylight-diy/db";
import { and, eq } from "drizzle-orm";

type CachePayload = {
  rangeStart: string;
  rangeEnd: string;
  timezone: string;
  events: Array<{
    id: string;
    title: string;
    start: string;
    end: string;
    isAllDay: boolean;
    sourceName?: string;
    color?: string | null;
  }>;
  sources: Array<{
    id: string;
    connectedAccountId?: string;
    externalCalendarId?: string;
    displayName: string;
    color?: string | null;
    enabled: boolean;
    personId?: string | null;
  }>;
  warnings: Array<{ code: string; message: string; sourceId?: string }>;
};

export function buildCalendarCacheKey(input: {
  rangeStart: string;
  rangeEnd: string;
  timezone: string;
  sourceFingerprint: string;
}): string {
  return `${input.rangeStart}|${input.rangeEnd}|${input.timezone}|${input.sourceFingerprint}`;
}

export function buildSourceFingerprint(
  sources: Array<{
    id: string;
    enabled: boolean;
    externalCalendarId: string;
  }>
): string {
  return sources
    .map((source) => `${source.id}:${source.externalCalendarId}:${source.enabled ? "1" : "0"}`)
    .sort()
    .join(",");
}

export async function readCalendarCache(
  db: any,
  householdId: string,
  cacheKey: string
): Promise<
  | { status: "miss" }
  | { status: "fresh"; payload: CachePayload }
  | { status: "stale"; payload: CachePayload }
> {
  const [row] = await db
    .select({
      payload: calendarEventCache.payloadJsonb,
      expiresAt: calendarEventCache.expiresAt,
      staleUntil: calendarEventCache.staleUntil
    })
    .from(calendarEventCache)
    .where(and(eq(calendarEventCache.householdId, householdId), eq(calendarEventCache.cacheKey, cacheKey)))
    .limit(1);

  if (!row) {
    return { status: "miss" };
  }

  const now = Date.now();
  const expiresAt = new Date(row.expiresAt).getTime();
  const staleUntil = new Date(row.staleUntil).getTime();
  const payload = row.payload as CachePayload;

  if (now <= expiresAt) {
    return { status: "fresh", payload };
  }
  if (now <= staleUntil) {
    return { status: "stale", payload };
  }
  return { status: "miss" };
}

export async function writeCalendarCache(
  db: any,
  input: {
    householdId: string;
    cacheKey: string;
    rangeStart: string;
    rangeEnd: string;
    timezone: string;
    sourceFingerprint: string;
    payload: CachePayload;
    freshTtlSeconds: number;
    staleTtlSeconds: number;
  }
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.freshTtlSeconds * 1000);
  const staleUntil = new Date(now.getTime() + (input.freshTtlSeconds + input.staleTtlSeconds) * 1000);

  await db
    .insert(calendarEventCache)
    .values({
      householdId: input.householdId,
      cacheKey: input.cacheKey,
      rangeStart: new Date(input.rangeStart),
      rangeEnd: new Date(input.rangeEnd),
      timezone: input.timezone,
      sourceFingerprint: input.sourceFingerprint,
      payloadJsonb: input.payload,
      fetchedAt: now,
      expiresAt,
      staleUntil,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [calendarEventCache.householdId, calendarEventCache.cacheKey],
      set: {
        rangeStart: new Date(input.rangeStart),
        rangeEnd: new Date(input.rangeEnd),
        timezone: input.timezone,
        sourceFingerprint: input.sourceFingerprint,
        payloadJsonb: input.payload,
        fetchedAt: now,
        expiresAt,
        staleUntil,
        updatedAt: now
      }
    });
}
