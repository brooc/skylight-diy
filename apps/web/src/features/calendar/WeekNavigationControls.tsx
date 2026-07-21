import {
  toolbarIconButtonClass,
  toolbarPillButtonClass,
} from "../../components/toolbarButtonStyles";

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
  return (
    <>
      <button
        type="button"
        aria-label="Previous week"
        className={toolbarIconButtonClass}
        onClick={onPrevious}
      >
        ‹
      </button>
      <button
        type="button"
        className={toolbarPillButtonClass}
        onClick={onToday}
      >
        Today
      </button>
      <button
        type="button"
        aria-label="Next week"
        className={toolbarIconButtonClass}
        onClick={onNext}
      >
        ›
      </button>
      <button
        type="button"
        disabled={isRefreshing}
        className={toolbarPillButtonClass}
        onClick={onRefresh}
      >
        {isRefreshing ? "Refreshing…" : "Refresh"}
      </button>
    </>
  );
}
