export function WeekNavigationControls({
  isRefreshing,
  onNext,
  onPrevious,
  onRefresh,
  onToday,
}: {
  isRefreshing: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onRefresh: () => void;
  onToday: () => void;
}): JSX.Element {
  const roundButtonClass =
    "flex h-10 w-10 items-center justify-center rounded-full border border-[#d8cbb8] bg-[#fff7ea] text-xl text-slate-700 hover:bg-[#fcedd8]";

  return (
    <>
      <button
        type="button"
        aria-label="Previous week"
        className={roundButtonClass}
        onClick={onPrevious}
      >
        ‹
      </button>
      <button
        type="button"
        className="min-h-[40px] rounded-full border border-[#d8cbb8] bg-[#fff7ea] px-3 text-sm font-semibold text-slate-700 hover:bg-[#fcedd8]"
        onClick={onToday}
      >
        Today
      </button>
      <button
        type="button"
        aria-label="Next week"
        className={roundButtonClass}
        onClick={onNext}
      >
        ›
      </button>
      <button
        type="button"
        disabled={isRefreshing}
        className="min-h-[40px] rounded-md border border-[#d8cbb8] bg-[#fff7ea] px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-[#fcedd8] disabled:opacity-60"
        onClick={onRefresh}
      >
        {isRefreshing ? "Refreshing…" : "Refresh"}
      </button>
    </>
  );
}
