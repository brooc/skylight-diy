import { memberAppearance } from "../family/memberAppearance";

type ChoreCardProps = {
  id: string;
  title: string;
  points: number;
  assignedPersonName?: string | null;
  assignedPersonColor?: string | null;
  assignedPersonId?: string | null;
  frequency?: "daily" | "weekly" | "once";
  dueDate?: string | null;
  weekdays?: string[] | null;
  completedByPersonName?: string | null;
  completed: boolean;
  showAssignee?: boolean;
  onToggle: (nextCompleted: boolean) => void;
  onEdit?: () => void;
  onRemove?: () => void;
};

export function ChoreCard({
  title,
  points,
  assignedPersonName,
  assignedPersonColor,
  frequency = "daily",
  dueDate,
  weekdays,
  completedByPersonName,
  completed,
  showAssignee = true,
  onToggle,
  onEdit,
  onRemove
}: ChoreCardProps): JSX.Element {
  const palettes = [
    { card: "bg-[#fbeef0] border-[#f3d9df]", chip: "bg-[#f8dce3]" },
    { card: "bg-[#eef7f7] border-[#cfe8e6]", chip: "bg-[#d9eeec]" },
    { card: "bg-[#f3f0fa] border-[#dfd8ef]", chip: "bg-[#e6e0f3]" },
    { card: "bg-[#faf5e9] border-[#ecdfc4]", chip: "bg-[#f4e8d1]" }
  ] as const;
  const key = (assignedPersonName ?? title).charCodeAt(0) || 0;
  const palette = palettes[key % palettes.length] ?? palettes[0]!;
  const appearance = assignedPersonColor
    ? memberAppearance(assignedPersonColor, "#0f766e")
    : null;
  const scheduleLabel = frequency === "daily"
    ? "Every day"
    : frequency === "once"
      ? `Once${dueDate ? ` · ${new Date(`${dueDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}`
      : `Weekly · ${(weekdays ?? []).join(", ")}`;

  return (
    <article
      className={`grid gap-3 rounded-md border p-4 ${appearance ? "" : palette.card}`}
      style={
        appearance
          ? { backgroundColor: appearance.soft, borderColor: appearance.border }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-600">
            {showAssignee
              ? `${assignedPersonName ?? "Anyone"} · ${scheduleLabel}`
              : scheduleLabel}
          </p>
          {completed && completedByPersonName ? <p className="text-xs text-slate-500">Completed by {completedByPersonName}</p> : null}
        </div>
        <span
          className={`rounded-md px-2 py-1 text-sm font-medium text-slate-700 ${
            appearance ? "" : palette.chip
          }`}
          style={appearance ? { backgroundColor: appearance.chip } : undefined}
        >
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
      {onEdit || onRemove ? (
        <div className="flex gap-2 border-t border-black/5 pt-2">
          {onEdit ? <button type="button" className="min-h-[40px] flex-1 rounded-md bg-white/70 px-3 text-sm font-semibold text-slate-700" onClick={onEdit}>Edit</button> : null}
          {onRemove ? <button type="button" className="min-h-[40px] flex-1 rounded-md bg-white/70 px-3 text-sm font-semibold text-rose-700" onClick={onRemove}>Remove</button> : null}
        </div>
      ) : null}
    </article>
  );
}
