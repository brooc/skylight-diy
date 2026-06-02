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
  const palettes = [
    { card: "bg-[#fbeef0] border-[#f3d9df]", chip: "bg-[#f8dce3]" },
    { card: "bg-[#eef7f7] border-[#cfe8e6]", chip: "bg-[#d9eeec]" },
    { card: "bg-[#f3f0fa] border-[#dfd8ef]", chip: "bg-[#e6e0f3]" },
    { card: "bg-[#faf5e9] border-[#ecdfc4]", chip: "bg-[#f4e8d1]" }
  ] as const;
  const key = (assignedPersonName ?? title).charCodeAt(0) || 0;
  const palette = palettes[key % palettes.length] ?? palettes[0]!;

  return (
    <article className={`grid gap-3 rounded-md border p-4 ${palette.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-600">{assignedPersonName ?? "Unassigned"}</p>
        </div>
        <span className={`rounded-md px-2 py-1 text-sm font-medium text-slate-700 ${palette.chip}`}>
          {points} pts
        </span>
      </div>
      <button
        type="button"
        className={`min-h-[44px] rounded-md px-3 py-2 text-sm font-semibold ${
          completed
            ? "bg-emerald-600 text-white hover:bg-emerald-500"
            : "bg-[#0f766e] text-white hover:bg-[#0d5f59]"
        }`}
        onClick={() => onToggle(!completed)}
      >
        {completed ? "Completed" : "Mark complete"}
      </button>
    </article>
  );
}
