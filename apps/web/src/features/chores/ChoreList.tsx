import { ChoreCard } from "./ChoreCard";

type ChoreItem = {
  id: string;
  title: string;
  points: number;
  assignedPersonName?: string | null;
  completed: boolean;
};

export function ChoreList({
  chores,
  onToggle
}: {
  chores: ChoreItem[];
  onToggle: (chore: ChoreItem, nextCompleted: boolean) => void;
}): JSX.Element {
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">Today's chores</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {chores.map((chore) => (
          <ChoreCard
            key={chore.id}
            {...chore}
            onToggle={(nextCompleted) => onToggle(chore, nextCompleted)}
          />
        ))}
      </div>
    </section>
  );
}
