import { ChoreCard } from "./ChoreCard";
import { memberAppearance } from "../family/memberAppearance";

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

type ChorePerson = {
  personId: string;
  displayName: string;
  color: string;
};

export function ChoreList({
  chores,
  people,
  showCompleted,
  onToggle,
  onEdit,
  onRemove
}: {
  chores: ChoreItem[];
  people: ChorePerson[];
  showCompleted: boolean;
  onToggle: (chore: ChoreItem, nextCompleted: boolean) => void;
  onEdit?: (chore: ChoreItem) => void;
  onRemove?: (chore: ChoreItem) => void;
}): JSX.Element {
  const groups = [
    ...people.map((person) => ({
      id: person.personId,
      name: person.displayName,
      color: person.color,
      tasks: chores.filter(
        (chore) => chore.assignedPersonId === person.personId,
      ),
    })),
    ...(chores.some((chore) => !chore.assignedPersonId)
      ? [
          {
            id: "family",
            name: "Family",
            color: "#d8c49a",
            tasks: chores.filter((chore) => !chore.assignedPersonId),
          },
        ]
      : []),
  ];

  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold text-slate-900">Today's tasks</h2>
      <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => {
          const appearance = memberAppearance(group.color, "#0f766e");
          const completedCount = group.tasks.filter(
            (task) => task.completed,
          ).length;
          const visibleTasks = showCompleted
            ? group.tasks
            : group.tasks.filter((task) => !task.completed);
          const percentage = group.tasks.length
            ? Math.round((completedCount / group.tasks.length) * 100)
            : 0;

          return (
            <article
              key={group.id}
              aria-label={`${group.name} tasks`}
              className="grid min-w-0 gap-3 rounded-xl border p-3"
              style={{
                backgroundColor: appearance.soft,
                borderColor: appearance.border,
              }}
            >
              <header className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-slate-800"
                      style={{ backgroundColor: appearance.chip }}
                    >
                      {group.name.slice(0, 1).toLocaleUpperCase()}
                    </span>
                    <h3 className="truncate font-semibold text-slate-900">
                      {group.name}
                    </h3>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-slate-600">
                    {completedCount} of {group.tasks.length}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${group.name} task progress`}
                  aria-valuemin={0}
                  aria-valuemax={group.tasks.length}
                  aria-valuenow={completedCount}
                  className="h-2 overflow-hidden rounded-full bg-white/80"
                >
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </header>

              <div className="grid gap-2">
                {visibleTasks.map((chore) => (
                  <ChoreCard
                    key={chore.id}
                    {...chore}
                    showAssignee={false}
                    onToggle={(nextCompleted) =>
                      onToggle(chore, nextCompleted)
                    }
                    onEdit={onEdit ? () => onEdit(chore) : undefined}
                    onRemove={onRemove ? () => onRemove(chore) : undefined}
                  />
                ))}
                {visibleTasks.length === 0 ? (
                  <p className="rounded-lg bg-white/70 px-3 py-4 text-center text-sm font-medium text-slate-600">
                    {group.tasks.length === 0
                      ? "No tasks today"
                      : "All done for today"}
                  </p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
