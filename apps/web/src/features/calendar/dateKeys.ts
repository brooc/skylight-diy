export function dateKeyInTimeZone(value: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(typeof value === "string" ? new Date(value) : value);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function formatDateKey(
  dateKey: string,
  options: Intl.DateTimeFormatOptions,
  locale?: string | string[]
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
    new Date(`${dateKey}T00:00:00.000Z`)
  );
}

export function dateFromLocalDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

export function startOfWeekDateKey(
  dateKey: string,
  weekStartsOn: "sunday" | "monday"
): string {
  const dayOfWeek = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  const firstDay = weekStartsOn === "monday" ? 1 : 0;
  const daysSinceStart = (dayOfWeek - firstDay + 7) % 7;
  return shiftDateKey(dateKey, -daysSinceStart);
}
