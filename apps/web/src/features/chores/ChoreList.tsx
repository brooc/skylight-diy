import { ChoreCard } from "./ChoreCard";

type ChoreItem = {
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
};

export function ChoreList({
  chores,
  onToggle,
  onEdit,
  onRemove
}: {
  chores: ChoreItem[];
  onToggle: (chore: ChoreItem, nextCompleted: boolean) => void;
  onEdit?: (chore: ChoreItem) => void;
  onRemove?: (chore: ChoreItem) => void;
}): JSX.Element {
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold text-slate-900">Today's tasks</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {chores.map((chore) => (
          <ChoreCard
            key={chore.id}
            {...chore}
            onToggle={(nextCompleted) => onToggle(chore, nextCompleted)}
            onEdit={onEdit ? () => onEdit(chore) : undefined}
            onRemove={onRemove ? () => onRemove(chore) : undefined}
          />
        ))}
      </div>
    </section>
  );
}
