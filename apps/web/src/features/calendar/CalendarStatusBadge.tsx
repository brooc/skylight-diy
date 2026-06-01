export function CalendarStatusBadge({
  cacheStatus
}: {
  cacheStatus: "fresh" | "refreshed" | "stale" | "miss";
}): JSX.Element {
  const style =
    cacheStatus === "fresh" || cacheStatus === "refreshed"
      ? "bg-emerald-900/40 text-emerald-200 border-emerald-700"
      : cacheStatus === "stale"
        ? "bg-amber-900/40 text-amber-100 border-amber-700"
        : "bg-slate-800 text-slate-200 border-slate-700";

  return <span className={`rounded-md border px-2 py-1 text-xs ${style}`}>{cacheStatus}</span>;
}
