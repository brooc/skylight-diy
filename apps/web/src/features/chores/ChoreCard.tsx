type ChoreCardProps = {
  id: string;
  title: string;
  points: number;
  assignedPersonName?: string | null;
  completed: boolean;
  onToggle: (nextCompleted: boolean) => void;
};

export function ChoreCard({
  title,
  points,
  assignedPersonName,
  completed,
  onToggle
}: ChoreCardProps): JSX.Element {
  return (
    <article className="grid gap-3 rounded-md border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-slate-400">{assignedPersonName ?? "Unassigned"}</p>
        </div>
        <span className="rounded-md bg-slate-800 px-2 py-1 text-sm">{points} pts</span>
      </div>
      <button
        type="button"
        className={`rounded-md px-3 py-2 text-sm font-medium ${
          completed
            ? "bg-emerald-700 text-white hover:bg-emerald-600"
            : "bg-slate-700 text-slate-100 hover:bg-slate-600"
        }`}
        onClick={() => onToggle(!completed)}
      >
        {completed ? "Completed" : "Mark complete"}
      </button>
    </article>
  );
}
