export type TimedEventInterval = {
  id: string;
  start: number;
  end: number;
};

export type TimedEventLayout = {
  id: string;
  column: number;
  columnCount: number;
};

/**
 * Assigns overlapping intervals to side-by-side columns. Intervals that only
 * touch at a boundary do not overlap and can reuse the same column.
 */
export function layoutTimedEvents(events: TimedEventInterval[]): TimedEventLayout[] {
  const sorted = [...events].sort(
    (left, right) =>
      left.start - right.start || left.end - right.end || left.id.localeCompare(right.id)
  );
  const layouts: TimedEventLayout[] = [];

  for (let groupStart = 0; groupStart < sorted.length; ) {
    let groupEnd = groupStart + 1;
    let latestEnd = sorted[groupStart]!.end;

    while (groupEnd < sorted.length && sorted[groupEnd]!.start < latestEnd) {
      latestEnd = Math.max(latestEnd, sorted[groupEnd]!.end);
      groupEnd += 1;
    }

    const group = sorted.slice(groupStart, groupEnd);
    const active: Array<{ column: number; end: number }> = [];
    const groupLayouts: Array<{ id: string; column: number }> = [];
    let columnCount = 1;

    for (const event of group) {
      for (let index = active.length - 1; index >= 0; index -= 1) {
        if (active[index]!.end <= event.start) active.splice(index, 1);
      }

      const occupiedColumns = new Set(active.map((item) => item.column));
      let column = 0;
      while (occupiedColumns.has(column)) column += 1;

      active.push({ column, end: event.end });
      groupLayouts.push({ id: event.id, column });
      columnCount = Math.max(columnCount, active.length, column + 1);
    }

    layouts.push(...groupLayouts.map((layout) => ({ ...layout, columnCount })));
    groupStart = groupEnd;
  }

  return layouts;
}
