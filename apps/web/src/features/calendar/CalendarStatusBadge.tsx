export function CalendarStatusBadge({
  cacheStatus
}: {
  cacheStatus: "fresh" | "refreshed" | "stale" | "miss";
}): JSX.Element {
  const label =
    cacheStatus === "fresh"
      ? "Up to date"
      : cacheStatus === "refreshed"
        ? "Just refreshed"
        : cacheStatus === "stale"
          ? "Showing saved data"
          : "No calendar data";

  const style =
    cacheStatus === "fresh" || cacheStatus === "refreshed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : cacheStatus === "stale"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-300 bg-white text-slate-700";

  return <span className={`rounded-md border px-2 py-1 text-xs font-medium ${style}`}>{label}</span>;
}
